// Gemini YouTube title extraction for the movie app.
// Given a YouTube URL, asks Gemini to list movie titles mentioned or shown
// in the video. Returns the raw model text, or null when there is no API
// key, the request fails, or the video contains no movies.
// Never throws.

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const PROMPT =
  'List every movie title mentioned, shown, or discussed in this video. Return only the titles, one per line, with year in parentheses when stated. If no movies appear, reply with exactly: NONE';

const REQUEST_TIMEOUT_MS = 30_000;

type GeminiPart = { text?: string };
type GeminiCandidate = { content?: { parts?: GeminiPart[] } };

export async function fetchGeminiTitles(youtubeUrl: string): Promise<string | null> {
  try {
    if (!GEMINI_KEY) {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { fileData: { fileUri: youtubeUrl } },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data: unknown = await response.json();

      if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as { candidates?: unknown }).candidates)
      ) {
        return null;
      }

      const candidates = (data as { candidates: GeminiCandidate[] }).candidates;
      const text =
        candidates[0]?.content?.parts
          ?.map((part) => part?.text ?? '')
          .join('')
          .trim() ?? '';

      if (!text || text.toUpperCase() === 'NONE') {
        return null;
      }

      return text;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return null;
  }
}
