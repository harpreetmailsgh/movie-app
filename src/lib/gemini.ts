// Gemini YouTube title extraction for the movie app.
// Given a YouTube URL, proxies to the Supabase Edge Function
// `gemini-titles` (which calls Gemini server-side, so the Gemini API key
// never ships in the client bundle). The function accepts
// POST { youtubeUrl } and returns
// { titles: string | null, reason: "ok" | "transient" | "permanent" |
//   "no_movies" | "deadline", status?: number, retryAfterMs?: number }.
// Returns a result object, never throws. The reason tells the caller
// "no movies in this video" (no_movies) from "Gemini is down"
// (transient / deadline / permanent) — previously every failure came
// back as a bare null and the caller could not tell them apart.
//
// One attempt per fetch: the server already retries up to 5x inside one
// invocation (primary + 5 fallback attempts = up to 6 Gemini calls), so
// client retries only multiply a rejecting upstream — one user fetch used
// to fire up to 18 Gemini calls (3 client attempts x 6 server calls).
// A definitive server answer (no_movies / permanent / deadline) costs
// exactly 1 invocation; a transient answer is left for the user's Retry
// tap, which fires a fresh fetch. The server's Retry-After is surfaced
// on the result (retryAfterMs) instead of being retried after a fixed
// delay — the caller decides what to do with it.
//
// Timeout 45s, not 30s: the server deadline is 30s from function entry,
// and entry lags the fetch send by the cold start (~10s), so a 30s client
// timeout aborted the call while the server was still working. The
// server-to-server caller (process-queue) already uses 40s; the client
// is the only 30s caller. The server 30s deadline is unchanged.

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/gemini-titles`;

// 30s server deadline + ~10s cold start + margin. Never below the
// server deadline, or the client saws off the server's work.
const REQUEST_TIMEOUT_MS = 45_000;

export type GeminiFailureReason = 'ok' | 'transient' | 'permanent' | 'no_movies' | 'deadline' | 'unknown';

export type GeminiTitlesResult = {
  /** Trimmed newline-joined titles, or null when none were returned. */
  text: string | null;
  /** Why the call ended the way it did. 'unknown' = the failure happened
   *  on the client side or the server answered without a reason (an older
   *  deployed function) — the kind could not be determined. */
  reason: GeminiFailureReason;
  /** Last Gemini HTTP status the server saw, when reported. */
  httpStatus?: number;
  /** Retry-After Gemini asked for (ms), when reported. */
  retryAfterMs?: number;
};

const KNOWN_REASONS: GeminiFailureReason[] = ['ok', 'transient', 'permanent', 'no_movies', 'deadline'];

function asReason(value: unknown): GeminiFailureReason {
  return typeof value === 'string' && (KNOWN_REASONS as string[]).includes(value)
    ? (value as GeminiFailureReason)
    : 'unknown';
}

export async function fetchGeminiTitles(youtubeUrl: string): Promise<GeminiTitlesResult> {
  try {
    if (!SUPABASE_URL) {
      console.log('[gemini] no Supabase URL configured — returning null');
      return { text: null, reason: 'unknown' };
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

      if (response.ok) {
        const data: unknown = await response.json();

        if (data && typeof data === 'object') {
          const titles = (data as { titles?: unknown }).titles;
          const reason = asReason((data as { reason?: unknown }).reason);
          const httpStatus = (data as { status?: unknown }).status;
          const retryAfterMs = (data as { retryAfterMs?: unknown }).retryAfterMs;
          const result: GeminiTitlesResult = {
            text: typeof titles === 'string' && titles.trim() ? titles.trim() : null,
            reason: typeof titles === 'string' && titles.trim() ? 'ok' : reason,
            ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
            ...(typeof retryAfterMs === 'number' ? { retryAfterMs } : {}),
          };
          if (result.text) {
            console.log('[gemini] ok, titles returned');
          } else {
            console.log(`[gemini] ok but empty titles (reason: ${result.reason})`);
          }
          return result;
        }
        console.log('[gemini] ok but malformed body');
        return { text: null, reason: 'unknown' };
      }

      console.log(`[gemini] HTTP ${response.status}`);
      return { text: null, reason: 'unknown', httpStatus: response.status };
    } catch (e) {
      // Timeout (AbortError — the 45s budget burned in transit or on a
      // slow server) vs network error: both are transient — the server
      // may still be working, so a fresh Retry tap is the only retry.
      const errorName = e instanceof Error ? e.name : 'unknown';
      console.log(`[gemini] error ${errorName}`);
      return { text: null, reason: 'transient' };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return { text: null, reason: 'unknown' };
  }
}
