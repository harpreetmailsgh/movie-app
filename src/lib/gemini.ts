// Gemini YouTube title extraction for the movie app.
// Given a YouTube URL, proxies to the Supabase Edge Function
// `gemini-titles` (which calls Gemini server-side, so the Gemini API key
// never ships in the client bundle). The function accepts
// POST { youtubeUrl } and returns { titles: string | null }.
// Returns the trimmed titles text, or null when the Supabase URL is not
// configured, the request fails, or the video contains no movies.
// Never throws.

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gemini-titles`;

const REQUEST_TIMEOUT_MS = 30_000;

// Retry: the Gemini call intermittently comes back empty on the phone
// (timeout / network / empty titles) while the server side is healthy,
// so retry the POST up to 2 more times (3 attempts total) with a short
// backoff between attempts before giving up and returning null.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [3_000, 6_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGeminiTitles(youtubeUrl: string): Promise<string | null> {
  try {
    if (!SUPABASE_URL) {
      return null;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
          signal: controller.signal,
          body: JSON.stringify({ youtubeUrl }),
        });

        if (response.ok) {
          const data: unknown = await response.json();

          if (data && typeof data === 'object') {
            const titles = (data as { titles?: unknown }).titles;

            if (typeof titles === 'string' && titles.trim()) {
              return titles.trim();
            }
          }
        }
      } catch {
        // Timeout / network error: fall through to the retry below.
      } finally {
        clearTimeout(timeoutId);
      }

      // Empty result (non-OK response, empty titles, or a caught error):
      // wait, then try again — unless this was the last attempt.
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
      }
    }

    return null;
  } catch {
    return null;
  }
}
