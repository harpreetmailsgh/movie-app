// Supabase Edge Function: trending-push
//
// Weekly check for fresh titles in Trending. Every run (via the pg_cron
// schedule in supabase/migrations/trending_push.sql, Friday 9:00 AM
// Toronto) it:
//
//  1. Fetches the SAME sources the phone's Trending list uses
//     (src/lib/trending.ts): the Netflix Canada top-10 JSON generated to
//     our repo, plus the Apple Canada iTunes RSS charts (movies + TV).
//  2. Normalizes to title + year + movie/TV, merges Netflix-first then
//     Apple, dedupes by normalized title + media type.
//  3. Compares with the `trending_snapshots` row for Canada. Zero new
//     titles -> zero pushes, snapshot still updated so the same titles
//     never re-trigger.
//  4. With >= 1 new title, sends ONE batched Expo push to every token in
//     `push_tokens` (one message per token in a single Expo push API call,
//     same as process-queue does), then saves the new snapshot.
//
// One push per run at most. Never throws: every failure path returns
// HTTP 200 { sent, newCount }. A failed push does NOT save the snapshot,
// so the next run retries the same new titles instead of swallowing them.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (built in).
// No other secrets needed — both sources are keyless.

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

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const COUNTRY = "CA";

// Same URLs the phone uses (src/lib/trending.ts).
const NETFLIX_URL =
  "https://raw.githubusercontent.com/harpreetmailsgh/movie-app/trending-data/netflix/ca.json";
const APPLE_URL = (kind: "topmovies" | "toptvseasons"): string =>
  `https://itunes.apple.com/ca/rss/${kind}/limit=25/json`;

const FETCH_TIMEOUT_MS = 10_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/* Sources — ports from src/lib/trending.ts                            */
/* ------------------------------------------------------------------ */

interface TrendingTitle {
  title: string;
  year: number;
  mediaType: "movie" | "tv";
}

/** Lowercase, strip punctuation, collapse spaces — the phone's normTitle. */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identity for new-title comparison: normalized title + media type. */
function titleKey(t: TrendingTitle): string {
  return `${normTitle(t.title)}|${t.mediaType}`;
}

/** fetch with a timeout: a hung source must never stall the weekly run. */
async function timedFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface NetflixJsonEntry {
  rank?: number;
  title?: string;
  weeks_in_top_10?: number;
  season?: string;
}

interface NetflixJson {
  films?: NetflixJsonEntry[];
  tv?: NetflixJsonEntry[];
}

/**
 * Netflix Canada top 10 (films + TV, rank order). The JSON carries no
 * year, so year is 0 — the phone enriches it later via TMDB; here the
 * title + media type is the identity. Returns [] on any failure.
 */
async function fetchNetflix(): Promise<TrendingTitle[]> {
  try {
    const res = await timedFetch(NETFLIX_URL);
    if (!res.ok) return [];
    const data = (await res.json()) as NetflixJson;
    if (!data || !Array.isArray(data.films) || !Array.isArray(data.tv)) return [];
    const byRank = (a: NetflixJsonEntry, b: NetflixJsonEntry) =>
      (a.rank ?? 0) - (b.rank ?? 0);
    const items: TrendingTitle[] = [];
    for (const f of data.films.filter((e) => typeof e?.title === "string" && e.title.trim()).sort(byRank)) {
      items.push({ title: (f.title as string).trim(), year: 0, mediaType: "movie" });
    }
    for (const t of data.tv.filter((e) => typeof e?.title === "string" && e.title.trim()).sort(byRank)) {
      items.push({ title: (t.title as string).trim(), year: 0, mediaType: "tv" });
    }
    return items;
  } catch {
    return [];
  }
}

interface AppleEntry {
  "im:name"?: { label?: string };
  "im:releaseDate"?: { label?: string };
}

/** Year from an iTunes release-date label ("2024-03-15T07:00:00-07:00"), else 0. */
function yearFromReleaseDate(label: string | undefined): number {
  if (!label) return 0;
  const year = parseInt(label.slice(0, 4), 10);
  return Number.isFinite(year) && year >= 1900 && year <= new Date().getFullYear() + 1 ? year : 0;
}

async function fetchAppleFeed(kind: "topmovies" | "toptvseasons"): Promise<AppleEntry[]> {
  const res = await timedFetch(APPLE_URL(kind));
  if (!res.ok) throw new Error(`apple ${kind}: ${res.status}`);
  const data = await res.json();
  const entries = data?.feed?.entry;
  return Array.isArray(entries) ? (entries as AppleEntry[]) : [];
}

/** Apple Canada charts (movies + TV seasons, chart order). Throws on failure. */
async function fetchApple(): Promise<TrendingTitle[]> {
  const [movies, tv] = await Promise.all([
    fetchAppleFeed("topmovies"),
    fetchAppleFeed("toptvseasons"),
  ]);
  const items: TrendingTitle[] = [];
  for (const e of movies) {
    const title = e["im:name"]?.label?.trim();
    if (title) {
      items.push({ title, year: yearFromReleaseDate(e["im:releaseDate"]?.label), mediaType: "movie" });
    }
  }
  for (const e of tv) {
    const title = e["im:name"]?.label?.trim();
    if (title) {
      items.push({ title, year: yearFromReleaseDate(e["im:releaseDate"]?.label), mediaType: "tv" });
    }
  }
  if (!items.length) throw new Error("apple: no titles");
  return items;
}

/**
 * Merge Netflix (rank order) then Apple (chart order); dedupe by
 * normalized title + media type — the phone's mergeAndDedupe order.
 */
function mergeAndDedupe(netflix: TrendingTitle[], apple: TrendingTitle[]): TrendingTitle[] {
  const seen = new Set<string>();
  const out: TrendingTitle[] = [];
  for (const t of [...netflix, ...apple]) {
    const key = titleKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Push copy                                                           */
/* ------------------------------------------------------------------ */

/**
 * "🎬 New in Trending: {Title1}, {Title2} + {N} more" — shortened when
 * there are fewer new titles (1 -> just Title1, 2 -> Title1, Title2).
 */
function pushTitle(newTitles: TrendingTitle[]): string {
  const [first, second, ...rest] = newTitles;
  if (!first) return "🎬 New in Trending";
  if (!second) return `🎬 New in Trending: ${first.title}`;
  if (rest.length === 0) return `🎬 New in Trending: ${first.title}, ${second.title}`;
  return `🎬 New in Trending: ${first.title}, ${second.title} + ${rest.length} more`;
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

interface RunResult {
  sent: number;
  newCount: number;
}

async function run(): Promise<RunResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("trending-push: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return { sent: 0, newCount: 0 };
  }
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Same sources as the phone; each source fails soft to [] so one dead
  // feed never kills the run. Both dead -> nothing to compare: leave the
  // snapshot alone and report zero (next run retries).
  const [netflix, apple] = await Promise.all([
    fetchNetflix(),
    fetchApple().catch(() => [] as TrendingTitle[]),
  ]);
  const current = mergeAndDedupe(netflix, apple);
  if (!current.length) return { sent: 0, newCount: 0 };

  // Last sent title set for Canada; a missing row means "everything is
  // new" (first run after deploy).
  const { data: snapshot } = await sb
    .from("trending_snapshots")
    .select("titles")
    .eq("country", COUNTRY)
    .maybeSingle();
  const prevTitles = (snapshot?.titles ?? []) as TrendingTitle[];
  const prevKeys = new Set(prevTitles.map((t) => titleKey(t)));
  const newTitles = current.filter((t) => !prevKeys.has(titleKey(t)));

  const saveSnapshot = async (): Promise<void> => {
    const { error } = await sb.from("trending_snapshots").upsert(
      {
        country: COUNTRY,
        titles: current,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "country" },
    );
    if (error) console.error(`trending-push: snapshot save failed: ${error.message}`);
  };

  // Zero new titles -> zero pushes, snapshot still updated so the same
  // titles never re-trigger.
  if (newTitles.length === 0) {
    await saveSnapshot();
    return { sent: 0, newCount: 0 };
  }

  // Tokens first: if the token read fails, don't save the snapshot — the
  // next run retries the same new titles instead of swallowing them.
  const { data: tokenRows, error: tokenError } = await sb
    .from("push_tokens")
    .select("token");
  if (tokenError || !tokenRows) {
    console.error(`trending-push: token read failed: ${tokenError?.message ?? "no rows"}`);
    return { sent: 0, newCount: newTitles.length };
  }
  const tokens = (tokenRows as { token?: unknown }[])
    .map((r) => r.token)
    .filter((t): t is string => typeof t === "string" && t !== "");

  if (tokens.length > 0) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tokens.map((to) => ({
            to,
            sound: "default",
            title: pushTitle(newTitles),
            body: "Tap to see what's hot",
            data: { screen: "trending" },
          })),
        ),
      });
      if (!res.ok) {
        // Push failed: don't save the snapshot — next run retries.
        console.error(`trending-push: Expo push API rejected the batch (${res.status})`);
        return { sent: 0, newCount: newTitles.length };
      }
    } catch (e) {
      console.error(`trending-push: Expo push failed: ${e instanceof Error ? e.message : e}`);
      return { sent: 0, newCount: newTitles.length };
    }
  }

  await saveSnapshot();
  return { sent: tokens.length, newCount: newTitles.length };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  try {
    const result = await run();
    return jsonResponse(result);
  } catch {
    return jsonResponse({ sent: 0, newCount: 0 });
  }
});
