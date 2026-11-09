import type { GeminiFailureReason } from './gemini';

/**
 * Automatic-retry scheduling for transient Gemini failures (backlog #98).
 * Shared by the client worker (src/app/import.tsx) and the server
 * (supabase/functions/process-queue/index.ts, which ports this file
 * verbatim — same as candidates()/bestMatches()).
 *
 * Quota facts: the Gemini daily quota resets at midnight Pacific Time
 * (3:00 AM Toronto), per project. A 429 therefore waits for that reset
 * instead of a fixed delay; any other transient blip waits 50 min on the
 * first re-queue and 15 min on the second.
 */

// A Retry-After wait is honored, but never past 24h — a longer wait is
// treated as "retry at the next quota reset" instead of a multi-day stall.
const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;
const FIRST_RETRY_DELAY_MS = 50 * 60_000;
const SECOND_RETRY_DELAY_MS = 15 * 60_000;

/** UTC offset (ms) of a timezone at one instant, via Intl. Negative west
 *  of UTC (e.g. -8h for Pacific Standard Time). */
function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtcMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtcMs - utcMs;
}

/** Epoch ms of midnight (00:00 wall time) on a calendar date in a zone.
 *  Iterates so a DST change between the guess and the answer converges. */
function zonedMidnightUtcMs(year: number, month: number, day: number, timeZone: string): number {
  const wallMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = wallMidnightAsUtc;
  for (let i = 0; i < 3; i++) {
    const next = wallMidnightAsUtc - timeZoneOffsetMs(timeZone, guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** Next midnight in America/Los_Angeles after `fromMs` (epoch ms).
 *  Timezone-correct via Intl — the Pacific offset (PST/PDT) is read off
 *  the clock, never hardcoded. */
export function nextMidnightPacific(fromMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(fromMs));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Next calendar day in Pacific time; Date.UTC rolls month/year over.
  const nextDay = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + 1));
  return zonedMidnightUtcMs(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    'America/Los_Angeles',
  );
}

/**
 * When a transiently-failed video should be tried again (epoch ms).
 * `retryCount` is the row's count BEFORE this re-queue (0 = first,
 * 1 = second). Only called for 'transient' / 'deadline' failures.
 */
export function computeRetryAt(
  reason: GeminiFailureReason,
  httpStatus: number | undefined,
  retryAfterMs: number | undefined,
  retryCount: number,
): number {
  const now = Date.now();
  // Gemini asked to wait: honor it, capped at 24h (see MAX_RETRY_AFTER_MS).
  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return now + Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
  }
  // Daily quota exhausted: the quota resets at midnight Pacific
  // (3:00 AM Toronto) — retry then, not after a fixed delay.
  if (httpStatus === 429) {
    return nextMidnightPacific(now);
  }
  // Any other transient blip / deadline: short backoff by re-queue count
  // (50 min first, 15 min second).
  return now + (retryCount >= 1 ? SECOND_RETRY_DELAY_MS : FIRST_RETRY_DELAY_MS);
}

/** True when `retryAtMs` falls on the next local calendar day. */
function isTomorrowLocal(retryAtMs: number): boolean {
  const now = new Date();
  const retry = new Date(retryAtMs);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (
    retry.getFullYear() === tomorrow.getFullYear() &&
    retry.getMonth() === tomorrow.getMonth() &&
    retry.getDate() === tomorrow.getDate()
  );
}

/**
 * The Queue-row line for a re-queued video. The time is the computed
 * retry instant in the DEVICE's local timezone (never hardcoded Toronto);
 * "tomorrow" is prepended only when the retry falls on the next local
 * calendar day. PROPOSED wording (backlog #98 T6) — not Harpreet-approved;
 * it swaps in one line after his yes. Gemini is never named.
 */
export function formatRetryMessage(
  reason: GeminiFailureReason | string,
  httpStatus: number | undefined,
  retryAtMs: number,
): string {
  const time = new Date(retryAtMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const dayWord = isTomorrowLocal(retryAtMs) ? 'tomorrow ' : '';
  if (reason === 'transient' && httpStatus === 429) {
    return `The movie lookup hit its daily limit. We'll try this video again automatically ${dayWord}at ${time}.`;
  }
  return `The movie lookup is busy right now. We'll try this video again automatically ${dayWord}at ${time}.`;
}
