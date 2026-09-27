import type { Movie } from './types';

// In-memory cache of last-viewed feed items (e.g. Trending), keyed by id.
// The detail page consults this only as a FALLBACK when the library lookup
// misses — feed items carry a placeholder status and must never be written
// into the library.
const feedCache = new Map<string, Movie>();

export function cacheFeedItem(item: Movie): void {
  feedCache.set(item.id, item);
}

export function getFeedItem(id: string): Movie | undefined {
  return feedCache.get(id);
}
