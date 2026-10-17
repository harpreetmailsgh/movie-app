import React, { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider, useStore } from '../lib/store';
import { AuthProvider, useAuth } from '../lib/auth';
import { getPushToken, getQueueIdentity, setupPushListeners, setQueueIdentity } from '../lib/push';
import PrivacySheet from '../components/PrivacySheet';

/**
 * First-launch privacy notice: shown once, the first time the app opens,
 * until the user continues or opens the full policy. The seen flag lives in
 * persisted settings (privacySeen), so it never reappears after that.
 * Rendered inside StoreProvider so it can read those settings.
 */
function PrivacyGate() {
  const { ready, settings, setPrivacySeen } = useStore();
  return (
    <PrivacySheet
      visible={ready && !settings.privacySeen}
      onContinue={setPrivacySeen}
      onReadPolicy={() => {
        setPrivacySeen();
        router.push('/privacy');
      }}
    />
  );
}

/**
 * Push notification bootstrap (backlog #71). Fetches the Expo push token
 * once, publishes the queue identity for the Supabase fetch_queue mirror,
 * and installs the notification listeners once. Idempotent across
 * re-renders. Rendered inside AuthProvider + StoreProvider so it can read
 * the session.
 */
function PushSetup() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  // One-time setup guard (token request + listeners). The queue identity is
  // refreshed whenever the session resolves, because the anonymous session
  // may not exist yet on the first run.
  const setupDoneRef = useRef(false);

  useEffect(() => {
    if (setupDoneRef.current) return;
    setupDoneRef.current = true;
    void (async () => {
      // getPushToken never throws and returns null when denied.
      const pushToken = await getPushToken();
      // Preserve a userId the session effect may already have stamped —
      // the permission prompt can delay this fetch past session resolution.
      setQueueIdentity({ userId: getQueueIdentity().userId, pushToken });
      setupPushListeners();
    })();
  }, []);

  // Stamp the user id on the identity as soon as the session is known.
  useEffect(() => {
    const { pushToken } = getQueueIdentity();
    setQueueIdentity({ userId, pushToken });
  }, [userId]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StoreProvider>
      <StatusBar style="light" />
      <PushSetup />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#000' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="movie/[id]"
          options={{ presentation: 'modal', title: 'Details' }}
        />
        <Stack.Screen
          name="import"
          options={{ presentation: 'modal', title: 'Add movies to watchlist' }}
        />
        <Stack.Screen name="trailer" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
      </Stack>
      <PrivacyGate />
      </StoreProvider>
    </AuthProvider>
  );
}
