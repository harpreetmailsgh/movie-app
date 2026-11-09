// Supabase Edge Function: gemini-titles
// POST { "youtubeUrl": string } -> { "titles": string | null, "reason": "ok" | "transient" | "permanent" | "no_movies" | "deadline", "status"?: number, "retryAfterMs"?: number }
// Asks Gemini to list every movie title mentioned, shown, or discussed
// in a YouTube video. Titles are returned as a single newline-joined
// string (or null). Failures always return 200 with titles null plus a
// `reason` saying why — the client must be able to tell "no movies in
// this video" (no_movies) from "Gemini is down" (transient / deadline).
//
// Resilience strategy: the primary model (gemini-flash-latest) gets ONE
// fast-fail attempt (10s timeout) because its serving endpoint currently
// hangs. The fallback model (gemini-3.6-flash) gets up to 5 attempts with
// retries on transient errors (1s -> 2s -> 4s -> 6s, plus jitter). A hard
// 30s deadline caps the whole function from entry.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const PRIMARY_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-3.6-flash";

const PROMPT =
  "List every movie title mentioned, shown, or discussed in this video. " +
  "Return only the titles, one per line, with year in parentheses when stated. " +
  "If no movies appear, reply with exactly: NONE";

// Hard cap: stop everything (and return null) past this point from entry.
const FUNCTION_DEADLINE_MS = 30_000;
// Primary model fails fast — its endpoint currently hangs.
const PRIMARY_ATTEMPT_TIMEOUT_MS = 10_000;
// Fallback attempts may take longer, but no single attempt may eat the
// whole deadline budget.
const FALLBACK_ATTEMPT_TIMEOUT_MS = 15_000;
// Waits between fallback attempts (before attempts 2, 3, 4, 5). Jitter is
// added to each wait. Retry-After headers can extend these waits.
const FALLBACK_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 6_000];
const FALLBACK_MAX_ATTEMPTS = FALLBACK_RETRY_DELAYS_MS.length + 1;

// Transient: retry the same model (primary never retries — one attempt).
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
// Permanent: fail immediately to the next model (or null on fallback).
const PERMANENT_STATUSES = new Set([400, 401, 403, 404]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function validYoutubeUrl(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("http");
}

function geminiUrl(model: string): string {
  return `${GEMINI_API_BASE}/${model}:generateContent`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addJitter(delayMs: number): number {
  return delayMs * (0.8 + 0.4 * Math.random());
}

function parseRetryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after");
  if (header === null) return 0;
  const trimmed = header.trim();
  const seconds = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1_000;
  // Retry-After may also be an HTTP date.
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return 0;
}

type AttemptResult =
  | { status: "success"; titles: string | null }
  | { status: "transient"; retryAfterMs: number; httpStatus?: number; errorExcerpt?: string; failureKind?: "timeout" | "network" }
  | { status: "permanent"; httpStatus?: number; errorExcerpt?: string }
  | { status: "malformed"; httpStatus?: number }
  | { status: "deadline" };

// One request to one model with its own timeout. Fresh AbortController per
// attempt: a signal aborts once and stays aborted, so sharing one across
// attempts would make later attempts reject instantly.
async function attemptRequest(
  apiKey: string,
  youtubeUrl: string,
  model: string,
  attemptTimeoutMs: number,
  deadlineMs: number,
): Promise<AttemptResult> {
  if (Date.now() >= deadlineMs) return { status: "deadline" };

  // The deadline always wins: even a hanging attempt must be aborted the
  // moment the 30s budget is spent, so a slow attempt can never consume
  // time past the deadline.
  const remainingMs = Math.max(0, deadlineMs - Date.now());
  const effectiveTimeoutMs = Math.min(attemptTimeoutMs, remainingMs);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    const res = await fetch(geminiUrl(model), {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
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
      signal: controller.signal,
    });

    if (!res.ok) {
      // Read the error body (bounded) BEFORE releasing the connection:
      // Gemini's error body carries the quota/reset detail (e.g. "Quota
      // exceeded…", retryDelay) that decides the remedy (429 vs 5xx).
      // Previously the body was cancelled unread and only the category
      // "transient" survived, so no log could ever say 429 vs 5xx.
      const retryAfterMs = parseRetryAfterMs(res);
      let errorExcerpt = "";
      try {
        const bodyText = await res.text();
        errorExcerpt = bodyText.slice(0, 500);
      } catch {
        // Body unreadable — keep the status, drop the excerpt.
      }
      console.log(
        `[gemini-titles] ${model}: HTTP ${res.status}` +
          ` retry-after=${retryAfterMs}ms` +
          (errorExcerpt ? ` body=${JSON.stringify(errorExcerpt.slice(0, 200))}` : ""),
      );
      if (Date.now() >= deadlineMs) return { status: "deadline" };
      if (TRANSIENT_STATUSES.has(res.status)) {
        return { status: "transient", retryAfterMs, httpStatus: res.status, errorExcerpt };
      }
      if (PERMANENT_STATUSES.has(res.status)) {
        return { status: "permanent", httpStatus: res.status, errorExcerpt };
      }
      // Any other status: don't retry, but don't treat it as success —
      // fail over to the next model.
      return { status: "permanent", httpStatus: res.status, errorExcerpt };
    }

    const data: unknown = await res.json();
    const parts = (data as { candidates?: { content?: { parts?: unknown } }[] })
      ?.candidates?.[0]?.content?.parts;
    // A 200 with a malformed body is a contract issue, not transient —
    // never retry it. The fallback model gets its own chance.
    if (!Array.isArray(parts)) return { status: "malformed", httpStatus: res.status };
    return { status: "success", titles: titlesFromParts(parts) };
  } catch (e) {
    // Timeout vs network are different failures and used to return an
    // identical "transient" — distinguish them so the log can tell a
    // hanging endpoint (AbortError) from a broken connection.
    const failureKind = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    console.log(`[gemini-titles] ${model}: attempt error ${failureKind}`);
    if (Date.now() >= deadlineMs) return { status: "deadline" };
    return { status: "transient", retryAfterMs: 0, failureKind };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Canonical watch URL for a YouTube link, or the input unchanged when no
 *  video id parses. Gemini fetches the fileUri verbatim, and Shorts /
 *  youtu.be forms may not behave like watch form — normalize first. */
function canonicalYouTubeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    const idPattern = /^[A-Za-z0-9_-]{11}$/;
    const ok = (v: string | null): string | null =>
      v && idPattern.test(v) ? v : null;
    let id: string | null = null;
    if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") id = ok(u.searchParams.get("v"));
      else {
        const shorts = u.pathname.match(/^\/shorts\/([^/?#]+)/);
        if (shorts) id = ok(shorts[1]);
      }
    } else if (host === "youtu.be") {
      id = ok(u.pathname.split("/").filter(Boolean)[0] ?? null);
    }
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  } catch {
    return url;
  }
}

function titlesFromParts(parts: unknown[]): string | null {
  const text = parts
    .map((p) => (typeof (p as { text?: unknown })?.text === "string"
      ? (p as { text: string }).text
      : ""))
    .join("")
    .trim();
  if (text === "" || text.toUpperCase() === "NONE") return null;
  const titles = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line.toUpperCase() !== "NONE");
  return titles.length > 0 ? titles.join("\n") : null;
}

/** Why a gemini-titles call ended the way it did. `ok` = titles returned;
 * `no_movies` = Gemini answered NONE (the video genuinely contains no
 * movies); `transient` = a retryable Gemini failure (429 / 5xx / timeout /
 * network); `permanent` = a non-retryable Gemini failure (400 / 401 / 403 /
 * 404 / malformed) or a bad request (invalid URL, missing key);
 * `deadline` = the 30 s function budget ran out. The client needs this to
 * tell "no movies in this video" from "Gemini is down" — previously every
 * failure came back as a bare 200 { titles: null }. */
export type GeminiFailureReason = "ok" | "transient" | "permanent" | "no_movies" | "deadline";

export type ExtractResult = {
  titles: string | null;
  reason: GeminiFailureReason;
  /** Last Gemini HTTP status seen, when one was observed. */
  status?: number;
  /** Longest Retry-After Gemini asked for, when one was given. */
  retryAfterMs?: number;
};

async function extractTitles(apiKey: string, youtubeUrl: string): Promise<ExtractResult> {
  const deadlineMs = Date.now() + FUNCTION_DEADLINE_MS;

  // Primary model: exactly one attempt, fail fast.
  const primary = await attemptRequest(
    apiKey,
    youtubeUrl,
    PRIMARY_MODEL,
    PRIMARY_ATTEMPT_TIMEOUT_MS,
    deadlineMs,
  );
  if (primary.status === "deadline") {
    console.log("[gemini-titles] primary deadline — returning null");
    return { titles: null, reason: "deadline" };
  }
  if (primary.status === "success") {
    // A success with no titles is Gemini's NONE — genuinely no movies,
    // not a failure. Thread that distinction out instead of collapsing
    // it to a bare null.
    return { titles: primary.titles, reason: primary.titles ? "ok" : "no_movies" };
  }
  console.log(`[gemini-titles] primary ${PRIMARY_MODEL}: ${primary.status}${"httpStatus" in primary && primary.httpStatus !== undefined ? ` (HTTP ${primary.httpStatus})` : ""}${primary.status === "transient" && primary.failureKind ? ` (${primary.failureKind})` : ""} — falling back`);
  // Transient, permanent, or malformed on the primary: move on to fallback
  // (the primary is never retried — one attempt by design).

  // Fallback model: up to 5 attempts with retries on transient errors.
  let lastTransient: { retryAfterMs: number; httpStatus?: number } | null = null;
  for (let attempt = 1; attempt <= FALLBACK_MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadlineMs) {
      console.log("[gemini-titles] fallback deadline — returning null");
      return { titles: null, reason: "deadline" };
    }
    const result = await attemptRequest(
      apiKey,
      youtubeUrl,
      FALLBACK_MODEL,
      FALLBACK_ATTEMPT_TIMEOUT_MS,
      deadlineMs,
    );
    if (result.status === "deadline") {
      console.log(`[gemini-titles] fallback ${FALLBACK_MODEL} attempt ${attempt}: deadline — returning null`);
      return { titles: null, reason: "deadline" };
    }
    if (result.status === "success") {
      return { titles: result.titles, reason: result.titles ? "ok" : "no_movies" };
    }
    console.log(`[gemini-titles] fallback ${FALLBACK_MODEL} attempt ${attempt}: ${result.status}${"httpStatus" in result && result.httpStatus !== undefined ? ` (HTTP ${result.httpStatus})` : ""}${result.status === "transient" && result.failureKind ? ` (${result.failureKind})` : ""}${result.status === "transient" && result.retryAfterMs > 0 ? ` retry-after=${result.retryAfterMs}ms` : ""}`);
    if (result.status === "transient") {
      lastTransient = { retryAfterMs: result.retryAfterMs, httpStatus: result.httpStatus };
    }
    // Permanent or malformed: fail immediately, no retries.
    if (result.status === "permanent" || result.status === "malformed") {
      console.log(`[gemini-titles] fallback ${result.status} — returning null`);
      return {
        titles: null,
        reason: "permanent",
        ...(result.status === "permanent" && result.httpStatus !== undefined ? { status: result.httpStatus } : {}),
      };
    }
    // Transient: honor Retry-After over the scheduled delay, add jitter,
    // then try again (unless this was the last attempt).
    if (attempt === FALLBACK_MAX_ATTEMPTS) {
      console.log(`[gemini-titles] fallback exhausted ${FALLBACK_MAX_ATTEMPTS} attempts — returning null`);
      return {
        titles: null,
        reason: "transient",
        ...(lastTransient?.httpStatus !== undefined ? { status: lastTransient.httpStatus } : {}),
        ...(lastTransient && lastTransient.retryAfterMs > 0 ? { retryAfterMs: lastTransient.retryAfterMs } : {}),
      };
    }
    const scheduledDelayMs = FALLBACK_RETRY_DELAYS_MS[attempt - 1];
    const delayMs = Math.max(addJitter(scheduledDelayMs), result.retryAfterMs);
    // Never sleep past the deadline — cap the wait and let the loop-top
    // check return null once the budget is spent.
    const remainingMs = Math.max(0, deadlineMs - Date.now());
    await sleep(Math.min(delayMs, remainingMs));
  }
  return { titles: null, reason: "transient" };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ titles: null, reason: "permanent" });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ titles: null, reason: "permanent" });
  }

  const youtubeUrl = (body as { youtubeUrl?: unknown } | null)?.youtubeUrl;
  if (!validYoutubeUrl(youtubeUrl)) {
    return jsonResponse({ titles: null, reason: "permanent" });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (apiKey === "") {
    return jsonResponse({ titles: null, reason: "permanent" });
  }

  // Normalize to canonical watch form before Gemini: Shorts / youtu.be
  // forms may not fetch the same as watch form (see canonicalYouTubeUrl).
  const result = await extractTitles(apiKey, canonicalYouTubeUrl(youtubeUrl));
  return jsonResponse(result);
});
