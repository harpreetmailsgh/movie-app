import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Movie, EntryStatus, Settings, ViewMode } from './types';
import { seedMovies, backfillSeedData, normalizeMovie } from './seed';
import { bestMatch, bestMatchKeyless, fetchImdbRating, fetchReelText, fetchReelTitle, searchTitlesKeyless, fetchKeylessMeta } from './tmdb';
import { pickRandomTitles } from './testMovies';
import { useAuth } from './auth';
import { getSupabase } from './supabase';
import {
  cacheIdFor, pushLibrary, pullLibrary, deleteRemoteMovie,
  remoteToMovie, getDeletedIds, addDeletedId, getLastSyncAt,
} from './sync';

const MOVIES_KEY = 'movies.v1';
const SETTINGS_KEY = 'settings.v1';
const DETAIL_BACKFILL_KEY = 'detail-backfill.v1';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface Store {
  movies: Movie[];
  ready: boolean;
  settings: Settings;
  importing: boolean;
  importMessage: string | null;
  syncState: 'idle' | 'syncing' | 'error';
  lastSyncAt: number | null;
  moveMovie: (id: string, status: EntryStatus) => void;
  deleteMovie: (id: string) => void;
  updateMovie: (id: string, patch: Partial<Movie>) => void;
  addMovie: (m: Omit<Movie, 'id' | 'dateAdded'>) => void;
  importReel: (url: string) => Promise<boolean>;
  revalidateTitle: (id: string, titleOverride?: string) => Promise<void>;
  addTestMovies: (count: number) => Promise<number>;
  clearLibrary: () => void;
  setTmdbKey: (key: string) => void;
  setCardAnimation: (style: 'flick' | 'peel') => void;
  setDeckStyle: (style: 'stack' | 'sidepeek' | 'fan') => void;
  setWatchlistView: (view: ViewMode) => void;
  setTrendingView: (view: ViewMode) => void;
  setSeenView: (view: ViewMode) => void;
  cycleToBack: (id: string) => void;
  enrichLibrary: () => Promise<void>;
  setOnboardingSeen: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>({ tmdbKey: '', onboardingSeen: false, cardAnimation: 'flick', deckStyle: 'stack', watchlistView: 'cards', trendingView: 'tiles', seenView: 'tiles' });
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const { session, ready: authReady } = useAuth();
  const moviesRef = useRef<Movie[]>([]);
  const sessionRef = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedUser = useRef<string | null>(null);

  // Load persisted state (seed on first launch).
  useEffect(() => {
    (async () => {
      try {
        const [moviesRaw, settingsRaw] = await Promise.all([
          AsyncStorage.getItem(MOVIES_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (moviesRaw) {
          const stored: Movie[] = JSON.parse(moviesRaw);
          // Normalize first (old saves lack newer fields), then backfill
          // poster/overview/cast/etc. from the enriched seeds by title.
          const normalized = stored.map(normalizeMovie);
          // Old 'trash' entries are dropped for good — there is no Trash anymore.
          const live = normalized.filter((m) => (m.status as string) !== 'trash');
          const { movies: backfilled, changed } = backfillSeedData(live);
          setMovies(backfilled);
          if (changed || live.length !== stored.length) {
            await AsyncStorage.setItem(MOVIES_KEY, JSON.stringify(backfilled));
          }
        } else {
          const seeds = seedMovies();
          setMovies(seeds);
          await AsyncStorage.setItem(MOVIES_KEY, JSON.stringify(seeds));
        }
        if (settingsRaw) setSettings({ tmdbKey: '', onboardingSeen: false, cardAnimation: 'flick', deckStyle: 'stack', watchlistView: 'cards', trendingView: 'tiles', seenView: 'tiles', ...JSON.parse(settingsRaw) });
      } catch {
        // Corrupt storage: start fresh with seeds.
        setMovies(seedMovies());
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Keep refs fresh for async sync work.
  useEffect(() => { moviesRef.current = movies; }, [movies]);
  useEffect(() => { sessionRef.current = session?.user?.id ?? null; }, [session]);
  useEffect(() => { getLastSyncAt().then(setLastSyncAt); }, []);

  /** Debounced cloud push after any local change (upsert — safe to repeat). */
  const schedulePush = useCallback(() => {
    const userId = sessionRef.current;
    if (!userId || !getSupabase()) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      try {
        await pushLibrary(userId, moviesRef.current);
        setLastSyncAt(Date.now());
        setSyncState('idle');
      } catch {
        setSyncState('error');
      }
    }, 2000);
  }, []);

  const persist = useCallback(async (next: Movie[]) => {
    setMovies(next);
    try {
      await AsyncStorage.setItem(MOVIES_KEY, JSON.stringify(next));
    } catch { /* storage full etc. — keep in-memory copy */ }
    schedulePush();
  }, [schedulePush]);

  const backfilledOnce = useRef(false);

  /**
   * One-time enrichment: movies saved without a description or genres (e.g.
   * keyless adds from the slim catalog search) get their overview, genres,
   * cast and missing IMDb rating filled in from the full Cinemeta meta entry
   * — the same lookup the "Add 20 random movies" flow uses.
   * Runs in the background; movies that already have a description AND genres
   * are untouched.
   */
  const backfillDetails = useCallback(async () => {
    const targets = moviesRef.current.filter((m) => !m.overview || !(m.genres?.length));
    if (!targets.length) return;
    const patches = new Map<string, Partial<Movie>>();
    for (let i = 0; i < targets.length; i += 4) {
      const batch = await Promise.all(targets.slice(i, i + 4).map(async (movie) => {
        try {
          const matches = await searchTitlesKeyless(movie.title);
          if (!matches.length) return null;
          const key = movie.title.trim().toLowerCase();
          const m = matches.find((x) => x.title.trim().toLowerCase() === key) ?? matches[0];
          if (!m.cinemetaId) return null;
          const meta = await fetchKeylessMeta(m.cinemetaId, m.mediaType);
          if (!meta) return null;
          const patch: Partial<Movie> = {};
          if (meta.description) patch.overview = meta.description;
          if (meta.genres?.length) patch.genres = meta.genres.slice(0, 3);
          if (meta.cast?.length) patch.cast = meta.cast.slice(0, 3);
          const r = parseFloat(meta.imdbRating ?? '');
          if (Number.isFinite(r) && r > 0 && !(movie.imdbRating > 0)) patch.imdbRating = r;
          return Object.keys(patch).length ? { id: movie.id, patch } : null;
        } catch {
          return null;
        }
      }));
      for (const u of batch) if (u) patches.set(u.id, u.patch);
    }
    if (!patches.size) return;
    await persist(moviesRef.current.map((m) =>
      patches.has(m.id) ? { ...m, ...patches.get(m.id)! } : m
    ));
  }, [persist]);

  // Enrich detail-less movies in the background, exactly once (persisted flag).
  useEffect(() => {
    if (!ready || backfilledOnce.current) return;
    backfilledOnce.current = true;
    void (async () => {
      try {
        const done = await AsyncStorage.getItem(DETAIL_BACKFILL_KEY);
        if (done === '1') return; // already ran on a previous launch
        await backfillDetails();
      } finally {
        // Always mark done so this runs at most once, even if some fetches
        // failed — failures simply keep today's slim fields.
        try { await AsyncStorage.setItem(DETAIL_BACKFILL_KEY, '1'); } catch { /* best-effort */ }
      }
    })();
  }, [ready, backfillDetails]);

  // First cloud sync once signed in: pull anything new from the cloud,
  // then push the local library up (local wins on conflict).
  useEffect(() => {
    if (!ready || !authReady || !session?.user?.id) return;
    const userId = session.user.id;
    if (syncedUser.current === userId) return;
    syncedUser.current = userId;
    (async () => {
      if (!getSupabase()) return;
      setSyncState('syncing');
      try {
        const remote = await pullLibrary(userId);
        const deleted = new Set(await getDeletedIds());
        for (const row of remote) {
          if (deleted.has(row.tmdb_id)) {
            await deleteRemoteMovie(userId, row.tmdb_id).catch(() => {});
          }
        }
        const live = remote.filter((r) => !deleted.has(r.tmdb_id));
        const localIds = new Set(moviesRef.current.map(cacheIdFor));
        const additions = live.filter((r) => !localIds.has(r.tmdb_id)).map(remoteToMovie);
        if (additions.length > 0) {
          const next = [...additions, ...moviesRef.current];
          setMovies(next);
          try { await AsyncStorage.setItem(MOVIES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        }
        await pushLibrary(userId, moviesRef.current);
        setLastSyncAt(Date.now());
        setSyncState('idle');
      } catch {
        setSyncState('error');
        syncedUser.current = null; // retry on next launch
      }
    })();
  }, [ready, authReady, session]);

  const persistSettings = useCallback(async (next: Settings) => {
    setSettings(next);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }, []);

  const moveMovie = useCallback((id: string, status: EntryStatus) => {
    persist(movies.map((m) => (m.id === id ? { ...m, status } : m)));
  }, [movies, persist]);

  const clearLibrary = useCallback(() => {
    const userId = sessionRef.current;
    for (const m of movies) {
      // Tombstone each movie so a later cloud pull doesn't resurrect them.
      const cacheId = cacheIdFor(m);
      addDeletedId(cacheId);
      if (userId) deleteRemoteMovie(userId, cacheId).catch(() => {});
    }
    persist([]);
  }, [movies, persist]);

  const deleteMovie = useCallback((id: string) => {
    const m = movies.find((x) => x.id === id);
    persist(movies.filter((x) => x.id !== id));
    if (m) {
      // Remember the delete so a later cloud pull doesn't resurrect the movie.
      const cacheId = cacheIdFor(m);
      addDeletedId(cacheId);
      if (sessionRef.current) {
        deleteRemoteMovie(sessionRef.current, cacheId).catch(() => {});
      }
    }
  }, [movies, persist]);

  const updateMovie = useCallback((id: string, patch: Partial<Movie>) => {
    persist(movies.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, [movies, persist]);

  const addMovie = useCallback((m: Omit<Movie, 'id' | 'dateAdded'>) => {
    persist([{ ...m, id: newId(), dateAdded: Date.now() }, ...movies]);
  }, [movies, persist]);

  /** Adds `count` random well-known movies to the Inbox (for testing the deck).
   *  Resolves titles through the keyless search in small parallel batches and
   *  adds everything in a single persist. Returns how many were added. */
  const addTestMovies = useCallback(async (count: number): Promise<number> => {
    const seen = new Set(movies.map((m) => m.title.trim().toLowerCase()));
    const titles = pickRandomTitles(count, seen);
    const inputs: Omit<Movie, 'id' | 'dateAdded'>[] = [];
    for (let i = 0; i < titles.length; i += 4) {
      const batch = await Promise.all(titles.slice(i, i + 4).map(async (title) => {
        try {
          const matches = await searchTitlesKeyless(title);
          if (!matches.length) return null;
          const key = title.toLowerCase();
          return matches.find((m) => m.title.trim().toLowerCase() === key) ?? matches[0];
        } catch {
          return null;
        }
      }));
      for (const m of batch) {
        if (!m) continue;
        const key = m.title.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        // Keyless matches carry a Cinemeta id: one meta fetch returns the
        // rating, description, genres and cast (the catalog search is slim).
        let imdbRating = 0, overview = m.overview, genres = m.genres;
        let cast: string[] = [];
        if (m.cinemetaId) {
          try {
            const meta = await fetchKeylessMeta(m.cinemetaId, m.mediaType);
            if (meta) {
              const r = parseFloat(meta.imdbRating ?? '');
              if (Number.isFinite(r)) imdbRating = r;
              if (meta.description) overview = meta.description;
              if (meta.genres?.length) genres = meta.genres.slice(0, 3);
              if (meta.cast?.length) cast = meta.cast.slice(0, 3);
            }
          } catch { /* keep the slim fields */ }
        } else {
          try {
            imdbRating = await fetchImdbRating(m.tmdbID, m.mediaType, m.title, settings.tmdbKey);
          } catch { /* keep 0 */ }
        }
        inputs.push({
          title: m.title, year: m.year, mediaType: m.mediaType, genres,
          overview, posterPath: m.posterPath, reelURL: '',
          caption: '', notes: '', status: 'watchlist', tmdbID: m.tmdbID, imdbRating,
          originalLanguage: m.originalLanguage, cast, needsReview: false,
        });
      }
    }
    if (inputs.length) {
      persist(inputs.map((m) => ({ ...m, id: newId(), dateAdded: Date.now() })).concat(movies));
    }
    return inputs.length;
  }, [movies, persist, settings.tmdbKey]);

  const setTmdbKey = useCallback((key: string) => {
    persistSettings({ ...settings, tmdbKey: key.trim() });
  }, [settings, persistSettings]);

  const setCardAnimation = useCallback((style: 'flick' | 'peel') => {
    persistSettings({ ...settings, cardAnimation: style });
  }, [settings, persistSettings]);

  const setDeckStyle = useCallback((style: 'stack' | 'sidepeek' | 'fan') => {
    persistSettings({ ...settings, deckStyle: style });
  }, [settings, persistSettings]);

  const setWatchlistView = useCallback((view: ViewMode) => {
    persistSettings({ ...settings, watchlistView: view });
  }, [settings, persistSettings]);

  const setTrendingView = useCallback((view: ViewMode) => {
    persistSettings({ ...settings, trendingView: view });
  }, [settings, persistSettings]);

  const setSeenView = useCallback((view: ViewMode) => {
    persistSettings({ ...settings, seenView: view });
  }, [settings, persistSettings]);

  /** "Next" swipe: cycle the movie to the back of the Watch List. */
  const cycleToBack = useCallback((id: string) => {
    const m = movies.find((x) => x.id === id);
    if (!m) return;
    persist([...movies.filter((x) => x.id !== id), m]);
  }, [movies, persist]);

  const setOnboardingSeen = useCallback(() => {
    persistSettings({ ...settings, onboardingSeen: true });
  }, [settings, persistSettings]);

  /** Paste a reel link → read its caption → TMDB match → add to Inbox. */
  const importReel = useCallback(async (url: string): Promise<boolean> => {
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean)) {
      setImportMessage('That doesn’t look like a link — paste the full reel URL.');
      return false;
    }
    setImporting(true);
    setImportMessage(null);
    try {
      const text = await fetchReelText(clean);
      if (!text) {
        setImportMessage('Couldn’t read that reel (it may be private). You can add the title manually below.');
        return false;
      }
      const match = settings.tmdbKey
        ? await bestMatch(text, settings.tmdbKey)
        : await bestMatchKeyless(text);
      if (match) {
        const imdbRating = await fetchImdbRating(match.tmdbID, match.mediaType, match.title, settings.tmdbKey);
        addMovie({
          title: match.title, year: match.year, mediaType: match.mediaType,
          genres: match.genres, overview: match.overview, posterPath: match.posterPath,
          reelURL: clean, caption: text, notes: '', status: 'watchlist',
          tmdbID: match.tmdbID, imdbRating, originalLanguage: match.originalLanguage, cast: [], needsReview: false,
        });
        setImportMessage(`Added “${match.title}” to your Inbox.`);
        return true;
      }
      const savedTitle = (await fetchReelTitle(clean)) ?? 'Unknown title';
      addMovie({
        title: savedTitle, year: 0, mediaType: 'movie', genres: [],
        overview: '', posterPath: '', reelURL: clean, caption: text, notes: '',
        status: 'watchlist', tmdbID: 0, imdbRating: 0, originalLanguage: '', cast: [], needsReview: true,
      });
      setImportMessage(`Saved “${savedTitle}” — couldn't validate the title. Tap it to Keep It or fix it.`);
      return true;
    } finally {
      setImporting(false);
    }
  }, [settings.tmdbKey, addMovie]);

  /**
   * Re-validates a needsReview entry against its title (or an explicit
   * override). On a match the catalog details are filled in but the user's
   * title is kept; either way needsReview is cleared. No-ops when the movie
   * is missing or no longer needs review.
   */
  const revalidateTitle = useCallback(async (id: string, titleOverride?: string): Promise<void> => {
    const movie = moviesRef.current.find((m) => m.id === id);
    // The ✎ title-save calls this with an override immediately after
    // updateMovie set needsReview: true — before the store's state flush, so
    // the override itself carries the needsReview signal here.
    if (!movie || (!movie.needsReview && !titleOverride)) return;
    const title = (titleOverride ?? movie.title).trim();
    if (!title) return;
    const match = settings.tmdbKey
      ? await bestMatch(title, settings.tmdbKey)
      : await bestMatchKeyless(title);
    if (match) {
      const imdbRating = await fetchImdbRating(match.tmdbID, match.mediaType, match.title, settings.tmdbKey);
      persist(moviesRef.current.map((m) => (m.id === id ? {
        ...m,
        posterPath: match.posterPath,
        overview: match.overview,
        genres: match.genres,
        tmdbID: match.tmdbID,
        imdbRating: imdbRating > 0 ? imdbRating : m.imdbRating,
        originalLanguage: match.originalLanguage,
        needsReview: false,
      } : m)));
    } else {
      persist(moviesRef.current.map((m) => (m.id === id ? { ...m, needsReview: false } : m)));
    }
  }, [persist, settings.tmdbKey]);

  /** Fills in posters/overviews/genres/IMDb ratings for entries missing them. */
  const enrichLibrary = useCallback(async () => {
    setImporting(true);
    try {
      const next = await Promise.all(movies.map(async (m) => {
        let out = m;
        // IMDb rating: works with or without the TMDB key.
        if (!out.imdbRating) {
          const r = await fetchImdbRating(out.tmdbID, out.mediaType, out.title, settings.tmdbKey);
          if (r > 0) out = { ...out, imdbRating: r };
        }
        if (!settings.tmdbKey) return out;
        if (out.posterPath || out.needsReview) return out;
        const match = await bestMatch(`${out.title} ${out.year || ''}`, settings.tmdbKey);
        if (!match) return out;
        return {
          ...out,
          overview: match.overview || out.overview,
          posterPath: match.posterPath || out.posterPath,
          genres: match.genres.length ? match.genres : out.genres,
          originalLanguage: out.originalLanguage || match.originalLanguage,
          tmdbID: match.tmdbID,
        };
      }));
      await persist(next);
    } finally {
      setImporting(false);
    }
  }, [movies, settings.tmdbKey, persist]);

  const value = useMemo<Store>(() => ({
    movies, ready, settings, importing, importMessage, syncState, lastSyncAt,
    moveMovie, deleteMovie, updateMovie, addMovie, addTestMovies, clearLibrary,
    importReel, revalidateTitle, setTmdbKey, setCardAnimation, setDeckStyle, setWatchlistView, setTrendingView, setSeenView, cycleToBack, enrichLibrary, setOnboardingSeen,
  }), [movies, ready, settings, importing, importMessage, syncState, lastSyncAt, moveMovie, deleteMovie, updateMovie, addMovie, addTestMovies, clearLibrary, importReel, revalidateTitle, setTmdbKey, setCardAnimation, setDeckStyle, setWatchlistView, setTrendingView, setSeenView, cycleToBack, enrichLibrary, setOnboardingSeen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
