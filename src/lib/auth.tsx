import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
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
  signInWithApple: (options?: SignInOptions) => Promise<void>;
  signInWithGoogle: (options?: SignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth must be used inside AuthProvider');
  return a;
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
      if (error) throw error;
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user dismissed the sheet
      setAuthMessage('Apple sign-in failed. Please try again.');
    }
  }, [session]);

  const signInWithGoogle = useCallback(async (options?: SignInOptions) => {
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
      const { data, error } = link
        ? await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo } })
        : await sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo, skipBrowserRedirect: true },
          });
      if (error) throw error;
      if (!data.url) throw new Error('no_oauth_url');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return; // user cancelled
      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== 'string') throw new Error('no_code');
      const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } catch {
      setAuthMessage('Google sign-in failed. Please try again.');
    }
  }, [session]);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    setSession(null);
  }, []);

  const value: AuthState = {
    ready,
    configured: isSupabaseConfigured,
    session,
    isAnonymous: !!session?.user?.is_anonymous,
    appleAvailable,
    authMessage,
    signInWithApple,
    signInWithGoogle,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
