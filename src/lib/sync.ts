import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { Movie, EntryStatus } from './types';

const DELETED_KEY = 'movies.deleted.v1';
const LAST_SYNC_KEY = 'movies.lastSync.v1';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The id used for a movie in the cloud tables. Real TMDB ids pass through;
 * entries without one (manual adds, titles TMDB doesn't know) get a stable
 * deterministic negative id derived from title+year+type, so they sync too
 * without colliding with real TMDB ids.
 */
export function cacheIdFor(m: Pick<Movie, 'tmdbID' | 'title' | 'year' | 'mediaType'>): number {
  if (m.tmdbID > 0) return m.tmdbID;
  let h = 2166136261;
  const s = `${m.title}|${m.year}|${m.mediaType}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return -((h >>> 0) + 1);
}

interface RemoteRow {
  tmdb_id: number;
  status: EntryStatus;
  notes: string;
  reel_url: string;
  date_added: string;
  updated_at: string;
  movie_cache: {
    tmdb_id: number;
    media_type: 'movie' | 'tv';
    title: string;
    year: number | null;
    overview: string | null;
    poster_path: string | null;
    genres: string[] | null;
    original_language: string | null;
    imdb_rating: number | null;
  } | null;
}

export function remoteToMovie(row: RemoteRow): Movie {
  const c = row.movie_cache;
  return {
    id: newId(),
    title: c?.title ?? 'Unknown title',
    year: c?.year ?? 0,
    mediaType: c?.media_type ?? 'movie',
    genres: c?.genres ?? [],
    overview: c?.overview ?? '',
    posterPath: c?.poster_path ?? '',
    reelURL: row.reel_url ?? '',
    caption: '',
    notes: row.notes ?? '',
    status: row.status,
    tmdbID: row.tmdb_id > 0 ? row.tmdb_id : 0,
    originalLanguage: c?.original_language ?? '',
    cast: [],
    imdbRating: c?.imdb_rating ?? 0,
    needsReview: row.tmdb_id <= 0 && !(c?.title),
    dateAdded: row.date_added ? Date.parse(row.date_added) : Date.now(),
  };
}

/** Push the whole local library up (upsert — safe to repeat, self-heals). */
export async function pushLibrary(userId: string, movies: Movie[]): Promise<void> {
  const sb = getSupabase();
  if (!sb || movies.length === 0) {
    if (sb && movies.length === 0) {
      // Library emptied locally — nothing to push (deletes go row-by-row).
    }
    return;
  }
  const now = new Date().toISOString();
  const cacheRows = movies.map((m) => ({
    tmdb_id: cacheIdFor(m),
    media_type: m.mediaType,
    title: m.title,
    year: m.year || null,
    overview: m.overview || null,
    poster_path: m.posterPath || null,
    genres: m.genres,
    original_language: m.originalLanguage || null,
    imdb_rating: m.imdbRating || null,
    updated_at: now,
  }));
  const { error: cacheError } = await sb.from('movie_cache').upsert(cacheRows, { onConflict: 'tmdb_id' });
  if (cacheError) throw cacheError;

  const userRows = movies.map((m) => ({
    user_id: userId,
    tmdb_id: cacheIdFor(m),
    status: m.status,
    notes: m.notes || '',
    reel_url: m.reelURL || null,
    date_added: new Date(m.dateAdded).toISOString(),
    updated_at: now,
  }));
  const { error: userError } = await sb
    .from('user_movies')
    .upsert(userRows, { onConflict: 'user_id,tmdb_id' });
  if (userError) throw userError;
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}

/** Fetch the user's cloud library. */
export async function pullLibrary(userId: string): Promise<RemoteRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('user_movies')
    .select(
      'tmdb_id, status, notes, reel_url, date_added, updated_at, movie_cache (tmdb_id, media_type, title, year, overview, poster_path, genres, original_language, imdb_rating)'
    )
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as unknown as RemoteRow[];
}

/** Delete one movie's cloud row (called when the user deletes it locally). */
export async function deleteRemoteMovie(userId: string, cacheId: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('user_movies')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', cacheId);
  if (error) throw error;
}

/** Ids the user deleted locally, so a later pull doesn't resurrect them. */
export async function getDeletedIds(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export async function addDeletedId(cacheId: number): Promise<void> {
  try {
    const ids = await getDeletedIds();
    if (!ids.includes(cacheId)) {
      ids.push(cacheId);
      await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(ids.slice(-500)));
    }
  } catch { /* ignore */ }
}

export async function getLastSyncAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}
