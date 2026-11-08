import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface SignInOptions {
  /**
   * True when the anonymous account holds local data worth keeping
   * (movies the user added, or queued video imports). Defaults to true:
   * the anonymous account is upgraded by linking, so nothing is lost.
   * False only when there is nothing local to lose — then the anonymous
   * session is signed out first and the sign-in runs fresh, so an
   * Apple/Google identity that already belongs to another account can
   * sign in as that account instead of failing to link to the
   * anonymous one (backlog #85).
   */
  hasLocalData?: boolean;
}

interface AuthState {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  isAnonymous: boolean;
  appleAvailable: boolean;
  authMessage: string | null;
  /** True while a sign-in is running — Settings disables its buttons. */
  authBusy: boolean;
  signInWithApple: (options?: SignInOptions) => Promise<void>;
  signInWithGoogle: (options?: SignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Deletes the account on the server (anonymous or signed-in — the
   * function deletes by the caller's id from the session JWT), then
   * wipes local account data and signs out. Returns 'failed' only if
   * the server call itself fails, in which case nothing is wiped and
   * nothing is signed out — the account stays fully usable and the
   * user can retry. Once the server confirms the deletion the answer
   * is 'deleted', even if the local wipe or sign-out then fails — the
   * account is already gone, and a retry would 401.
   */
  deleteAccount: () => Promise<'deleted' | 'failed'>;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Local account data, wiped only after the server confirms the account
 * is deleted. settings.v1 is deliberately NOT here — it holds device
 * preferences (card style, views, guide-seen flags, privacySeen, saved
 * TMDB key), not account data, so the guide does not replay after
 * deletion.
 */
const ACCOUNT_DATA_KEYS = [
  'movies.v1',
  'movieapp.fetchQueue.v1',
  'movieapp.recentVideos.v1',
  'reviewPrompt.v1',
  'movies.deleted.v1',
  'movies.lastSync.v1',
  'trending.country.v1',
  'trending.cache.v2',
  'movieapp.pushToken.v1',
  'detail-backfill.v1',
];

export function useAuth(): AuthState {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth must be used inside AuthProvider');
  return a;
}

type GoogleOAuthOutcome = 'signed-in' | 'cancelled' | 'already-linked';

/**
 * One Google OAuth round-trip: request the URL, open the browser, exchange
 * the returned code (backlog #86). `link` picks the linkIdentity branch
 * (upgrade the anonymous account) or the fresh signInWithOAuth branch.
 *
 * Returns 'already-linked' — instead of throwing — when the Google
 * identity already belongs to another account. Only that error recovers:
 * any other link error is a real failure (network, misconfigured
 * provider, …) and must not silently drop the anonymous session for a
 * fresh sign-in. The server can refuse the link at the authorize call OR
 * at the callback (after the Google account is chosen), so both spots
 * check for it.
 *
 * `flowId` is carried in memory from the same call that produced the URL
 * — it is never read back from the redirect, because the server only
 * appends it when experimental.appendPkceFlowIdToRedirects is on (off by
 * default). Passing it to exchangeCodeForSession makes the verifier
 * lookup slot-only, so a second flow's verifier can never be submitted
 * for this flow's code.
 */
async function googleOAuthRoundTrip(
  sb: SupabaseClient,
  redirectTo: string,
  link: boolean,
): Promise<GoogleOAuthOutcome> {
  const { data, error } = link
    ? await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo } })
    : await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
  if (error) {
    if (link && error.code === 'identity_already_exists') return 'already-linked';
    throw error;
  }
  if (!data.url) throw new Error('no_oauth_url');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled'; // user cancelled
  const params = Linking.parse(result.url).queryParams;
  if (params?.error_code === 'identity_already_exists') return 'already-linked';
  const code = params?.code;
  if (typeof code !== 'string') throw new Error('no_code');
  const { error: exchangeError } = await sb.auth.exchangeCodeForSession(
    code,
    data.flowId ? { flowId: data.flowId } : undefined,
  );
  if (exchangeError) throw exchangeError;
  return 'signed-in';
}

/**
 * Identity for the future cloud backend. Until a Supabase project is
 * configured this provider is inert (configured === false) and the app
 * behaves exactly as before — everything stays on-device.
 *
 * When configured: the app signs in anonymously on first launch (no login
 * screen), and the user can upgrade to Sign in with Apple at any time —
 * the anonymous identity is linked, so nothing is lost. Exception
 * (backlog #85): when the anonymous account has nothing local to lose,
 * the anonymous session is signed out first and the sign-in runs fresh,
 * so an identity that already belongs to another account can sign in
 * instead of failing to link to the anonymous one.
 *
 * NOTE: Supabase Dashboard → Authentication → Anonymous sign-ins must be
 * enabled for the automatic anonymous sign-in to work.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  // One sign-in at a time (backlog #86): a second tap while the browser
  // is open would start a second PKCE flow whose verifier could be
  // exchanged against the first flow's code. The ref is the guard — the
  // callbacks close over a stale `authBusy` otherwise; the state drives
  // the disabled buttons in Settings.
  const authBusyRef = useRef(false);
  const beginAuth = () => {
    if (authBusyRef.current) return false;
    authBusyRef.current = true;
    setAuthBusy(true);
    return true;
  };
  const endAuth = () => {
    authBusyRef.current = false;
    setAuthBusy(false);
  };

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'ios') {
        try {
          setAppleAvailable(await AppleAuthentication.isAvailableAsync());
        } catch {
          setAppleAvailable(false);
        }
      }
      const sb = getSupabase();
      if (!sb) {
        setReady(true);
        return;
      }
      const { data } = await sb.auth.getSession();
      setSession(data.session);
      if (!data.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) setAuthMessage('Could not start a cloud session.');
      }
      const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
      setReady(true);
      return () => sub.subscription.unsubscribe();
    })();
  }, []);

  const signInWithApple = useCallback(async (options?: SignInOptions) => {
    if (!beginAuth()) return; // a sign-in is already running
    setAuthMessage(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('no_token');
      const sb = getSupabase();
      if (!sb) return;
      // Upgrade the anonymous account when there is one with local data
      // to keep, so the user's data carries over; otherwise sign in
      // fresh. The token is already in hand, so the anonymous session
      // can be dropped before the fresh sign-in with no window where
      // the credential is missing.
      const anonymous = !!session?.user?.is_anonymous;
      const link = anonymous && (options?.hasLocalData ?? true);
      if (!link && anonymous) {
        await sb.auth.signOut();
      }
      const { error } = link
        ? await sb.auth.linkIdentity({ provider: 'apple', token: credential.identityToken })
        : await sb.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) {
        // Same already-linked recovery as Google (#86): the Apple
        // identity belongs to another account, so sign in fresh as
        // that account instead of failing the link. Sign out first —
        // the token is already in hand, so nothing is lost by
        // dropping the anonymous session before the fresh sign-in.
        if (link && error.code === 'identity_already_exists') {
          await sb.auth.signOut();
          const { error: freshError } = await sb.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
          });
          if (freshError) throw freshError;
        } else {
          throw error;
        }
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user dismissed the sheet
      setAuthMessage('Apple sign-in failed. Please try again.');
    } finally {
      endAuth();
    }
  }, [session]);

  const signInWithGoogle = useCallback(async (options?: SignInOptions) => {
    if (!beginAuth()) return; // a sign-in is already running
    setAuthMessage(null);
    try {
      const sb = getSupabase();
      if (!sb) return;
      const redirectTo = Linking.createURL('auth/callback');
      // Upgrade the anonymous account when there is one with local data
      // to keep, so the user's data carries over; otherwise sign in
      // fresh.
      const anonymous = !!session?.user?.is_anonymous;
      const link = anonymous && (options?.hasLocalData ?? true);
      if (!link && anonymous) {
        // Sign out FIRST, before requesting the OAuth URL. signOut
        // wipes the PKCE code verifier that signInWithOAuth stores, so
        // requesting the URL first and signing out after would break
        // the code exchange below. Local data is untouched in storage
        // either way; if sign-in then fails or the user cancels, a new
        // anonymous session is created on next launch.
        await sb.auth.signOut();
      }
      const outcome = await googleOAuthRoundTrip(sb, redirectTo, link);
      if (outcome === 'already-linked') {
        // The Google identity is already linked to another account —
        // on Harpreet's phone, to his own account from the failed
        // implicit-flow attempt. Sign the anonymous session out FIRST
        // (signOut wipes the dead flow's PKCE verifier), then sign in
        // fresh as that Google account: the identity already belongs
        // to it, so this lands on the same user id and the server copy
        // of the list follows. Local movies are untouched — they live
        // under the app's own AsyncStorage keys, not the auth session
        // keys signOut clears.
        await sb.auth.signOut();
        const fresh = await googleOAuthRoundTrip(sb, redirectTo, false);
        if (fresh === 'already-linked') throw new Error('already_linked_on_fresh_sign_in');
      }
    } catch {
      setAuthMessage('Google sign-in failed. Please try again.');
    } finally {
      endAuth();
    }
  }, [session]);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    setSession(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<'deleted' | 'failed'> => {
    if (!beginAuth()) return 'failed'; // a sign-in is already running
    setAuthMessage(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('no_client');
      // The session JWT authenticates the caller — no user id in the
      // body. Works for anonymous users too: the function deletes by
      // the caller's id, anonymous or not.
      const { error } = await sb.functions.invoke('delete-account');
      if (error) throw error;
      // Server confirmed the deletion — that is the truth, so this
      // returns 'deleted' from here on. The local wipe and sign-out
      // below are best-effort: either may fail (storage error, or
      // the token is already invalid now the account is gone), and
      // that must never report the deletion as failed — a retry
      // would 401. Each step runs even if the other fails.
      try {
        await AsyncStorage.multiRemove(ACCOUNT_DATA_KEYS);
      } catch (e) {
        console.warn('deleteAccount: local wipe failed after server deletion', e);
      }
      try {
        await signOut();
      } catch (e) {
        console.warn('deleteAccount: sign-out failed after server deletion', e);
      }
      return 'deleted';
    } catch {
      setAuthMessage("Couldn't delete your account — check your connection and try again.");
      return 'failed';
    } finally {
      endAuth();
    }
  }, [signOut]);

  const value: AuthState = {
    ready,
    configured: isSupabaseConfigured,
    session,
    isAnonymous: !!session?.user?.is_anonymous,
    appleAvailable,
    authMessage,
    authBusy,
    signInWithApple,
    signInWithGoogle,
    signOut,
    deleteAccount,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
