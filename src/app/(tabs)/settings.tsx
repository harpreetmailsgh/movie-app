import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
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
  const { settings, setTmdbKey, setCardAnimation, setDeckStyle, enrichLibrary, importing, addTestMovies, clearLibrary } = useStore();
  const [key, setKey] = useState(settings.tmdbKey);
  const [saved, setSaved] = useState(false);
  const [addingTests, setAddingTests] = useState(false);
  const [testsAdded, setTestsAdded] = useState<number | null>(null);
  const insets = useSafeAreaInsets();

  const save = async () => {
    setTmdbKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Fill in posters/descriptions for entries missing them.
    await enrichLibrary();
  };

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

  const testHaptics = async () => {
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      await Haptics.selectionAsync();
      await pause(300);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await pause(300);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await pause(300);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      Alert.alert('Haptics unavailable', 'The haptics module could not run on this device.');
    }
  };

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.content}>
      <AccountSection />
      <Text style={[styles.heading, styles.section]}>TMDB API key</Text>
      <Text style={styles.body}>
        The app uses TMDB (a free movie database) to identify movies from reels
        and to fetch posters, genres and descriptions.
      </Text>
      <Text style={styles.body}>
        Get a free key: themoviedb.org → sign up → Settings → API → copy the
        "API Key (v3 auth)".
      </Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="Paste your TMDB API key"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>{importing ? 'Working…' : saved ? 'Saved ✓' : 'Save key'}</Text>
      </Pressable>
      <Text style={styles.hint}>
        Saving the key also fills in missing posters and descriptions for your
        current list. The key is stored only on this phone.
      </Text>

      <Text style={[styles.heading, styles.section]}>Card animation</Text>
      <Text style={styles.body}>
        How the swipe deck feels. Try both and keep the one you like.
      </Text>
      <View style={styles.optionRow}>
        {(
          [
            { id: 'flick', title: 'Flick', desc: 'Throw cards with momentum' },
            { id: 'peel', title: 'Peel', desc: 'Lift and peel cards away' },
          ] as const
        ).map((opt) => {
          const active = settings.cardAnimation === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setCardAnimation(opt.id)}
            >
              <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{opt.title}</Text>
              <Text style={styles.optionDesc}>{opt.desc}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable style={styles.hapticTest} onPress={testHaptics}>
        <Text style={styles.hapticTestText}>Test haptics</Text>
      </Pressable>
      <Text style={styles.hint}>Tapping it should play four buzzes, each stronger than the last.</Text>

      <Text style={[styles.heading, styles.section]}>Deck look</Text>
      <Text style={styles.body}>
        How the cards underneath peek out. Try all three and keep the one you like.
      </Text>
      <View style={styles.optionRow}>
        {(
          [
            { id: 'stack', title: 'Stack', desc: 'Neat pile, clean edges' },
            { id: 'sidepeek', title: 'Side peek', desc: 'Sliver on the left edge' },
            { id: 'fan', title: 'Fan', desc: 'Subtle fanned hand' },
          ] as const
        ).map((opt) => {
          const active = settings.deckStyle === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setDeckStyle(opt.id)}
            >
              <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{opt.title}</Text>
              <Text style={styles.optionDesc}>{opt.desc}</Text>
            </Pressable>
          );
        })}
      </View>

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

      <Text style={[styles.heading, styles.section]}>How adding works</Text>
      <Text style={styles.body}>
        1. In Facebook, tap Share on a reel → Copy link{'\n'}
        2. Open this app → ＋ Add from a reel{'\n'}
        3. Paste the link — the app reads the reel's caption and identifies the movie
      </Text>
      <Text style={styles.hint}>
        Only public reels can be read. Private or friends-only reels can't be
        identified automatically — add those by title instead.
      </Text>

      <Pressable
        style={styles.dangerLink}
        onPress={() =>
          Alert.alert('About', 'Movie Recommender v1.2.1 — your personal reel-to-watchlist app.')
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
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 19, marginTop: 12 },
  input: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 6,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  option: {
    flex: 1, backgroundColor: '#1c1c1e', borderRadius: 14, padding: 14,
    borderWidth: 2, borderColor: 'transparent',
  },
  optionActive: { borderColor: '#0a84ff', backgroundColor: '#14202e' },
  optionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  optionTitleActive: { color: '#5eb0ff' },
  optionDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },
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
