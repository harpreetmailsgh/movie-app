import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Updates from 'expo-updates';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';

function AccountSection() {
  const { ready, configured, session, isAnonymous, appleAvailable, authMessage, signInWithApple, signOut } = useAuth();
  const { syncState, lastSyncAt } = useStore();

  return (
    <View style={styles.accountBox}>
      <Text style={styles.heading}>Account</Text>
      {!configured ? (
        <Text style={styles.body}>
          Cloud sync isn't set up yet — your list stays on this phone for now.
        </Text>
      ) : !ready ? (
        <Text style={styles.dim}>Loading…</Text>
      ) : (
        <>
          <Text style={styles.body}>
            {session
              ? isAnonymous
                ? 'Using the app anonymously — your list will follow you once you sign in.'
                : `Signed in${session.user.email ? ` as ${session.user.email}` : ''}.`
              : 'Not signed in.'}
          </Text>
          {authMessage && <Text style={styles.error}>{authMessage}</Text>}
          {configured && session && (
            <Text style={styles.dim}>
              {syncState === 'syncing'
                ? 'Backing up your list…'
                : syncState === 'error'
                  ? 'Backup failed — will retry automatically.'
                  : lastSyncAt
                    ? `List backed up ✓ ${new Date(lastSyncAt).toLocaleString()}`
                    : 'Backup pending…'}
            </Text>
          )}
          {appleAvailable && (!session || isAnonymous) && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={12}
              style={styles.appleBtn}
              onPress={signInWithApple}
            />
          )}
          {session && !isAnonymous && (
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>Sign out</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const { addTestMovies, clearLibrary } = useStore();
  const [addingTests, setAddingTests] = useState(false);
  const [testsAdded, setTestsAdded] = useState<number | null>(null);
  const insets = useSafeAreaInsets();

  const addTests = async () => {
    setAddingTests(true);
    setTestsAdded(null);
    try {
      const n = await addTestMovies(20);
      setTestsAdded(n);
    } catch {
      Alert.alert('Couldn’t add movies', 'Check your connection and try again.');
    } finally {
      setAddingTests(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <AccountSection />

      <Text style={[styles.heading, styles.section]}>Test data</Text>
      <Text style={styles.body}>
        Fill your Watchlist with 20 random well-known movies — handy for trying out the swipe deck.
      </Text>
      <Pressable style={styles.hapticTest} onPress={addTests} disabled={addingTests}>
        <Text style={styles.hapticTestText}>
          {addingTests ? 'Adding…' : testsAdded !== null ? `Added ${testsAdded} movies ✓ — tap to add more` : 'Add 20 random movies'}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.hapticTest, styles.clearBtn]}
        onPress={() =>
          Alert.alert(
            'Clear all movies?',
            'This removes every movie from your Watchlist and Seen. This can’t be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear all',
                style: 'destructive',
                onPress: () => { clearLibrary(); setTestsAdded(null); },
              },
            ]
          )
        }
      >
        <Text style={[styles.hapticTestText, styles.clearBtnText]}>Clear all movies</Text>
      </Pressable>

      <Pressable
        style={styles.dangerLink}
        onPress={() =>
          Alert.alert('About', 'Movie Recommender v1.3.0 — your personal reel-to-watchlist app.')
        }
      >
        <Text style={styles.dangerLinkText}>About this app</Text>
      </Pressable>
      <Text style={styles.buildStamp} selectable>
        Build {Updates.updateId ? Updates.updateId.slice(0, 8) : 'dev'}
        {Updates.createdAt ? ` · ${new Date(Updates.createdAt).toLocaleString()}` : ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 40 },
  heading: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  section: { marginTop: 32 },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  hapticTest: {
    backgroundColor: '#1c1c1e', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 12,
  },
  hapticTestText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  clearBtn: { backgroundColor: 'rgba(255,69,58,0.12)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.4)' },
  clearBtnText: { color: '#ff6961' },
  buildStamp: {
    color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', marginTop: 16,
  },
  dangerLink: { marginTop: 32, alignItems: 'center' },
  dangerLinkText: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  accountBox: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  appleBtn: { width: '100%', height: 48, marginTop: 12 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  secondaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { color: '#ff9f0a', fontSize: 13, marginTop: 8 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
});
