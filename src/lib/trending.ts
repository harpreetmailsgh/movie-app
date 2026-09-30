import AsyncStorage from '@react-native-async-storage/async-storage';
import { Movie } from './types';
import { TmdbMatch, CinemetaFullMeta, bestMatchKeyless, fetchKeylessMeta, fetchTrailerKey, resolveTrailerForTitle } from './tmdb';

const CINEMETA = 'https://v3-cinemeta.strem.io';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface CatalogMeta {
  id: string;
  name?: string;
  releaseInfo?: string;
  poster?: string;
  description?: string;
  genres?: string[];
  cast?: string[];
  imdbRating?: string;
  moviedb_id?: number;
  type?: string;
  popularities?: { moviedb?: number };
}

function toMovie(m: CatalogMeta, mediaType: 'movie' | 'tv'): Movie | null {
  if (!m?.name) return null;
  const year = parseInt((m.releaseInfo ?? '').slice(0, 4), 10);
  const rating = parseFloat(m.imdbRating ?? '');
  return {
    id: `trending-${m.id}`,
    title: m.name,
    year: Number.isFinite(year) ? year : 0,
    mediaType,
    genres: Array.isArray(m.genres) ? m.genres.slice(0, 3) : [],
    overview: m.description ?? '',
    posterPath: m.poster ?? '',
    reelURL: '',
    caption: '',
    notes: '',
    status: 'watchlist', // placeholder — never persisted
    tmdbID: m.moviedb_id ?? 0,
    originalLanguage: '',
    cast: Array.isArray(m.cast) ? m.cast.slice(0, 5) : [],
    imdbRating: Number.isFinite(rating) ? rating : 0,
    needsReview: false,
    dateAdded: 0,
    // stashed for sorting; stripped before persisting
    _pop: m.popularities?.moviedb ?? 0,
  } as Movie;
}

async function fetchCatalog(mediaType: 'movie' | 'tv'): Promise<Movie[]> {
  const type = mediaType === 'tv' ? 'series' : 'movie';
  try {
    const res = await fetch(`${CINEMETA}/catalog/${type}/top.json`);
    if (!res.ok) return [];
    const data = await res.json();
    const metas: CatalogMeta[] = data?.metas ?? [];
    return metas.map((m) => toMovie(m, mediaType)).filter((m): m is Movie => !!m);
  } catch {
    return [];
  }
}

/** Existing global path — unchanged; used as the fallback. */
async function fetchCinemetaGlobal(): Promise<Movie[]> {
  const [movies, series] = await Promise.all([fetchCatalog('movie'), fetchCatalog('tv')]);
  return [...movies, ...series].sort(
    (a, b) => ((b as any)._pop ?? 0) - ((a as any)._pop ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Country detection (ipinfo.io, keyless; re-checked weekly)
// ---------------------------------------------------------------------------

const COUNTRY_KEY = 'trending.country.v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface CountryCache {
  code: string;
  at: number;
}

/** ISO2 country code (e.g. "CA"), or null on any failure. */
async function getCountryCode(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(COUNTRY_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as CountryCache;
      if (cached?.code && Date.now() - cached.at < WEEK_MS) return cached.code;
    }
  } catch {
    // fall through to a fresh lookup
  }
  try {
    const res = await fetch('https://ipinfo.io/json');
    if (!res.ok) return null;
    const data = await res.json();
    const code = typeof data?.country === 'string' ? data.country.toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(code)) return null;
    try {
      await AsyncStorage.setItem(COUNTRY_KEY, JSON.stringify({ code, at: Date.now() } satisfies CountryCache));
    } catch {
      // cache write is best-effort
    }
    return code;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Netflix top-10 source (per-country JSON generated to our repo, keyless)
// ---------------------------------------------------------------------------

interface RankedTitle {
  title: string;
  mediaType: 'movie' | 'tv';
  notes: string;
}

interface NetflixResult {
  items: RankedTitle[]; // rank order, latest week, country-filtered
  countryName: string;
}

interface NetflixJsonEntry {
  rank?: number;
  title?: string;
  weeks_in_top_10?: number;
  season?: string;
}

interface NetflixJson {
  week?: string;
  country_iso2?: string;
  country_name?: string;
  films?: NetflixJsonEntry[];
  tv?: NetflixJsonEntry[];
}

/**
 * Per-country Netflix top 10 JSON. Returns null on any failure (non-200,
 * parse error, missing films/tv arrays) so the existing fallback chain
 * runs (Apple iTunes -> Cinemeta global).
 */
async function fetchNetflixCountry(cc: string): Promise<NetflixResult | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/harpreetmailsgh/movie-app/trending-data/netflix/${cc.toLowerCase()}.json`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NetflixJson;
    if (!data || !Array.isArray(data.films) || !Array.isArray(data.tv)) return null;

    const byRank = (a: NetflixJsonEntry, b: NetflixJsonEntry) => (a.rank ?? 0) - (b.rank ?? 0);
    const items: RankedTitle[] = [];
    for (const f of data.films.filter((e) => typeof e?.title === 'string' && e.title.trim()).sort(byRank)) {
      const title = (f.title as string).trim();
      items.push({ title, mediaType: 'movie', notes: '' });
    }
    for (const t of data.tv.filter((e) => typeof e?.title === 'string' && e.title.trim()).sort(byRank)) {
      const title = (t.title as string).trim();
      const season = typeof t.season === 'string' ? t.season.trim() : '';
      items.push({
        title,
        mediaType: 'tv',
        notes: season && season !== 'N/A' && season !== title ? season : '',
      });
    }
    if (!items.length) return null;
    const countryName =
      typeof data.country_name === 'string' && data.country_name.trim()
        ? data.country_name.trim()
        : cc.toUpperCase();
    return { items, countryName };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Apple iTunes RSS source (keyless JSON)
// ---------------------------------------------------------------------------

interface AppleEntry {
  'im:name'?: { label?: string };
}

async function fetchAppleFeed(cc: string, kind: 'topmovies' | 'toptvseasons'): Promise<AppleEntry[]> {
  const res = await fetch(
    `https://itunes.apple.com/${cc.toLowerCase()}/rss/${kind}/limit=25/json`
  );
  if (!res.ok) throw new Error(`apple ${kind}: ${res.status}`);
  const data = await res.json();
  const entries = data?.feed?.entry;
  return Array.isArray(entries) ? (entries as AppleEntry[]) : [];
}

async function fetchApple(cc: string): Promise<RankedTitle[]> {
  const [movies, tv] = await Promise.all([
    fetchAppleFeed(cc, 'topmovies'),
    fetchAppleFeed(cc, 'toptvseasons'),
  ]);
  const items: RankedTitle[] = [];
  for (const e of movies) {
    const title = e['im:name']?.label?.trim();
    if (title) items.push({ title, mediaType: 'movie', notes: '' });
  }
  for (const e of tv) {
    const title = e['im:name']?.label?.trim();
    if (title) items.push({ title, mediaType: 'tv', notes: '' });
  }
  if (!items.length) throw new Error('apple: no titles');
  return items;
}

// ---------------------------------------------------------------------------
// Merge, dedupe, enrich
// ---------------------------------------------------------------------------

function normTitle(t: string): string {
  return t.toLowerCase().trim();
}

/**
 * Netflix (rank order) then Apple (chart order); dedupe by normalized title;
 * Netflix capped at 20, Apple at 20 → at most 40 titles enriched.
 */
function mergeAndDedupe(netflix: RankedTitle[], apple: RankedTitle[]): RankedTitle[] {
  const seen = new Set<string>();
  const out: RankedTitle[] = [];
  for (const t of [...netflix.slice(0, 20), ...apple.slice(0, 20)]) {
    const key = normTitle(t.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function matchToMovie(match: TmdbMatch, mediaType: 'movie' | 'tv', notes: string, full?: CinemetaFullMeta | null): Movie {
  const rating = parseFloat(full?.imdbRating ?? '');
  return {
    id: `trending-${mediaType}-${match.tmdbID || normTitle(match.title).replace(/[^a-z0-9]+/g, '-')}`,
    title: match.title,
    year: match.year ?? 0,
    mediaType,
    genres: full?.genres?.length
      ? full.genres.slice(0, 3)
      : Array.isArray(match.genres) ? match.genres.slice(0, 3) : [],
    overview: full?.description || match.overview || '',
    posterPath: match.posterPath ?? '',
    reelURL: '',
    caption: '',
    notes,
    status: 'watchlist', // placeholder — never persisted
    tmdbID: match.tmdbID ?? 0,
    originalLanguage: match.originalLanguage ?? '',
    cast: full?.cast?.length ? full.cast.slice(0, 5) : [],
    imdbRating: Number.isFinite(rating) && rating > 0 ? rating : 0,
    needsReview: false,
    dateAdded: 0,
  };
}

/** Enrich titles via keyless matching; titles with no match are skipped. */
async function enrichTitles(titles: RankedTitle[]): Promise<Movie[]> {
  const out: Movie[] = [];
  // Small batches to bound concurrent network use.
  const BATCH = 5;
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const matches = await Promise.all(batch.map((t) => bestMatchKeyless(t.title)));
    // Full meta per match (description, genres, rating, cast) — the same
    // lookup the "Add 20 random movies" flow uses. Failures keep the slim
    // fields: no blanks, no crashes.
    const fulls = await Promise.all(matches.map((match) =>
      match?.cinemetaId
        ? fetchKeylessMeta(match.cinemetaId, match.mediaType).catch(() => null)
        : Promise.resolve(null)
    ));
    batch.forEach((t, j) => {
      const match = matches[j];
      if (match) out.push(matchToMovie(match, t.mediaType, t.notes, fulls[j]));
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cache + label
// ---------------------------------------------------------------------------

const CACHE_KEY = 'trending.cache.v1';

interface TrendingCache {
  at: number;
  countryCode: string | null;
  label: string;
  items: Movie[];
  /** Trailer-key backfill pass has run; set on write-back, never moves `at`. */
  trailersDone?: boolean;
}

let lastLabel = 'Trending 🔥';
let lastRefreshedAt: number | null = null;

/** Raw cache read — no freshness filter. */
async function readRawCache(): Promise<TrendingCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as TrendingCache;
    if (!cached || !Array.isArray(cached.items) || !cached.items.length) return null;
    return cached;
  } catch {
    return null;
  }
}

/**
 * Friday cadence: the most recent Friday 00:00 device-local.
 * (Friday is getDay() 5.)
 */
function lastFridayMidnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - 5 + 7) % 7));
  return d.getTime();
}

/**
 * Cached list iff it was written at/after the most recent Friday 00:00.
 * Entries written under the old 7-day scheme get the Friday rule applied
 * uniformly here on read.
 */
async function readCache(): Promise<TrendingCache | null> {
  const cached = await readRawCache();
  if (!cached) return null;
  if (cached.at < lastFridayMidnight()) return null;
  return cached;
}

/**
 * Writes the entry verbatim — the caller owns `at`. The trailer backfill
 * uses this so its pass never moves the list's refresh date.
 */
async function writeCacheEntry(entry: TrendingCache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // cache writes are best-effort
  }
}

/**
 * Resolves missing trailer keys for cached trending items, in place (the
 * screen state and feedCache hold the same item refs, so trailers go live
 * mid-session). tmdbID > 0 → a single fetchTrailerKey; tmdbID 0 → resolve
 * the title first, then its trailer (and the real tmdbID). 500ms pacing
 * stays under TMDB's 40 req/10s; a per-item try/catch means one bad item
 * never kills the pass. Always marks trailersDone and writes the cache
 * back preserving the ORIGINAL at.
 */
async function backfillTrailerKeys(entry: TrendingCache, apiKey?: string): Promise<void> {
  if (!apiKey || entry.trailersDone) return;
  let first = true;
  for (const item of entry.items) {
    if (item.trailerKey) continue;
    if (!first) await sleep(500);
    first = false;
    try {
      if (item.tmdbID > 0) {
        const key = await fetchTrailerKey(item.tmdbID, item.mediaType, apiKey);
        if (key) item.trailerKey = key;
      } else {
        const hit = await resolveTrailerForTitle(item.title, item.mediaType, apiKey);
        if (hit) {
          item.trailerKey = hit.key;
          item.tmdbID = hit.tmdbID;
        }
      }
    } catch {
      // one bad item never kills the pass
    }
  }
  entry.trailersDone = true;
  await writeCacheEntry(entry);
}

/**
 * Full country refresh: detect country → fetch Netflix + Apple → merge,
 * dedupe, enrich. Any failure or zero enriched items throws, so the caller
 * falls back to the Cinemeta global path.
 */
async function loadCountryTrending(apiKey?: string): Promise<Movie[]> {
  const cc = await getCountryCode();
  if (!cc) throw new Error('no country');
  const [netflix, apple] = await Promise.all([
    fetchNetflixCountry(cc),
    fetchApple(cc).catch(() => [] as RankedTitle[]),
  ]);
  const titles = mergeAndDedupe(netflix?.items ?? [], apple);
  if (!titles.length) throw new Error('no titles to enrich');
  const items = await enrichTitles(titles);
  if (!items.length) throw new Error('no enriched items');
  const label = netflix ? `Trending in ${netflix.countryName} 🔥` : `Trending in ${cc.toUpperCase()} 🔥`;
  lastLabel = label;
  const entry: TrendingCache = {
    at: Date.now(),
    countryCode: cc,
    label,
    items,
    trailersDone: false,
  };
  lastRefreshedAt = entry.at;
  await writeCacheEntry(entry);
  // Trailers resolve in the background — the fresh list is served immediately.
  void backfillTrailerKeys(entry, apiKey).catch(() => {});
  return items;
}

/**
 * What's popular right now. Country path (Netflix + Apple, enriched) when
 * available; otherwise the existing Cinemeta global top. Friday cadence:
 * a list cached at/after the most recent Friday 00:00 is served as-is with
 * no background refresh (network stays quiet); an older list is served
 * instantly and refreshed in the background (stale-while-revalidate) — the
 * fetch never blocks the UI.
 */
export async function fetchTrending(apiKey?: string): Promise<Movie[]> {
  const fresh = await readCache();
  const entry = fresh ?? (await readRawCache());
  if (entry) {
    lastLabel = entry.label || lastLabel;
    lastRefreshedAt = entry.at;
    // Cached path — fresh or stale: fire the trailer backfill whenever it
    // hasn't run and any item still lacks a key, regardless of freshness.
    if (!entry.trailersDone && entry.items.some((i) => !i.trailerKey)) {
      void backfillTrailerKeys(entry, apiKey).catch(() => {});
    }
    if (!fresh) {
      // Friday boundary HAS passed since the list was cached: serve the stale
      // list instantly and refresh in the background.
      void loadCountryTrending(apiKey).catch(() => {
        // Background refresh failed — keep serving the stale cache; a failure
        // here must never clobber good cached items or the served label.
      });
    }
    return entry.items;
  }
  try {
    return await loadCountryTrending(apiKey);
  } catch {
    // Any failure at any step → the existing Cinemeta global path.
    const items = await fetchCinemetaGlobal();
    lastLabel = 'Trending 🔥';
    const fallback: TrendingCache = {
      at: Date.now(),
      countryCode: null,
      label: lastLabel,
      items,
      trailersDone: false,
    };
    lastRefreshedAt = fallback.at;
    await writeCacheEntry(fallback);
    void backfillTrailerKeys(fallback, apiKey).catch(() => {});
    return items;
  }
}

/** Label reflecting what fetchTrending actually served last. */
export async function getTrendingLabel(): Promise<string> {
  return lastLabel;
}

/** Label + refresh timestamp reflecting what fetchTrending last served. */
export async function getTrendingMeta(): Promise<{ label: string; refreshedAt: number | null }> {
  return { label: lastLabel, refreshedAt: lastRefreshedAt };
}

/** Strip trending-only extras before saving into the library. */
export function trendingToInput(m: Movie): Omit<Movie, 'id' | 'dateAdded'> {
  const { id: _id, dateAdded: _d, _pop: _p, ...rest } = m as Movie & {
    _pop?: number;
  };
  return { ...rest, status: 'watchlist' };
}
