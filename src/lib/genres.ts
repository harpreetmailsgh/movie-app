/** TMDB genre IDs rarely change, so they are bundled instead of fetched. */
const NAMES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics',
};

export function genreNames(ids: number[]): string[] {
  const seen: string[] = [];
  for (const id of ids) {
    const name = NAMES[id];
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/** Every known genre name, for the genre filter dropdown. */
export const ALL_GENRES: string[] = [...new Set(Object.values(NAMES))].sort();
