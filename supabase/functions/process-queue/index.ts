// Supabase Edge Function: process-queue
//
// Server-side processor for the fetch_queue table. Every minute (via the
// pg_cron schedule in supabase/migrations/process_queue_push.sql) it:
//
//  1. Claims up to 3 queued YouTube rows the app's local worker hasn't
//     finished within 90 seconds (app closed or backgrounded). The claim is
//     atomic, so the app's local worker and this function never process the
//     same row. Non-YouTube rows are left for the local worker (v1 scope).
//  2. Processes each claimed row with the same pipeline the app runs locally
//     (src/lib/importWorker.ts fetchYouTube): YouTube oEmbed title ->
//     caption-first TMDB match -> Gemini fallback (via the gemini-titles
//     function over HTTP) -> unverified items for titles TMDB can't match.
//     Starts are staggered 2s apart, max 3 rows per run (Harpreet's rate
//     limits). Writes go to movie_cache / user_movies via the service role.
//  3. Sends one batched Expo push per user for rows finished since the last
//     notification: "N movies found from M videos" (Harpreet's verbatim
//     copy). Rows that added nothing, or have no push token, are marked
//     notified without a push.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (built in),
//      TMDB_API_KEY (Harpreet sets it as a function secret in the dashboard).
// Never throws: every failure path returns HTTP 200 { processed: n }.

// @ts-ignore - Deno-only specifier; the app's tsc cannot resolve `npm:` imports.
// eslint-disable-next-line import/no-unresolved -- Deno resolves `npm:` at runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

// Keeps the app's `tsc --noEmit` (which type-checks **/*.ts) at its
// pre-existing baseline; Deno provides the real global at runtime.
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TMDB_BASE = "https://api.themoviedb.org/3";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// 90s grace: the app's local worker gets first crack at a queued row while
// the app is open; the server only picks up rows it left behind.
const CLAIM_GRACE_MS = 90_000;
const MAX_ROWS_PER_RUN = 3;
const STAGGER_MS = 2_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Ports from the app — behavior copied verbatim from src/lib.        */
/* ------------------------------------------------------------------ */

interface TmdbMatch {
  tmdbID: number;
  title: string;
  mediaType: "movie" | "tv";
  year: number;
  genres: string[];
  overview: string;
  posterPath: string;
  popularity: number;
  originalLanguage: string;
}

/** TMDB genre IDs rarely change, so they are bundled instead of fetched. (src/lib/genres.ts) */
const GENRE_NAMES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics",
};

function genreNames(ids: number[]): string[] {
  const seen: string[] = [];
  for (const id of ids) {
    const name = GENRE_NAMES[id];
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/** Human-readable language name from a TMDB ISO 639-1 code. (src/lib/tmdb.ts) */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", hi: "Hindi", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean",
  zh: "Mandarin Chinese", ar: "Arabic", bn: "Bengali", te: "Telugu", ta: "Tamil",
  ml: "Malayalam", kn: "Kannada", mr: "Marathi", pa: "Punjabi", id: "Indonesian",
  nl: "Dutch", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
  pl: "Polish", tr: "Turkish", el: "Greek", he: "Hebrew", th: "Thai",
  vi: "Vietnamese", ms: "Malay", uk: "Ukrainian",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code?.toLowerCase()] ?? "";
}

/**
 * The shared row id for a movie: the real TMDB id when there is one,
 * otherwise an FNV-1a hash of title|year|mediaType (negative, so it can
 * never collide with a TMDB id). Verbatim from cacheIdFor in src/lib/sync.ts.
 */
function cacheIdFor(m: { tmdbID: number; title: string; year: number; mediaType: string }): number {
  if (m.tmdbID > 0) return m.tmdbID;
  let h = 2166136261;
  const s = `${m.title}|${m.year}|${m.mediaType}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -((h >>> 0) + 1);
}

/** Parse a YouTube video id from watch / Shorts / youtu.be URLs, or null. (src/lib/youtube.ts) */
function parseYouTubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  const ok = (v: string | null): string | null =>
    v && idPattern.test(v) ? v : null;
  if (
    host === "www.youtube.com" ||
    host === "youtube.com" ||
    host === "m.youtube.com"
  ) {
    if (u.pathname === "/watch") return ok(u.searchParams.get("v"));
    const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shorts) return ok(shorts[1]);
    return null;
  }
  if (host === "youtu.be") {
    return ok(u.pathname.split("/").filter(Boolean)[0] ?? null);
  }
  return null;
}

interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  author: string;
}

/**
 * Keyless video title/author via YouTube's public oEmbed endpoint.
 * Returns null for private, removed, or otherwise unreadable videos. (src/lib/youtube.ts)
 */
async function fetchYouTubeTitle(url: string): Promise<YouTubeVideoInfo | null> {
  const videoId = parseYouTubeId(url);
  if (!videoId) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = (data?.title ?? "").trim();
    if (!title) return null;
    return { videoId, title, author: (data?.author_name ?? "").trim() };
  } catch {
    return null;
  }
}

/**
 * fetch with a 6s timeout: a hung TMDB request must never stall the queue
 * processor. (src/lib/tmdb.ts)
 */
async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Likely title phrases from messy text: quoted phrases first, then short lines. (src/lib/tmdb.ts) */
function candidates(text: string): string[] {
  const ordered: string[] = [];
  const add = (value: string) => {
    let t = value.trim();
    // Strip list numbering/bullets: "1. ", "2) ", "- ", "• ".
    t = t.replace(/^(\d{1,3}[.)]\s*|[-*•]\s*)+/, "");
    // Raw year-stripped variants: strip a trailing year ONLY if it's in
    // [1900, current year] — never numbers that are part of the title
    // ("Blade Runner 2049"). Keep both stripped and unstripped variants so
    // titles that legitimately end in a year-number still match. The strips
    // must run BEFORE the special-chars cleaning below, which would eat
    // the separators first.
    const variants = new Set<string>([t]);
    const inYearRange = (y: number) => y >= 1900 && y <= new Date().getFullYear();
    let ym: RegExpExecArray | null;
    if ((ym = /\s*\((\d{4})\)\s*$/.exec(t)) !== null && inYearRange(Number(ym[1]))) {
      variants.add(t.slice(0, ym.index)); // "Devs (2020)" -> "Devs"
    }
    if ((ym = /\s*[|\-–—:]\s*(\d{4})\s*$/.exec(t)) !== null && inYearRange(Number(ym[1]))) {
      variants.add(t.slice(0, ym.index)); // "The Witches | 2020" -> "The Witches"
    }
    // Bare trailing year ("Devs 2020") — the lookbehind excludes years
    // preceded by a separator ("Avatar - 2009"), which the strip above
    // already covers; without it we'd emit a junk "Avatar -" variant.
    if ((ym = /(?<![|\-–—:])\s+(\d{4})\s*$/.exec(t)) !== null && inYearRange(Number(ym[1]))) {
      variants.add(t.slice(0, ym.index)); // "Devs 2020" -> "Devs"
    }
    for (const variant of variants) {
      let c = variant;
      // Ignore special characters: drop emoji/symbols, keep letters, numbers,
      // spaces and the few punctuation marks titles use.
      c = c.replace(/[^\p{L}\p{N}\s'&:,-]/gu, "").replace(/\s+/g, " ").trim();
      c = c.replace(/[@#]\w+/g, "").trim();
      if (c.length < 2 || c.length > 60) continue;
      if (c.split(/\s+/).length > 8) continue;
      if (!ordered.includes(c)) ordered.push(c);
    }
  };
  const quoteRe = /"([^"]+)"|'([^']+)'|“([^”]+)”/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRe.exec(text)) !== null) {
    for (let i = 1; i <= 3; i++) if (m[i]) add(m[i]);
  }
  for (const line of text.split("\n")) add(line);
  return ordered;
}

/**
 * Lowercase, strip punctuation, collapse spaces — so a TMDB title like
 * "Why Did I Get Married Again?" still matches a query like
 * "Why Did I Get Married Again 2026". (src/lib/tmdb.ts)
 */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(resultTitle: string, candidate: string, popularity: number): number {
  const title = normTitle(resultTitle);
  const query = normTitle(candidate);
  let s = 0;
  if (title === query) s += 100;
  else if (query.includes(title) || title.includes(query)) s += 50;
  else return 0;
  s += Math.min(popularity, 40);
  return s;
}

interface RawItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  genre_ids?: number[];
  original_language?: string;
}

async function searchMulti(query: string, apiKey: string): Promise<TmdbMatch[] | null> {
  try {
    const url =
      `${TMDB_BASE}/search/multi?api_key=${encodeURIComponent(apiKey)}` +
      `&query=${encodeURIComponent(query)}&include_adult=false`;
    const res = await timedFetch(url);
    if (!res.ok) {
      // A bad/revoked key degrades to no-match (and a log line) — the row
      // then falls through to the Gemini path below.
      if (res.status === 401 || res.status === 403) {
        console.error(`process-queue: TMDB key rejected (${res.status})`);
      }
      return null;
    }
    const json = (await res.json()) as { results?: RawItem[] };
    return (json.results ?? []).flatMap((item) => {
      const mediaType = item.media_type;
      const title = item.title ?? item.name;
      if ((mediaType !== "movie" && mediaType !== "tv") || !title) return [];
      const dateStr = item.release_date ?? item.first_air_date ?? "";
      const year = parseInt(dateStr.slice(0, 4), 10) || 0;
      return [{
        tmdbID: item.id,
        title,
        mediaType,
        year,
        genres: genreNames(item.genre_ids ?? []),
        overview: item.overview ?? "",
        posterPath: item.poster_path ?? "",
        popularity: item.popularity ?? 0,
        originalLanguage: languageName(item.original_language ?? ""),
      }];
    });
  } catch {
    return null;
  }
}

/** Best TMDB match for free text, or null when nothing matches confidently. (src/lib/tmdb.ts) */
async function bestMatch(text: string, apiKey: string): Promise<TmdbMatch | null> {
  if (!apiKey || !text) return null;
  const cands = candidates(text).slice(0, 6);
  const scored = await Promise.all(
    cands.map(async (candidate) => {
      const results = await searchMulti(candidate, apiKey);
      if (!results) return null;
      let top: { match: TmdbMatch; score: number } | null = null;
      for (const r of results) {
        const s = score(r.title, candidate, r.popularity);
        if (s >= 60 && (!top || s > top.score)) top = { match: r, score: s };
      }
      return top;
    }),
  );
  // Exact title match (score 100): return it immediately, first candidate wins.
  for (const top of scored) {
    if (top && top.score === 100) return top.match;
  }
  let best: { match: TmdbMatch; score: number } | null = null;
  for (const top of scored) {
    if (top && (!best || top.score > best.score)) best = top;
  }
  return best?.match ?? null;
}

/**
 * Every confident title match in the text — for videos that list multiple
 * titles ("1. Devs (2020)", "2. Fringe (2008)", ...). Runs each candidate
 * through the keyed search and keeps every result scoring ≥ 60,
 * deduplicated. Requests are paced with one retry so a throttled response
 * can't silently drop a title. Returns [] when nothing matches. (src/lib/tmdb.ts)
 */
async function bestMatches(text: string, apiKey?: string): Promise<TmdbMatch[]> {
  if (!text) return [];
  const found: TmdbMatch[] = [];
  const seen = new Set<string>();
  // "Label: value" lines are caption metadata, not titles — skip them.
  const list = candidates(text).filter((c) => !/^[A-Za-z]{2,12}:/.test(c)).slice(0, 10);
  // Caption-level hint ("series"/"movie") breaks exact movie-vs-tv title ties.
  const tvHint = /\b(series|shows?|seasons?|episodes?)\b/i.test(text);
  const movieHint = /\bfilms?\b|\bmovies?\b/i.test(text);
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(250);
    const candidate = list[i];
    let results: TmdbMatch[] | null = null;
    for (let attempt = 0; attempt < 2 && (!results || results.length === 0); attempt++) {
      try {
        results = apiKey ? await searchMulti(candidate, apiKey) : [];
      } catch {
        results = null;
      }
      if (!results || results.length === 0) await sleep(400);
    }
    if (!results) continue;
    let best: { match: TmdbMatch; total: number } | null = null;
    for (const r of results) {
      const s = score(r.title, candidate, apiKey ? r.popularity : 0);
      if (s < 60) continue;
      // +1 only breaks exact ties — it can never beat a genuinely higher score.
      const hintBonus = (tvHint && r.mediaType === "tv") || (movieHint && r.mediaType === "movie") ? 1 : 0;
      const total = s + hintBonus;
      if (!best || total > best.total) best = { match: r, total };
    }
    if (best) {
      const key = `${best.match.title.toLowerCase()}|${best.match.year}|${best.match.mediaType}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push(best.match);
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Row processing                                                      */
/* ------------------------------------------------------------------ */

interface QueueRow {
  id: string;
  user_id: string;
  url: string;
  push_token: string | null;
}

interface MovieItem {
  title: string;
  year: number;
  mediaType: "movie" | "tv";
  tmdbID: number;
  overview: string;
  posterPath: string;
  genres: string[];
  originalLanguage: string;
}

function toMovieItem(m: TmdbMatch): MovieItem {
  return {
    title: m.title,
    year: m.year,
    mediaType: m.mediaType,
    tmdbID: m.tmdbID,
    overview: m.overview,
    posterPath: m.posterPath,
    genres: m.genres,
    originalLanguage: m.originalLanguage,
  };
}

/**
 * Gemini fallback over HTTP: reuses the gemini-titles function instead of
 * duplicating its model/retry logic. gemini-titles caps itself at 30s, so a
 * 40s client-side timeout is a hard backstop.
 */
async function callGeminiTitles(
  supabaseUrl: string,
  serviceKey: string,
  youtubeUrl: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/gemini-titles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ youtubeUrl }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const titles = data?.titles;
    return typeof titles === "string" && titles.trim() !== "" ? titles : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * YouTube import: oEmbed title (caption-first step), then TMDB match, then
 * Gemini fallback. Mirrors fetchYouTube in src/lib/importWorker.ts, minus
 * the duration check (oEmbed has no duration) and the per-match enrichment
 * (the local worker enriches the same rows on its next sync).
 */
async function processYouTubeRow(
  url: string,
  tmdbKey: string,
  gemini: { supabaseUrl: string; serviceKey: string },
): Promise<MovieItem[]> {
  if (!parseYouTubeId(url)) {
    throw new Error("That doesn't look like a YouTube link — use a watch, Shorts, or youtu.be link.");
  }
  const info = await fetchYouTubeTitle(url);
  if (!info) {
    throw new Error("Couldn't read that video (it may be private or removed).");
  }
  const match = await bestMatch(info.title, tmdbKey);
  if (match) return [toMovieItem(match)];

  // oEmbed title matched nothing — ask Gemini which movie titles the video
  // mentions or shows, then match each through TMDB.
  const geminiText = await callGeminiTitles(gemini.supabaseUrl, gemini.serviceKey, url);
  if (!geminiText) {
    throw new Error("Could not fetch any movie in this video.");
  }
  const matches = await bestMatches(geminiText, tmdbKey || undefined);
  // The same candidate list bestMatches ran internally: a Gemini title TMDB
  // couldn't match is saved unverified (title=raw, year 0, tmdbID 0).
  const rawCandidates = candidates(geminiText)
    .filter((c) => !/^[A-Za-z]{2,12}:/.test(c))
    .slice(0, 10);
  const effectiveCandidates = rawCandidates.length > 0
    ? rawCandidates
    // Gemini returned an unparseable blob (e.g. all titles on one long
    // line): save the raw non-empty lines as unverified rather than
    // marking the row done with zero results.
    : geminiText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 10);
  const norm = (s: string) => s.toLowerCase().replace(/\s*\(\d{4}\)\s*$/, "").trim();
  const usedMatches = new Set<TmdbMatch>();
  const items: MovieItem[] = [];
  for (const candidate of effectiveCandidates) {
    const m = matches.find((x) => !usedMatches.has(x) && norm(x.title) === norm(candidate));
    if (m) {
      usedMatches.add(m);
      items.push(toMovieItem(m));
    } else {
      items.push({
        title: candidate,
        year: 0,
        mediaType: "movie",
        tmdbID: 0,
        overview: "",
        posterPath: "",
        genres: [],
        originalLanguage: "",
      });
    }
  }
  return items;
}

/** Writes processed movies to movie_cache + user_movies (service role). */
async function writeItems(
  sb: ReturnType<typeof createClient>,
  userId: string,
  url: string,
  items: MovieItem[],
): Promise<void> {
  const now = new Date().toISOString();
  const cacheRows = items.map((i) => ({
    tmdb_id: cacheIdFor(i),
    media_type: i.mediaType,
    title: i.title,
    year: i.year || null,
    overview: i.overview || null,
    poster_path: i.posterPath || null,
    genres: i.genres,
    original_language: i.originalLanguage || null,
    imdb_rating: null,
    updated_at: now,
  }));
  const { error: cacheError } = await sb
    .from("movie_cache")
    .upsert(cacheRows, { onConflict: "tmdb_id" });
  if (cacheError) throw new Error(`movie_cache upsert: ${cacheError.message}`);

  const userRows = items.map((i) => ({
    user_id: userId,
    tmdb_id: cacheIdFor(i),
    status: "watchlist",
    notes: "",
    reel_url: url,
    date_added: now,
    updated_at: now,
  }));
  const { error: userError } = await sb
    .from("user_movies")
    .upsert(userRows, { onConflict: "user_id,tmdb_id" });
  if (userError) throw new Error(`user_movies upsert: ${userError.message}`);
}

interface DoneRow {
  id: string;
  user_id: string;
  result: { added?: number } | null;
  push_token: string | null;
}

/**
 * Batched push: one notification per user for rows finished since the last
 * notification. Rows that added nothing, or have no push token, are marked
 * notified without a push — failures never notify (the local worker shows
 * those in the queue UI).
 */
async function batchPush(sb: ReturnType<typeof createClient>): Promise<void> {
  const { data: rows, error } = await sb
    .from("fetch_queue")
    .select("id,user_id,result,push_token")
    .eq("status", "done")
    .is("notified_at", null);
  if (error || !rows || rows.length === 0) return;

  const byUser = new Map<string, { ids: string[]; videos: number; movies: number; token: string | null }>();
  for (const r of rows as DoneRow[]) {
    let g = byUser.get(r.user_id);
    if (!g) {
      g = { ids: [], videos: 0, movies: 0, token: null };
      byUser.set(r.user_id, g);
    }
    g.ids.push(r.id);
    g.videos += 1;
    g.movies += Number(r.result?.added ?? 0) || 0;
    if (!g.token && typeof r.push_token === "string" && r.push_token !== "") {
      g.token = r.push_token;
    }
  }

  for (const g of byUser.values()) {
    if (g.movies > 0 && g.token) {
      try {
        await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Harpreet's verbatim copy.
          body: JSON.stringify([{
            to: g.token,
            sound: "default",
            title: `🎬 ${g.movies} movies found from ${g.videos} videos`,
            body: "Tap to view your watchlist",
            data: { screen: "watchlist" },
          }]),
        });
      } catch {
        // Notification is best-effort; still mark the rows notified below.
      }
    }
    await sb.from("fetch_queue").update({ notified_at: new Date().toISOString() }).in("id", g.ids);
  }
}

async function run(): Promise<number> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("process-queue: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return 0;
  }
  const tmdbKey = Deno.env.get("TMDB_API_KEY") ?? "";
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Claim rows the app's local worker hasn't finished within the grace
  // window. YouTube-only in v1; everything else stays with the local worker.
  const graceCutoff = new Date(Date.now() - CLAIM_GRACE_MS).toISOString();
  const { data: rows, error } = await sb
    .from("fetch_queue")
    .select("id,user_id,url,push_token")
    .eq("status", "queued")
    .lt("created_at", graceCutoff)
    .or("url.like.%youtube.com%,url.like.%youtu.be%")
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error || !rows) {
    if (error) console.error(`process-queue: claim select failed: ${error.message}`);
    return 0;
  }

  let processed = 0;
  for (let i = 0; i < rows.length; i++) {
    // Harpreet's rate limits: 2s stagger between starts, max 3 per run.
    if (i > 0) await sleep(STAGGER_MS);
    const row = rows[i] as QueueRow;
    // Atomic claim — 0 rows affected means the app's local worker (or a
    // concurrent run) got there first.
    const { data: claimed } = await sb
      .from("fetch_queue")
      .update({ status: "processing" })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      const items = await processYouTubeRow(row.url, tmdbKey, { supabaseUrl, serviceKey });
      await writeItems(sb, row.user_id, row.url, items);
      const titles = [...new Set(items.map((x) => x.title))];
      await sb
        .from("fetch_queue")
        .update({ status: "done", result: { titles, added: items.length } })
        .eq("id", row.id);
      processed += 1;
    } catch (e) {
      // No server-side retries: a failed row stays failed; the next cron
      // run will not pick it up again.
      const message = e instanceof Error && e.message ? e.message : "Something went wrong.";
      await sb.from("fetch_queue").update({ status: "failed", error: message }).eq("id", row.id);
    }
  }

  try {
    await batchPush(sb);
  } catch (e) {
    console.error(`process-queue: batchPush failed: ${e instanceof Error ? e.message : e}`);
  }
  return processed;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  try {
    const processed = await run();
    return jsonResponse({ processed });
  } catch {
    return jsonResponse({ processed: 0 });
  }
});
