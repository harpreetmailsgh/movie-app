import { Movie, EntryStatus } from './types';

interface Seed {
  title: string;
  year: number;
  mediaType: 'movie' | 'tv';
  genres: string[];
  notes: string;
  reelURL: string;
  tmdbID: number;
  imdbRating: number;
  posterPath: string; // TMDB path like "/abc123.jpg"
  overview: string;
  originalLanguage: string;
  cast: string[];
}

const SEEDS: Seed[] = [
  { title: '127 Hours', year: 2010, mediaType: 'movie', genres: ['Drama', 'Adventure', 'Thriller'], notes: 'Survival drama based on a true story.', reelURL: 'https://www.facebook.com/reel/2152123755725121/', tmdbID: 44115, imdbRating: 7.5, posterPath: '/h0RMdn0rfl9l5hWXz3tUh6QVkhi.jpg', overview: 'The true story of mountain climber Aron Ralston\u2019s remarkable adventure to save himself after a fallen boulder crashes on his arm and traps him in an isolated canyon in Utah.', originalLanguage: 'English', cast: ['James Franco', 'Kate Mara', 'Amber Tamblyn', 'Cl\u00e9mence Po\u00e9sy', 'Lizzy Caplan'] },
  { title: 'Cast Away', year: 2000, mediaType: 'movie', genres: ['Drama', 'Adventure'], notes: 'On JioHotstar; rent on Amazon Video / Apple TV.', reelURL: 'https://www.facebook.com/reel/2152123755725121/', tmdbID: 8358, imdbRating: 7.8, posterPath: '/7lLJgKnAicAcR5UEuo8xhSMj18w.jpg', overview: 'Chuck Noland, a top international manager for FedEx, and Kelly, a Ph.D. student, are in love and heading towards marriage. Then Chuck\u2019s plane to Malaysia crashes at sea during a terrible storm. He\u2019s the only survivor, and finds himself marooned on a desolate island. With no way to escape, Chuck must find ways to survive in his new home.', originalLanguage: 'English', cast: ['Tom Hanks', 'Helen Hunt', 'Nick Searcy', 'Jenifer Lewis', 'Geoffrey Blake'] },
  { title: 'Y Tu Mam\u00e1 Tambi\u00e9n', year: 2001, mediaType: 'movie', genres: ['Drama', 'Romance'], notes: '', reelURL: 'https://www.facebook.com/reel/1324226799580925/', tmdbID: 1391, imdbRating: 7.7, posterPath: '/aj3rqjab8jfc2fWmcS3H3c5qbur.jpg', overview: 'In Mexico, two teenage boys and an attractive older woman embark on a road trip and learn a thing or two about life, themselves, and each other.', originalLanguage: 'Spanish', cast: ['Maribel Verd\u00fa', 'Gael Garc\u00eda Bernal', 'Diego Luna', 'Daniel Gim\u00e9nez Cacho', 'Diana Bracho'] },
  { title: 'Dogtooth', year: 2009, mediaType: 'movie', genres: ['Drama', 'Thriller', 'Comedy'], notes: 'Psychological thriller. On MUBI India.', reelURL: 'https://www.facebook.com/reel/2184156632150183/', tmdbID: 38810, imdbRating: 7.1, posterPath: '/7nLuUGlH12cegPfR84QX4xIIH9k.jpg', overview: 'Three teenagers are confined to an isolated country estate and spend their days playing endless games of make-believe, with their parents acting as referees. Seizing every opportunity to break free, the children ultimately take matters into their own hands.', originalLanguage: 'Greek', cast: ['Christos Stergioglou', 'Michele Valley', 'Hristos Passalis', 'Angeliki Papoulia', 'Mary Tsoni'] },
  { title: 'The 120 Days of Bottrop', year: 1997, mediaType: 'movie', genres: ['Drama'], notes: '', reelURL: 'https://www.facebook.com/reel/1319480956722627/', tmdbID: 0, imdbRating: 0, posterPath: '', overview: '', originalLanguage: '', cast: [] },
  { title: 'Rao Bahadur', year: 2026, mediaType: 'movie', genres: ['Drama'], notes: 'Indian film. On Netflix India.', reelURL: 'https://www.facebook.com/reel/2127843204430324/', tmdbID: 1443961, imdbRating: 8.5, posterPath: '/9hzKAJImKEHBz0vnF5EazPMA8D4.jpg', overview: 'Plagued by guilt and fear, an eccentric aristocrat retreats into his ancestral manor, creating an alternate world that deeply blurs reality and imagination.', originalLanguage: 'Telugu', cast: ['Satyadev Kancharana', 'Vikas Muppala', 'Deepa Thomas', 'Master Kiran', 'Pranay Vaka'] },
  { title: 'Synchronic', year: 2019, mediaType: 'movie', genres: ['Sci-Fi', 'Thriller', 'Drama'], notes: 'Time-travel thriller. On Netflix India.', reelURL: 'https://www.facebook.com/reel/1304514248422805/', tmdbID: 549294, imdbRating: 6.2, posterPath: '/wgm4gdJwb7iSYX0uBsRAZmHQmPm.jpg', overview: 'Two New Orleans paramedics\u2019 lives are ripped apart after encountering a series of horrific deaths linked to a designer drug with bizarre, otherworldly effects.', originalLanguage: 'English', cast: ['Anthony Mackie', 'Jamie Dornan', 'Katie Aselton', 'Alexia Ioannides', 'Ramiz Monsef'] },
  { title: 'The Call', year: 2020, mediaType: 'movie', genres: ['Thriller', 'Mystery'], notes: 'Korean time-travel thriller. On Netflix India.', reelURL: 'https://www.facebook.com/reel/1304514248422805/', tmdbID: 575604, imdbRating: 7.1, posterPath: '/oz8hvZHg7tIdGwh0ErPRhobJKPR.jpg', overview: 'Connected by phone in the same home but 20 years apart, a caller puts a woman\u2019s past \u2014 and life \u2014 on the line to change her own fate.', originalLanguage: 'Korean', cast: ['Park Shin-hye', 'Jeon Jong-seo', 'Kim Sung-ryung', 'Lee El', 'Park Ho-san'] },
  { title: 'Predestination', year: 2014, mediaType: 'movie', genres: ['Sci-Fi', 'Thriller'], notes: 'Time-travel thriller. On Prime Video India.', reelURL: 'https://www.facebook.com/reel/1304514248422805/', tmdbID: 206487, imdbRating: 7.4, posterPath: '/38Xr1JnV1ZcLQ55zmdSp6n475cZ.jpg', overview: 'Predestination chronicles the life of a Temporal Agent sent on an intricate series of time-travel journeys designed to prevent future killers from committing their crimes. Now, on his final assignment, the Agent must stop the one criminal that has eluded him throughout time and prevent a devastating attack in which thousands of lives will be lost.', originalLanguage: 'English', cast: ['Ethan Hawke', 'Sarah Snook', 'Noah Taylor', 'Christopher Kirby', 'Madeleine West'] },
  { title: 'The Secret Life of Walter Mitty', year: 2013, mediaType: 'movie', genres: ['Adventure', 'Comedy', 'Drama'], notes: '', reelURL: 'https://www.facebook.com/reel/3926293391013417/', tmdbID: 116745, imdbRating: 7.3, posterPath: '/iAo1hlzsPV9XpYcLQp6Ud065tGO.jpg', overview: 'A timid magazine photo manager who lives life vicariously through daydreams embarks on a true-life adventure when a negative goes missing.', originalLanguage: 'English', cast: ['Ben Stiller', 'Kristen Wiig', 'Sean Penn', 'Shirley MacLaine', 'Adam Scott'] },
  { title: 'Devs', year: 2020, mediaType: 'tv', genres: ['Sci-Fi', 'Drama', 'Mystery'], notes: 'Sci-fi limited series, 8 episodes.', reelURL: 'https://www.facebook.com/reel/1039168208890800/', tmdbID: 81349, imdbRating: 7.6, posterPath: '/uv63iNWOh69bSJYJQZjiX6n8B3m.jpg', overview: 'Young computer engineer Lily Chan investigates the secretive development division of her employer, a cutting-edge tech company based in San Francisco, which she believes is behind the murder of her boyfriend.', originalLanguage: 'English', cast: ['Sonoya Mizuno', 'Nick Offerman', 'Jin Ha', 'Cailee Spaeny', 'Stephen McKinley Henderson'] },
  { title: 'Fringe', year: 2008, mediaType: 'tv', genres: ['Sci-Fi', 'Drama', 'Mystery'], notes: 'Sci-fi series, 5 seasons. On Prime Video India.', reelURL: 'https://www.facebook.com/reel/1039168208890800/', tmdbID: 1705, imdbRating: 8.4, posterPath: '/sY9hg5dLJ93RJOyKEiu1nAtBRND.jpg', overview: 'FBI Special Agent Olivia Dunham, brilliant but formerly institutionalized scientist Walter Bishop and his scheming, reluctant son Peter uncover a deadly mystery involving a series of unbelievable events and realize they may be a part of a larger, more disturbing pattern that blurs the line between science fiction and technology.', originalLanguage: 'English', cast: ['Anna Torv', 'Joshua Jackson', 'Jasika Nicole', 'John Noble', 'Lance Reddick'] },
  { title: 'Counterpart', year: 2017, mediaType: 'tv', genres: ['Sci-Fi', 'Thriller', 'Drama'], notes: 'Parallel-universe spy series, 2 seasons. On Prime Video India.', reelURL: 'https://www.facebook.com/reel/1039168208890800/', tmdbID: 63646, imdbRating: 8.0, posterPath: '/fVTpkoTkl7LJSoVCnuoHRPJvS4o.jpg', overview: 'Howard Silk is a lowly cog in a bureaucratic UN agency who is turning the last corner of a life filled with regret when he discovers the agency he works for is guarding a secret: a crossing to a parallel dimension.', originalLanguage: 'English', cast: ['J.K. Simmons', 'Nazanin Boniadi', 'Harry Lloyd', 'Olivia Williams', 'Sara Serraiocco'] },
  { title: 'The Office (US)', year: 2005, mediaType: 'tv', genres: ['Comedy'], notes: 'Comedy series. On Netflix India and Prime Video India.', reelURL: 'https://www.facebook.com/reel/4577862265775749/', tmdbID: 2316, imdbRating: 9.0, posterPath: '/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg', overview: 'The everyday lives of office employees in the Scranton, Pennsylvania branch of the fictional Dunder Mifflin Paper Company.', originalLanguage: 'English', cast: ['Rainn Wilson', 'John Krasinski', 'Jenna Fischer', 'Leslie David Baker', 'Brian Baumgartner'] },
];

export function seedMovies(): Movie[] {
  const now = Date.now();
  return SEEDS.map((s, i) => ({
    id: `seed-${i}-${now}`,
    title: s.title,
    year: s.year,
    mediaType: s.mediaType,
    genres: s.genres,
    overview: s.overview,
    posterPath: s.posterPath,
    reelURL: s.reelURL,
    caption: '',
    notes: s.notes,
    status: 'watchlist',
    tmdbID: s.tmdbID,
    imdbRating: s.imdbRating,
    originalLanguage: s.originalLanguage,
    cast: s.cast,
    needsReview: false,
    dateAdded: now + i,
  }));
}

/**
 * Fills in poster/overview/TMDB data for movies that were saved before the
 * enriched seed data existed. Matches by exact title; never overwrites fields
 * the user (or a later import) already filled in.
 */
export function backfillSeedData(movies: Movie[]): { movies: Movie[]; changed: boolean } {  let changed = false;
  const next = movies.map((m) => {
    const seed = SEEDS.find((s) => s.title === m.title);
    let out = m;
    // IMDb rating: fill for any seed match missing it (even if poster exists).
    if (seed && !out.imdbRating && seed.imdbRating) {
      out = { ...out, imdbRating: seed.imdbRating };
      changed = true;
    }
    if (out.posterPath) return out;
    if (!seed || !seed.posterPath) return out;
    changed = true;
    return {
      ...out,
      overview: out.overview || seed.overview,
      posterPath: seed.posterPath,
      tmdbID: out.tmdbID || seed.tmdbID,
      originalLanguage: out.originalLanguage || seed.originalLanguage,
      cast: out.cast && out.cast.length > 0 ? out.cast : seed.cast,
      genres: out.genres && out.genres.length > 0 ? out.genres : seed.genres,
    };
  });
  return { movies: next, changed };
}

/**
 * Movies saved by older versions of the app may be missing fields that were
 * added later (cast, originalLanguage, …). Fill every gap with a safe default
 * so rendering code never sees `undefined`.
 */
export function normalizeMovie(m: Movie): Movie {
  // Migration: the old Inbox is gone — everything lands in the Watch List.
  // Anything trashed under the old model is dropped for good.
  const status = (m.status as string) === 'inbox' ? 'watchlist' : m.status;
  return {
    ...m,
    status: (status === 'watchlist' || status === 'seen' ? status : 'watchlist') as EntryStatus,
    overview: m.overview ?? '',
    posterPath: m.posterPath ?? '',
    reelURL: m.reelURL ?? '',
    caption: m.caption ?? '',
    notes: m.notes ?? '',
    genres: m.genres ?? [],
    tmdbID: m.tmdbID ?? 0,
    // || not ??: old saves can carry the field as an empty string, which must
    // fall back to the default rather than stick.
    trailerKey: m.trailerKey || '',
    originalLanguage: m.originalLanguage ?? '',
    cast: m.cast ?? [],
    imdbRating: m.imdbRating ?? 0,
  };
}
