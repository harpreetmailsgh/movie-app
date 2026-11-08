import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase project credentials are baked in at export time via env vars:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 * The anon key is public by design — row-level security protects the data.
 * Until they are set, every auth function below no-ops gracefully.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE, not the implicit default (backlog #86): with the
        // implicit flow the server returns the tokens in the URL
        // fragment and the app's code exchange never runs — Google
        // sign-in failed with "no_code" on every tap. PKCE makes the
        // server issue a `?code=` that exchangeCodeForSession consumes.
        // This is the documented flow for native apps.
        flowType: 'pkce',
      },
    });
  }
  return client;
}
