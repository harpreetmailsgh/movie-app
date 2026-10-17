import {
  bestMatch, bestMatchKeyless, bestMatches, candidates,
  fetchImdbRating, fetchKeylessMeta,
  TmdbMatch,
} from '../lib/tmdb';
import { parseYouTubeId, fetchYouTubeTitle } from '../lib/youtube';
import { isTikTokUrl, fetchTikTokInfo } from '../lib/tiktok';
import { fetchGeminiTitles } from '../lib/gemini';

export type WorkerResultItem = {
  title: string;
  unverified: boolean;
  caption?: string;
};

export type WorkerResult = {
  ok: boolean;
  results: WorkerResultItem[];
  error?: string;
  /** Fetched during processing (YouTube oEmbed title, TikTok caption). */
  videoTitle?: string | null;
};

export type WorkerDeps = {
  tmdbKey?: string;
  importReel: (url: string) => Promise<{
    ok: boolean;
    added: string[];
    alreadyHave: string[];
    savedForReview: { title: string; caption: string }[];
  }>;
  addMovie: (m: any) => void;
};

// Same iPhone Safari User-Agent pattern as fetchMp4Url in lib/frameOcr.ts.
// Copied from src/app/import.tsx (private helper there): this file is the
// extraction of that screen's doFetchYt logic, and existing files must not
// be modified.
const YT_IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * Best-effort YouTube video duration in seconds, scraped from the watch
 * page's embedded player JSON. Null when it can't be determined — the
 * caller proceeds anyway in that case. (Copied from import.tsx.)
 */
async function fetchYouTubeDurationSeconds(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': YT_IPHONE_SAFARI_UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = /"lengthSeconds":"(\d+)"/.exec(html);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Shared enrichment for every TMDB match: keyless matches carry a Cinemeta
 * id (one meta fetch returns rating, description, genres, cast); keyed
 * matches resolve the IMDb rating through TMDB. Identical to the per-branch
 * blocks in import.tsx's doFetchYt/doFetchTt.
 */
async function enrichMatch(match: TmdbMatch, tmdbKey?: string): Promise<{
  imdbRating: number; overview: string; genres: string[]; cast: string[];
}> {
  let imdbRating = 0, overview = match.overview, genres = match.genres;
  let cast: string[] = [];
  if (match.cinemetaId) {
    try {
      const meta = await fetchKeylessMeta(match.cinemetaId, match.mediaType);
      if (meta) {
        const r = parseFloat(meta.imdbRating ?? '');
        if (Number.isFinite(r)) imdbRating = r;
        if (meta.description) overview = meta.description;
        if (meta.genres?.length) genres = meta.genres.slice(0, 3);
        if (meta.cast?.length) cast = meta.cast.slice(0, 3);
      }
    } catch { /* keep the slim fields */ }
  } else {
    imdbRating = await fetchImdbRating(match.tmdbID, match.mediaType, match.title, tmdbKey ?? '');
  }
  return { imdbRating, overview, genres, cast };
}

/** YouTube import: oEmbed title (caption-first step), then TMDB/keyless match, then Gemini fallback. */
async function fetchYouTube(target: string, deps: WorkerDeps): Promise<WorkerResult> {
  if (!parseYouTubeId(target)) {
    return { ok: false, results: [], error: "That doesn't look like a YouTube link — use a watch, Shorts, or youtu.be link." };
  }
  const info = await fetchYouTubeTitle(target);
  if (!info) {
    return { ok: false, results: [], error: "Couldn't read that video (it may be private or removed)." };
  }
  const videoTitle = info.title;
  const caption = `${info.title} — ${info.author}`;
  const match = deps.tmdbKey
    ? await bestMatch(info.title, deps.tmdbKey)
    : await bestMatchKeyless(info.title);
  if (match) {
    const e = await enrichMatch(match, deps.tmdbKey);
    deps.addMovie({
      title: match.title, year: match.year, mediaType: match.mediaType, genres: e.genres,
      overview: e.overview, posterPath: match.posterPath, reelURL: target,
      caption, notes: '', status: 'watchlist', tmdbID: match.tmdbID, imdbRating: e.imdbRating,
      originalLanguage: match.originalLanguage, cast: e.cast,
      needsReview: false,
    });
    return { ok: true, results: [{ title: match.title, unverified: false }], videoTitle };
  }
  // oEmbed title matched nothing — fall back to Gemini: ask which movie
  // titles the video mentions or shows, then match each through TMDB.
  const durationSeconds = await fetchYouTubeDurationSeconds(target);
  if (durationSeconds !== null && durationSeconds > 300) {
    return { ok: false, results: [], error: 'Share a video up to 5 mins long.', videoTitle };
  }
  const geminiText = await fetchGeminiTitles(target);
  if (geminiText) {
    const matches = deps.tmdbKey
      ? await bestMatches(geminiText, deps.tmdbKey)
      : await bestMatches(geminiText);
    // Same candidate list bestMatches ran internally: a Gemini title TMDB
    // couldn't match is saved unverified (the TikTok no-match pattern).
    const rawCandidates = candidates(geminiText).filter((c) => !/^[A-Za-z]{2,12}:/.test(c)).slice(0, 10);
    const effectiveCandidates = rawCandidates.length > 0 ? rawCandidates
      // Gemini returned an unparseable blob (e.g. all titles on one long
      // line): save the raw non-empty lines as unverified rather than
      // clearing the queue item with zero results.
      : geminiText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 10);
    const norm = (s: string) => s.toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').trim();
    const usedMatches = new Set<TmdbMatch>();
    const results: WorkerResultItem[] = [];
    for (const candidate of effectiveCandidates) {
      const match = matches.find((m) => !usedMatches.has(m) && norm(m.title) === norm(candidate));
      if (match) {
        usedMatches.add(match);
        const e = await enrichMatch(match, deps.tmdbKey);
        deps.addMovie({
          title: match.title, year: match.year, mediaType: match.mediaType, genres: e.genres,
          overview: e.overview, posterPath: match.posterPath, reelURL: target,
          caption, notes: '', status: 'watchlist', tmdbID: match.tmdbID, imdbRating: e.imdbRating,
          originalLanguage: match.originalLanguage, cast: e.cast,
          needsReview: false,
        });
        results.push({ title: match.title, unverified: false });
      } else {
        deps.addMovie({
          title: candidate, year: 0, mediaType: 'movie', genres: [],
          overview: '', posterPath: '', reelURL: target,
          caption, notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
          originalLanguage: '', cast: [], needsReview: true,
        });
        results.push({ title: candidate, unverified: true, caption });
      }
    }
    return { ok: true, results, videoTitle };
  }
  return { ok: false, results: [], error: 'Could not fetch any movie in this video.', videoTitle };
}

/** TikTok import: oEmbed caption (caption-first step), then TMDB/keyless match; no match → save caption as-is for review. */
async function fetchTikTok(target: string, deps: WorkerDeps): Promise<WorkerResult> {
  if (!isTikTokUrl(target)) {
    return { ok: false, results: [], error: "That doesn't look like a TikTok link — use a tiktok.com or vm.tiktok.com link." };
  }
  const info = await fetchTikTokInfo(target);
  if (!info) {
    return { ok: false, results: [], error: "Couldn't read that video (it may be private or removed)." };
  }
  const videoTitle = info.caption;
  const caption = `${info.caption} — ${info.author}`;
  const match = deps.tmdbKey
    ? await bestMatch(info.caption, deps.tmdbKey)
    : await bestMatchKeyless(info.caption);
  if (match) {
    const e = await enrichMatch(match, deps.tmdbKey);
    deps.addMovie({
      title: match.title, year: match.year, mediaType: match.mediaType, genres: e.genres,
      overview: e.overview, posterPath: match.posterPath, reelURL: target,
      caption, notes: '', status: 'watchlist', tmdbID: match.tmdbID, imdbRating: e.imdbRating,
      originalLanguage: match.originalLanguage, cast: e.cast,
      needsReview: false,
    });
    return { ok: true, results: [{ title: match.title, unverified: false }], videoTitle };
  }
  deps.addMovie({
    title: info.caption, year: 0, mediaType: 'movie', genres: [],
    overview: '', posterPath: '', reelURL: target,
    caption, notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
    originalLanguage: '', cast: [], needsReview: true,
  });
  return { ok: true, results: [{ title: info.caption, unverified: true, caption }], videoTitle };
}

/** Facebook/Instagram reel import via the store's importReel (caption → TMDB → add). */
async function fetchReel(target: string, deps: WorkerDeps): Promise<WorkerResult> {
  const outcome = await deps.importReel(target);
  if (outcome.ok) {
    return {
      ok: true,
      results: [
        ...outcome.added.map((t) => ({ title: t, unverified: false })),
        ...outcome.alreadyHave.map((t) => ({ title: t, unverified: false })),
        ...outcome.savedForReview.map((t) => ({ title: t.title, unverified: true, caption: t.caption })),
      ].slice(0, 10),
    };
  }
  // Mirrors the store importReel messages shown inline on the Add screen.
  return {
    ok: false,
    results: [],
    error: /^https?:\/\//i.test(target)
      ? 'Couldn’t read that reel (it may be private). You can add the title manually below.'
      : 'That doesn’t look like a link — paste the full reel URL.',
  };
}

async function runQueueItem(url: string, deps: WorkerDeps): Promise<WorkerResult> {
  const target = url.trim();
  if (!target) {
    return { ok: false, results: [], error: 'That doesn’t look like a link — paste the full reel URL.' };
  }
  // Same routing as the Add screen's routeLink: TikTok first, then YouTube
  // by hostname, everything else through the reel (Facebook/Instagram)
  // import. No component state or run-id refs — item-scoped only.
  if (isTikTokUrl(target)) {
    return fetchTikTok(target, deps);
  }
  let host = '';
  try { host = new URL(target).hostname.toLowerCase(); } catch { /* fall through to the reel handler */ }
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    return fetchYouTube(target, deps);
  }
  return fetchReel(target, deps);
}

/**
 * Processes one queue item: routes the URL to the platform import and
 * returns the outcome. Never throws — every failure (network, parse, or
 * unexpected) comes back as { ok: false, error }.
 */
export async function processQueueItem(url: string, deps: WorkerDeps): Promise<WorkerResult> {
  try {
    return await runQueueItem(url, deps);
  } catch (e) {
    return {
      ok: false,
      results: [],
      error: e instanceof Error && e.message ? e.message : 'Something went wrong.',
    };
  }
}
