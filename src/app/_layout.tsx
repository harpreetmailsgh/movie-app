import React from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider, useStore } from '../lib/store';
import { AuthProvider } from '../lib/auth';
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

export default function RootLayout() {
  return (
    <AuthProvider>
      <StoreProvider>
      <StatusBar style="light" />
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
