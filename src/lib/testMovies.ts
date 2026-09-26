/**
 * A pool of well-known movies (varied eras, genres, languages) used to fill
 * the Inbox with test data. Titles are resolved through the keyless
 * Cinemeta search at tap time, so no API key is needed.
 */
export const TEST_TITLES: string[] = [
  'The Shawshank Redemption',
  'The Godfather',
  'The Dark Knight',
  'Pulp Fiction',
  'Forrest Gump',
  'Inception',
  'The Matrix',
  'Goodfellas',
  'Interstellar',
  'Parasite',
  'The Silence of the Lambs',
  'Gladiator',
  'Titanic',
  'Avatar',
  'Joker',
  'Dune',
  'Oppenheimer',
  'The Social Network',
  'Whiplash',
  'La La Land',
  'The Grand Budapest Hotel',
  'Mad Max: Fury Road',
  'Get Out',
  'The Revenant',
  'Slumdog Millionaire',
  '3 Idiots',
  'Dangal',
  'The Lunchbox',
  'Gangs of Wasseypur',
  'Andhadhun',
  'Spirited Away',
  'Your Name',
  'Oldboy',
  'Amélie',
  'The Intouchables',
  'City of God',
  'A Separation',
  'The Lives of Others',
  "Pan's Labyrinth",
  'Coco',
];

/** Shuffled subset of `count` titles, skipping anything in `exclude` (lowercased). */
export function pickRandomTitles(count: number, exclude: Set<string>): string[] {
  const pool = TEST_TITLES.filter((t) => !exclude.has(t.toLowerCase()));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
