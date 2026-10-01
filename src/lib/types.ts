export type EntryStatus = 'watchlist' | 'seen';

export interface Movie {
  id: string;
  title: string;
  year: number;
  mediaType: 'movie' | 'tv';
  genres: string[];
  overview: string;
  posterPath: string; // TMDB path like "/abc123.jpg"
  reelURL: string;
  caption: string;
  notes: string;
  status: EntryStatus;
  tmdbID: number;
  trailerKey?: string; // YouTube key for the official trailer, resolved at enrich/backfill time
  originalLanguage: string; // human-readable, e.g. "English"
  cast: string[]; // top-billed actor names
  imdbRating: number; // 0 = unknown
  needsReview: boolean;
  dateAdded: number;
}

export type CardAnimation = 'flick' | 'peel';
export type DeckStyle = 'stack' | 'sidepeek' | 'fan';
export type ViewMode = 'cards' | 'tiles' | 'list';

export interface Settings {
  tmdbKey: string;
  onboardingSeen: boolean;
  privacySeen: boolean;
  cardAnimation: CardAnimation;
  deckStyle: DeckStyle;
  watchlistView: ViewMode;
  trendingView: ViewMode;
  seenView: ViewMode;
}

export const STATUS_META: Record<EntryStatus, { title: string; icon: string }> = {
  watchlist: { title: 'Watch List', icon: 'bookmark' },
  seen: { title: 'Seen', icon: 'eye' },
};

export function posterUrl(path: string, size: 'w342' | 'w780' = 'w342'): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path; // keyless (Cinemeta) results store full URLs
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/** Public TMDB page for a movie/show — the source of its description text. */
export function tmdbUrl(tmdbID: number, mediaType: 'movie' | 'tv'): string | null {
  if (!tmdbID) return null;
  return `https://www.themoviedb.org/${mediaType}/${tmdbID}`;
}

/** YouTube search for the title's official trailer — no API key needed. */
export function trailerSearchUrl(title: string, year: number): string {
  const q = encodeURIComponent(`${title}${year > 0 ? ` ${year}` : ''} official trailer`);
  return `https://www.youtube.com/results?search_query=${q}`;
}
