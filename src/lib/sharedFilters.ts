import { useSyncExternalStore } from 'react';
import {
  EMPTY_FILTERS,
  FilterValues,
  ratingMatches,
  yearMatches,
} from '../components/FilterBar';
import { Movie } from './types';

/**
 * Shared filter state for the Watchlist / Trending / Seen tabs.
 * One module-level store (via useSyncExternalStore) so all three tabs read
 * and write the same filters. Session-only: never persisted, resets on reload.
 */
let state: FilterValues = { ...EMPTY_FILTERS };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FilterValues {
  return state;
}

function setFilters(v: FilterValues) {
  state = v;
  listeners.forEach((l) => l());
}

export function useSharedFilters(): [FilterValues, (v: FilterValues) => void] {
  const filters = useSyncExternalStore(subscribe, getSnapshot);
  return [filters, setFilters];
}

/**
 * Type/genre/language/year/rating predicate, same as the inline filter the
 * Watchlist cards view used to have. Unknown-value rule: an item with
 * originalLanguage '' or imdbRating 0 never matches a selected option, so it
 * simply drops out when that filter is set; with filters cleared it shows up.
 */
export function applyFilters(movies: Movie[], f: FilterValues): Movie[] {
  return movies.filter(
    (m) =>
      (f.type === null ||
        (f.type === 'Movies' ? m.mediaType === 'movie' : m.mediaType === 'tv')) &&
      (f.genre.length === 0 || f.genre.some((g) => m.genres.includes(g))) &&
      (f.language.length === 0 || f.language.includes(m.originalLanguage)) &&
      (f.year === null || yearMatches(m.year, f.year)) &&
      (f.rating === null || ratingMatches(m.imdbRating, f.rating))
  );
}
