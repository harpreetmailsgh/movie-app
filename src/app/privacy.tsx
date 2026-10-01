import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from '../lib/privacy';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
    >
      <Text style={styles.intro}>
        Movie Deck helps you save movies and shows you find in reels and shorts, and build a watchlist from them.
        This policy says what the app saves, where it goes, and what it never does.
      </Text>
      <Text style={styles.updated}>Last updated: {PRIVACY_LAST_UPDATED}</Text>
      {PRIVACY_SECTIONS.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.heading}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
      <Text style={styles.attribution}>Movie data and posters by TMDB and Cinemeta.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20 },
  intro: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22 },
  updated: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 10 },
  section: { marginTop: 24 },
  heading: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 21 },
  attribution: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 32 },
});
