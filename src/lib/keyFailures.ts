import Constants from 'expo-constants';
import { getSupabase } from './supabase';

/**
 * Silent telemetry for API-key auth failures.
 *
 * A bad key fires up to 6 parallel searches per lookup, so reports are
 * deduped in memory per app session: one row per service+error-code combo.
 *
 * Fire-and-forget by design: this function never throws and never awaits,
 * so it can never block the caller. Call it without await.
 */
const reportedThisSession = new Set<string>();

export function reportKeyFailure(service: string, errorCode: number): void {
  try {
    const dedupeKey = `${service}:${errorCode}`;
    if (reportedThisSession.has(dedupeKey)) return;
    reportedThisSession.add(dedupeKey);

    const client = getSupabase();
    if (!client) return;

    const appVersion = Constants.expoConfig?.version ?? 'dev';

    // Intentionally not awaited: the insert runs in the background and any
    // rejection is swallowed so the caller is never affected.
    void (async () => {
      try {
        const { error } = await client
          .from('key_failures')
          .insert({
            service,
            error_code: errorCode,
            app_version: appVersion,
          });
        if (error) console.warn('[keyFailures] insert failed:', error.message);
      } catch {
        // Ignored: silent telemetry must never surface to the user.
      }
    })();
  } catch {
    // Never throw, never block the caller.
  }
}
