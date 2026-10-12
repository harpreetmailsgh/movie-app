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
  /** Per-tab first-time guide flags (replaced the single onboardingSeen). */
  guideSeenWatchlist: boolean;
  guideSeenTrending: boolean;
  guideSeenSeen: boolean;
  privacySeen: boolean;
  /** First-time guide seed (top-5 IMDb movies) has run — never seed twice. */
  seeded: boolean;
  cardAnimation: CardAnimation;
  deckStyle: DeckStyle;
  watchlistView: ViewMode;
  trendingView: ViewMode;
  seenView: ViewMode;
  /** One-time migration: seen default changed tiles → list (v1.6.32). */
  seenViewMigrated?: boolean;
}

export const STATUS_META: Record<EntryStatus, { title: string; icon: string }> = {
  watchlist: { title: 'Watch List', icon: 'bookmark' },
  seen: { title: 'Seen', icon: 'eye' },
};

export function posterUrl(path: string, size: 'w342' | 'w500' | 'w780' = 'w500'): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return upscaleKeylessPoster(path); // keyless (Cinemeta) results store full URLs
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * Keyless (Cinemeta) posters are absolute URLs. Where the URL carries a
 * resizable size segment, swap it for the largest available rendition;
 * anything else passes through untouched (limitation: hosts without a
 * resizable size segment can't be upscaled — e.g. metahub/fanart URLs).
 */
function upscaleKeylessPoster(url: string): string {
  // TMDB image CDN: /t/p/<size>/… → /t/p/original/… (largest available).
  if (/image\.tmdb\.org\/t\/p\/w\d+\//.test(url)) {
    return url.replace(/(image\.tmdb\.org\/t\/p\/)w\d+(\/)/, '$1original$2');
  }
  // IMDb media CDN: …_V1_SX250.jpg → …_V1_.jpg (strip the size cap → original).
  if (/_V1_(SX|SY|UX|UY)\d+/.test(url)) {
    return url.replace(/_V1_(SX|SY|UX|UY)\d+/, '_V1_');
  }
  return url;
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
