import { genreNames } from './genres';
import { trailerSearchUrl } from './types';

export interface TmdbMatch {
  tmdbID: number;
  title: string;
  mediaType: 'movie' | 'tv';
  year: number;
  genres: string[];
  overview: string;
  posterPath: string;
  popularity: number;
  originalLanguage: string;
  /** Cinemeta id for keyless matches — used to fetch the full meta entry. */
  cinemetaId?: string;
}

const BASE = 'https://api.themoviedb.org/3';
const CINEMETA = 'https://v3-cinemeta.strem.io';

/** Best TMDB match for free text, or null when nothing matches confidently. */
export async function bestMatch(text: string, apiKey: string): Promise<TmdbMatch | null> {
  if (!apiKey || !text) return null;
  let best: { match: TmdbMatch; score: number } | null = null;
  for (const candidate of candidates(text).slice(0, 6)) {
    const results = await searchMulti(candidate, apiKey);
    if (!results) continue;
    for (const r of results) {
      const s = score(r.title, candidate, r.popularity);
      if (s >= 60 && (!best || s > best.score)) best = { match: r, score: s };
    }
  }
  return best?.match ?? null;
}

/**
 * Keyless version of bestMatch: runs candidates(text) through the Cinemeta
 * catalog search and scores them with score() (popularity 0). Best at or
 * above 60 wins, otherwise null.
 */
export async function bestMatchKeyless(text: string): Promise<TmdbMatch | null> {
  if (!text) return null;
  let best: { match: TmdbMatch; score: number } | null = null;
  for (const candidate of candidates(text).slice(0, 6)) {
    const results = await searchTitlesKeyless(candidate);
    for (const r of results) {
      const s = score(r.title, candidate, 0);
      if (s >= 60 && (!best || s > best.score)) best = { match: r, score: s };
    }
  }
  return best?.match ?? null;
}

/** Search TMDB and return raw matches (used by manual add). */
export async function searchTitles(query: string, apiKey: string): Promise<TmdbMatch[]> {
  if (!apiKey || !query.trim()) return [];
  return (await searchMulti(query.trim(), apiKey)) ?? [];
}

interface CinemetaMeta {
  id: string;
  name: string;
  poster?: string;
  description?: string;
  releaseInfo?: string;
  genres?: string[];
}

/**
 * Keyless title search via Cinemeta (used by manual add when no TMDB key is
 * set). Maps results onto TmdbMatch; tmdbID is 0 and posterPath holds a full
 * URL (posterUrl() passes absolute URLs through).
 */
export async function searchTitlesKeyless(query: string): Promise<TmdbMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const out: TmdbMatch[] = [];
  for (const mediaType of ['movie', 'tv'] as const) {
    try {
      const res = await fetch(
        `${CINEMETA}/catalog/${cinemetaType(mediaType)}/top/search=${encodeURIComponent(q)}.json`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const metas: CinemetaMeta[] = data?.metas ?? [];
      for (const m of metas.slice(0, 6)) {
        if (!m?.name) continue;
        const year = parseInt((m.releaseInfo ?? '').slice(0, 4), 10);
        out.push({
          tmdbID: 0,
          title: m.name,
          mediaType,
          year: Number.isFinite(year) ? year : 0,
          genres: Array.isArray(m.genres) ? m.genres.slice(0, 3) : [],
          overview: m.description ?? '',
          posterPath: m.poster ?? '',
          popularity: 0,
          originalLanguage: '',
          cinemetaId: m.id,
        });
      }
    } catch {
      // one catalog failing shouldn't kill the other
    }
  }
  return out.slice(0, 12);
}

/** Likely title phrases from messy text: quoted phrases first, then short lines. */
export function candidates(text: string): string[] {
  const ordered: string[] = [];
  const add = (value: string) => {
    let t = value.trim();
    // Strip list numbering/bullets: "1. ", "2) ", "- ", "• ".
    t = t.replace(/^(\d{1,3}[.)]\s*|[-*•]\s*)+/, '');
    // Strip a trailing year: "Devs (2020)" -> "Devs".
    t = t.replace(/\s*\(\d{4}\)\s*$/, '');
    // Ignore special characters: drop emoji/symbols, keep letters, numbers,
    // spaces and the few punctuation marks titles use.
    t = t.replace(/[^\p{L}\p{N}\s'&:,-]/gu, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/[@#]\w+/g, '').trim();
    if (t.length < 2 || t.length > 60) return;
    if (t.split(/\s+/).length > 8) return;
    if (!ordered.includes(t)) ordered.push(t);
  };
  const quoteRe = /"([^"]+)"|'([^']+)'|“([^”]+)”/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRe.exec(text)) !== null) {
    for (let i = 1; i <= 3; i++) if (m[i]) add(m[i]);
  }
  for (const line of text.split('\n')) add(line);
  return ordered;
}

/**
 * Every confident title match in the text — for reels that list multiple
 * titles ("1. Devs (2020)", "2. Fringe (2008)", ...). Runs each candidate
 * through the keyed or keyless search and keeps every result scoring ≥ 60,
 * deduplicated. Requests are paced with one retry so a throttled catalog
 * response can't silently drop a title. Returns [] when nothing matches.
 */
export async function bestMatches(text: string, apiKey?: string): Promise<TmdbMatch[]> {
  if (!text) return [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const found: TmdbMatch[] = [];
  const seen = new Set<string>();
  // "Label: value" lines are caption metadata, not titles — skip them.
  const list = candidates(text).filter((c) => !/^[A-Za-z]{2,12}:/.test(c)).slice(0, 12);
  // Caption-level hint ("series"/"movie") breaks exact movie-vs-tv title ties.
  const tvHint = /\b(series|shows?|seasons?|episodes?)\b/i.test(text);
  const movieHint = /\bfilms?\b|\bmovies?\b/i.test(text);
  for (let i = 0; i < list.length; i++) {
    if (i > 0) await sleep(250);
    const candidate = list[i];
    let results: TmdbMatch[] | null = null;
    for (let attempt = 0; attempt < 2 && (!results || results.length === 0); attempt++) {
      try {
        results = apiKey ? await searchMulti(candidate, apiKey) : await searchTitlesKeyless(candidate);
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
      const hintBonus = (tvHint && r.mediaType === 'tv') || (movieHint && r.mediaType === 'movie') ? 1 : 0;
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
function score(resultTitle: string, candidate: string, popularity: number): number {
  const title = resultTitle.toLowerCase();
  const query = candidate.toLowerCase();
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
      `${BASE}/search/multi?api_key=${encodeURIComponent(apiKey)}` +
      `&query=${encodeURIComponent(query)}&include_adult=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: RawItem[] };
    return (json.results ?? []).flatMap((item) => {
      const mediaType = item.media_type;
      const title = item.title ?? item.name;
      if ((mediaType !== 'movie' && mediaType !== 'tv') || !title) return [];
      const dateStr = item.release_date ?? item.first_air_date ?? '';
      const year = parseInt(dateStr.slice(0, 4), 10) || 0;
      return [{
        tmdbID: item.id,
        title,
        mediaType,
        year,
        genres: genreNames(item.genre_ids ?? []),
        overview: item.overview ?? '',
        posterPath: item.poster_path ?? '',
        popularity: item.popularity ?? 0,
        originalLanguage: languageName(item.original_language ?? ''),
      }];
    });
  } catch {
    return null;
  }
}

/**
 * Decode HTML entities, including the hex/decimal numeric ones Facebook emits
 * in og: tags (e.g. &#x1f3ac;). The old hand-rolled chain only handled five
 * named entities and leaked the rest through as raw text.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    });
}

/**
 * Fetches a Facebook reel's public page and extracts its Open Graph
 * title/description — the same thing a link preview shows. Works for
 * public reels, no login needed.
 */
export async function fetchReelText(reelUrl: string): Promise<string | null> {
  try {
    const res = await fetch(reelUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const meta = (prop: string): string => {
      const re = new RegExp(
        `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
        'i'
      );
      const match = html.match(re);
      if (!match) return '';
      return decodeEntities(match[1]);
    };
    const title = meta('title');
    const desc = meta('description');
    const combined = [title, desc].filter(Boolean).join('\n').trim();
    // Facebook appends " | PageName | Facebook" to descriptions — not part of the caption.
    const cleaned = combined.replace(/\s*\|[^|]+\|\s*Facebook\s*$/i, '').trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

/**
 * Fetches a Facebook reel's public page and returns its Open Graph title —
 * the same og:title parse as fetchReelText. Falls back to the first line of
 * the fetched text when no og:title is present.
 */
export async function fetchReelTitle(reelUrl: string): Promise<string | null> {
  try {
    const res = await fetch(reelUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const meta = (prop: string): string => {
      const re = new RegExp(
        `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
        'i'
      );
      const match = html.match(re);
      return match ? decodeEntities(match[1]).trim() : '';
    };
    const ogTitle = meta('title');
    if (ogTitle) return ogTitle;
    const firstLine = meta('description').split('\n')[0].trim();
    return firstLine || null;
  } catch {
    return null;
  }
}

interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
}

/**
 * Direct YouTube URL for the title's official trailer via the TMDB API,
 * or null when there's no key, no TMDB id, or no trailer on file.
 */
export async function fetchTrailerUrl(
  tmdbID: number,
  mediaType: 'movie' | 'tv',
  apiKey: string
): Promise<string | null> {
  if (!apiKey || !tmdbID) return null;
  try {
    const res = await fetch(
      `${BASE}/${mediaType}/${tmdbID}/videos?api_key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const videos: TmdbVideo[] = (data.results ?? []).filter(
      (v: TmdbVideo) => v.site === 'YouTube' && v.key
    );
    if (videos.length === 0) return null;
    const pick =
      videos.find((v) => v.official && v.type === 'Trailer') ??
      videos.find((v) => v.type === 'Trailer') ??
      videos.find((v) => v.official && v.type === 'Teaser') ??
      videos[0];
    return `https://www.youtube.com/watch?v=${pick.key}`;
  } catch {
    return null;
  }
}

/**
 * Best trailer URL for a movie: the real official trailer from TMDB when the
 * user has an API key set, otherwise a YouTube trailer search. Never null.
 */
export async function resolveTrailerUrl(
  movie: { tmdbID: number; mediaType: 'movie' | 'tv'; title: string; year: number },
  apiKey: string
): Promise<string> {
  const direct = await fetchTrailerUrl(movie.tmdbID, movie.mediaType, apiKey);
  return direct ?? trailerSearchUrl(movie.title, movie.year);
}

function cinemetaType(mediaType: 'movie' | 'tv'): string {
  return mediaType === 'tv' ? 'series' : 'movie';
}

export interface CinemetaFullMeta {
  imdbRating?: string;
  description?: string;
  genres?: string[];
  cast?: string[];
}

/**
 * Full meta entry for a keyless (Cinemeta) id. The catalog search returns slim
 * metas, so this is where description, genres, cast and the IMDb rating live.
 */
export async function fetchKeylessMeta(
  cinemetaId: string, mediaType: 'movie' | 'tv'
): Promise<CinemetaFullMeta | null> {
  try {
    const res = await fetch(
      `${CINEMETA}/meta/${cinemetaType(mediaType)}/${encodeURIComponent(cinemetaId)}.json`
    );
    if (!res.ok) return null;
    return (await res.json())?.meta ?? null;
  } catch {
    return null;
  }
}

async function cinemetaRating(imdbID: string, mediaType: 'movie' | 'tv'): Promise<number> {
  try {
    const res = await fetch(`${CINEMETA}/meta/${cinemetaType(mediaType)}/${imdbID}.json`);
    if (!res.ok) return 0;
    const data = await res.json();
    const r = parseFloat(data?.meta?.imdbRating);
    return Number.isFinite(r) ? r : 0;
  } catch {
    return 0;
  }
}

/**
 * IMDb rating for a title (0 = unknown). Precise path: TMDB external_ids gives
 * the IMDb id, then Cinemeta serves the rating — no extra key needed beyond
 * the TMDB one. Without a TMDB key it falls back to a Cinemeta title search.
 */
export async function fetchImdbRating(
  tmdbID: number,
  mediaType: 'movie' | 'tv',
  title: string,
  apiKey: string
): Promise<number> {
  // Precise: TMDB external ids -> Cinemeta rating.
  if (apiKey && tmdbID) {
    try {
      const res = await fetch(
        `${BASE}/${mediaType}/${tmdbID}/external_ids?api_key=${encodeURIComponent(apiKey)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.imdb_id) {
          const r = await cinemetaRating(data.imdb_id, mediaType);
          if (r > 0) return r;
        }
      }
    } catch {
      // fall through to title search
    }
  }
  // Keyless fallback: Cinemeta title search, prefer an exact name match.
  try {
    const q = encodeURIComponent(title);
    const res = await fetch(`${CINEMETA}/catalog/${cinemetaType(mediaType)}/top/search=${q}.json`);
    if (!res.ok) return 0;
    const data = await res.json();
    const metas: Array<{ id: string; name: string }> = data?.metas ?? [];
    const pick =
      metas.find((m) => m.name?.toLowerCase() === title.toLowerCase()) ?? metas[0];
    if (!pick) return 0;
    return cinemetaRating(pick.id, mediaType);
  } catch {
    return 0;
  }
}

/** Human-readable language name from a TMDB ISO 639-1 code. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', hi: 'Hindi', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean',
  zh: 'Mandarin Chinese', ar: 'Arabic', bn: 'Bengali', te: 'Telugu', ta: 'Tamil',
  ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi', pa: 'Punjabi', id: 'Indonesian',
  nl: 'Dutch', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
  pl: 'Polish', tr: 'Turkish', el: 'Greek', he: 'Hebrew', th: 'Thai',
  vi: 'Vietnamese', ms: 'Malay', uk: 'Ukrainian',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code?.toLowerCase()] ?? '';
}
