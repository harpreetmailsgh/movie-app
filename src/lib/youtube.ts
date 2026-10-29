/**
 * Best-effort YouTube fallback for trailers. When TMDB has no trailer for a
 * title, the top organic result of "<title> <year> official trailer" is
 * almost always the real trailer — so we play that video directly instead of
 * showing a search page. Scrapes the public search page's embedded JSON;
 * returns the 11-char video id or null.
 */
export async function firstYoutubeResultId(query: string): Promise<string | null> {
  try {
    const url =
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        // A desktop Chrome UA gets the full results HTML; the default
        // React Native UA can get an empty/bot-walled response.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Parse a YouTube video id from watch / Shorts / youtu.be URLs, or null. */
export function parseYouTubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const idPattern = /^[A-Za-z0-9_-]{11}$/;
  const ok = (v: string | null): string | null =>
    v && idPattern.test(v) ? v : null;
  if (
    host === 'www.youtube.com' ||
    host === 'youtube.com' ||
    host === 'm.youtube.com'
  ) {
    if (u.pathname === '/watch') return ok(u.searchParams.get('v'));
    const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shorts) return ok(shorts[1]);
    return null;
  }
  if (host === 'youtu.be') {
    return ok(u.pathname.split('/').filter(Boolean)[0] ?? null);
  }
  return null;
}

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  author: string;
}

/**
 * Timeout for import-path metadata fetches (oEmbed / watch-page scrape):
 * 15s — long enough for a full YouTube page on a slow device, far below
 * the queue's script drain window, and bounded so one hung import fails
 * fast instead of stalling the strictly sequential queue forever.
 * Same AbortController pattern as lib/gemini.ts (30s) and lib/tmdb.ts (6s).
 */
const IMPORT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Keyless video title/author via YouTube's public oEmbed endpoint.
 * Returns null for private, removed, or otherwise unreadable videos.
 * A timed-out fetch also returns null, so the caller takes its existing
 * "couldn't read that video" error path instead of hanging.
 */
export async function fetchYouTubeTitle(
  url: string
): Promise<YouTubeVideoInfo | null> {
  const videoId = parseYouTubeId(url);
  if (!videoId) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    IMPORT_FETCH_TIMEOUT_MS
  );
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        url.trim()
      )}&format=json`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = (data?.title ?? '').trim();
    if (!title) return null;
    return { videoId, title, author: (data?.author_name ?? '').trim() };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
