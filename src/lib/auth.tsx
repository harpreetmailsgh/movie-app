import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';

interface AuthState {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  isAnonymous: boolean;
  appleAvailable: boolean;
  authMessage: string | null;
  signInWithApple: () => Promise<void>;
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
 * the anonymous identity is linked, so nothing is lost.
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

  const signInWithApple = useCallback(async () => {
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
      // Upgrade the anonymous account when there is one, so the user's
      // data carries over; otherwise sign in fresh.
      const { error } = session?.user?.is_anonymous
        ? await sb.auth.linkIdentity({ provider: 'apple', token: credential.identityToken })
        : await sb.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) throw error;
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // user dismissed the sheet
      setAuthMessage('Apple sign-in failed. Please try again.');
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
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
