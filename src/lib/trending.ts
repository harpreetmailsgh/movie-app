import { Movie } from './types';

const CINEMETA = 'https://v3-cinemeta.strem.io';

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

let cache: { at: number; items: Movie[] } | null = null;
const TTL = 60 * 60 * 1000; // 1 hour

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

/**
 * What's popular right now (movies + series, mixed by TMDB popularity).
 * Keyless via Cinemeta — no API key needed. Cached for an hour.
 */
export async function fetchTrending(): Promise<Movie[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  const [movies, series] = await Promise.all([fetchCatalog('movie'), fetchCatalog('tv')]);
  const items = [...movies, ...series].sort(
    (a, b) => ((b as any)._pop ?? 0) - ((a as any)._pop ?? 0)
  );
  cache = { at: Date.now(), items };
  return items;
}

/** Strip trending-only extras before saving into the library. */
export function trendingToInput(m: Movie): Omit<Movie, 'id' | 'dateAdded'> {
  const { id: _id, dateAdded: _d, _pop: _p, ...rest } = m as Movie & {
    _pop?: number;
  };
  return { ...rest, status: 'watchlist' };
}
