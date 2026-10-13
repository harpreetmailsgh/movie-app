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

export async function fetchGeminiTitles(youtubeUrl: string): Promise<string | null> {
  try {
    if (!SUPABASE_URL) {
      return null;
    }

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

      if (!response.ok) {
        return null;
      }

      const data: unknown = await response.json();

      if (!data || typeof data !== 'object') {
        return null;
      }

      const titles = (data as { titles?: unknown }).titles;

      if (typeof titles !== 'string' || !titles.trim()) {
        return null;
      }

      return titles.trim();
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return null;
  }
}
