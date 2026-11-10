// Last Supabase fetch_queue mirror failure, persisted on-device so a missed
// server update is diagnosable from the phone without a tethered console.
// The mirror helpers are fire-and-forget by design and PostgREST returns
// HTTP 200 with [] when an update matches zero rows, so without this record
// a failed mirror is invisible (backlog #102: the done-mirror for one row
// failed silently and the push arrived 11 minutes late). Only the most
// recent failure is kept (one record, overwritten per failure); a later
// successful done-mirror clears it, so the line never describes a stale
// failure. Never throws; storage errors degrade to no record.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MirrorOperation = 'done' | 'claim' | 'fail' | 'retry';

export type MirrorDiagnostic = {
  operation: MirrorOperation;
  /** fetch_queue row id the mirror was for. */
  supabaseId: string;
  /** Short reason: 'no rows updated' | 'network error' | server message. */
  detail: string;
  /** When the failure happened (ms since epoch). */
  at: number;
};

const MIRROR_DIAGNOSTICS_KEY = 'movieapp.mirrorDiagnostics.v1';

const KNOWN_OPERATIONS: string[] = ['done', 'claim', 'fail', 'retry'];

/** One-line diagnostic for display, e.g. "done update failed
 *  (no rows updated) · row 69ed5b52… · Nov 9, 2026, 6:02 PM". */
export function describeMirrorFailure(d: MirrorDiagnostic): string {
  const when = new Date(d.at).toLocaleString();
  return `${d.operation} update failed (${d.detail}) · row ${d.supabaseId.slice(0, 8)}… · ${when}`;
}

function normalize(raw: unknown): MirrorDiagnostic | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MirrorDiagnostic>;
  if (typeof r.operation !== 'string' || !KNOWN_OPERATIONS.includes(r.operation)) return null;
  if (typeof r.supabaseId !== 'string' || !r.supabaseId) return null;
  if (typeof r.detail !== 'string' || !r.detail) return null;
  if (typeof r.at !== 'number') return null;
  return {
    operation: r.operation as MirrorOperation,
    supabaseId: r.supabaseId,
    detail: r.detail,
    at: r.at,
  };
}

export async function saveMirrorFailure(d: MirrorDiagnostic): Promise<void> {
  try {
    await AsyncStorage.setItem(MIRROR_DIAGNOSTICS_KEY, JSON.stringify(d));
  } catch { /* storage full etc. — diagnostics are best-effort */ }
}

export async function clearMirrorFailure(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MIRROR_DIAGNOSTICS_KEY);
  } catch { /* best-effort */ }
}

export async function loadMirrorFailure(): Promise<MirrorDiagnostic | null> {
  try {
    const raw = await AsyncStorage.getItem(MIRROR_DIAGNOSTICS_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}
