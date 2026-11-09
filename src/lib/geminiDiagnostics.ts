// Last Gemini lookup failure, persisted on-device so a failure is
// diagnosable from the phone without a tethered console. The [gemini]
// client logs are console.log only and unrecoverable from a production
// TestFlight build — this record is what Settings → Diagnostics shows.
// Only the most recent failure is kept (one record, overwritten per
// failure); a later success clears it, so the line never describes a
// stale failure. Never throws; storage errors degrade to no record.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeminiFailureReason } from './gemini';

export type GeminiDiagnostic = {
  reason: GeminiFailureReason;
  /** Last Gemini HTTP status the server saw, when reported. */
  httpStatus?: number | null;
  /** Retry-After Gemini asked for (ms), when reported. */
  retryAfterMs?: number | null;
  /** Client-side error name (e.g. AbortError), when the failure was local. */
  errorName?: string | null;
  /** When the failure happened (ms since epoch). */
  at: number;
};

const GEMINI_DIAGNOSTICS_KEY = 'movieapp.geminiDiagnostics.v1';

const KNOWN_REASONS: string[] = ['ok', 'transient', 'permanent', 'no_movies', 'deadline', 'unknown'];

/** Plain-language label for a failure reason (diagnostics only — never
 *  user-facing error copy). */
export function geminiReasonLabel(reason: GeminiFailureReason): string {
  switch (reason) {
    case 'transient':
      return 'movie service unavailable';
    case 'deadline':
      return 'lookup timed out';
    case 'permanent':
      return 'service rejected the request';
    case 'no_movies':
      return 'no movies in this video';
    case 'ok':
      return 'ok';
    default:
      return 'lookup failed';
  }
}

/** One-line diagnostic for display, e.g. "movie service unavailable
 *  (HTTP 429) · Nov 9, 2026, 9:41 AM". */
export function describeGeminiFailure(d: GeminiDiagnostic): string {
  const when = new Date(d.at).toLocaleString();
  const status = typeof d.httpStatus === 'number' ? ` (HTTP ${d.httpStatus})` : '';
  return `${geminiReasonLabel(d.reason)}${status} · ${when}`;
}

function normalize(raw: unknown): GeminiDiagnostic | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<GeminiDiagnostic>;
  if (typeof r.reason !== 'string' || !KNOWN_REASONS.includes(r.reason)) return null;
  if (typeof r.at !== 'number') return null;
  return {
    reason: r.reason as GeminiFailureReason,
    httpStatus: typeof r.httpStatus === 'number' ? r.httpStatus : null,
    retryAfterMs: typeof r.retryAfterMs === 'number' ? r.retryAfterMs : null,
    errorName: typeof r.errorName === 'string' ? r.errorName || null : null,
    at: r.at,
  };
}

export async function saveGeminiFailure(d: GeminiDiagnostic): Promise<void> {
  try {
    await AsyncStorage.setItem(GEMINI_DIAGNOSTICS_KEY, JSON.stringify(d));
  } catch { /* storage full etc. — diagnostics are best-effort */ }
}

export async function clearGeminiFailure(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GEMINI_DIAGNOSTICS_KEY);
  } catch { /* best-effort */ }
}

export async function loadGeminiFailure(): Promise<GeminiDiagnostic | null> {
  try {
    const raw = await AsyncStorage.getItem(GEMINI_DIAGNOSTICS_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}
