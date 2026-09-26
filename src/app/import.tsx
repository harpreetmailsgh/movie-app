import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useStore } from '../lib/store';
import { bestMatch, bestMatchKeyless, searchTitles, searchTitlesKeyless, fetchImdbRating, fetchKeylessMeta, TmdbMatch } from '../lib/tmdb';
import { parseYouTubeId, fetchYouTubeTitle } from '../lib/youtube';
import { posterUrl } from '../lib/types';

const FIELD_BG = '#E9E9EE';

export default function ImportScreen() {
  const { importReel, importing, importMessage, settings, addMovie } = useStore();
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytWorking, setYtWorking] = useState(false);
  const [ytMessage, setYtMessage] = useState<string | null>(null);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text);
  };

  const pasteYt = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setYtUrl(text);
  };

  const doImport = async () => {
    const ok = await importReel(url);
    if (ok) {
      setUrl('');
      setTimeout(() => router.back(), 1200);
    }
  };

  const doSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const hits = settings.tmdbKey
        ? await searchTitles(query, settings.tmdbKey)
        : await searchTitlesKeyless(query);
      setResults(hits);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const addManual = async (m: TmdbMatch) => {
    let imdbRating = 0, overview = m.overview, genres = m.genres;
    let cast: string[] = [];
    if (m.cinemetaId) {
      try {
        const meta = await fetchKeylessMeta(m.cinemetaId, m.mediaType);
        if (meta) {
          const r = parseFloat(meta.imdbRating ?? '');
          if (Number.isFinite(r)) imdbRating = r;
          if (meta.description) overview = meta.description;
          if (meta.genres?.length) genres = meta.genres.slice(0, 3);
          if (meta.cast?.length) cast = meta.cast.slice(0, 3);
        }
      } catch { /* keep the slim fields */ }
    } else {
      imdbRating = await fetchImdbRating(m.tmdbID, m.mediaType, m.title, settings.tmdbKey);
    }
    addMovie({
      title: m.title, year: m.year, mediaType: m.mediaType, genres,
      overview, posterPath: m.posterPath, reelURL: url.trim(),
      caption: '', notes: '', status: 'watchlist', tmdbID: m.tmdbID, imdbRating,
      originalLanguage: m.originalLanguage, cast,
      needsReview: false,
    });
    router.back();
  };

  /** YouTube import: oEmbed title (caption-first step), then TMDB/keyless match. */
  const doYouTube = async () => {
    const link = ytUrl.trim();
    if (!parseYouTubeId(link)) {
      setYtMessage("That doesn't look like a YouTube link — use a watch, Shorts, or youtu.be link.");
      return;
    }
    setYtWorking(true);
    setYtMessage(null);
    try {
      const info = await fetchYouTubeTitle(link);
      if (!info) {
        setYtMessage("Couldn't read that video (it may be private or removed).");
        return;
      }
      const match = settings.tmdbKey
        ? await bestMatch(info.title, settings.tmdbKey)
        : await bestMatchKeyless(info.title);
      const caption = `${info.title} — ${info.author}`;
      if (match) {
        let imdbRating = 0, overview = match.overview, genres = match.genres;
        let cast: string[] = [];
        if (match.cinemetaId) {
          try {
            const meta = await fetchKeylessMeta(match.cinemetaId, match.mediaType);
            if (meta) {
              const r = parseFloat(meta.imdbRating ?? '');
              if (Number.isFinite(r)) imdbRating = r;
              if (meta.description) overview = meta.description;
              if (meta.genres?.length) genres = meta.genres.slice(0, 3);
              if (meta.cast?.length) cast = meta.cast.slice(0, 3);
            }
          } catch { /* keep the slim fields */ }
        } else {
          imdbRating = await fetchImdbRating(match.tmdbID, match.mediaType, match.title, settings.tmdbKey);
        }
        addMovie({
          title: match.title, year: match.year, mediaType: match.mediaType, genres,
          overview, posterPath: match.posterPath, reelURL: link,
          caption, notes: '', status: 'watchlist', tmdbID: match.tmdbID, imdbRating,
          originalLanguage: match.originalLanguage, cast,
          needsReview: false,
        });
        setYtMessage(`Added “${match.title}” to your Watchlist.`);
        setYtUrl('');
        setTimeout(() => router.back(), 1200);
        return;
      }
      addMovie({
        title: 'Unknown title', year: 0, mediaType: 'movie', genres: [],
        overview: '', posterPath: '', reelURL: link,
        caption, notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
        originalLanguage: '', cast: [], needsReview: true,
      });
      setYtMessage('Saved, but I couldn’t identify the movie — tap it to fix the title.');
    } finally {
      setYtWorking(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Add to your list</Text>
      <Text style={styles.subtitle}>
        Name a movie yourself, or paste a link and let the app identify it.
      </Text>

      <View style={styles.section}>
        <Text style={styles.heading}>🎬&nbsp; By title</Text>
        <Text style={styles.body}>
          The fastest way. Type the name of the movie or series, tap{' '}
          <Text style={styles.bold}>Search</Text>, then tap the right result to add it to your Watchlist.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. Predestination"
            placeholderTextColor="#8E8E93"
            onSubmitEditing={doSearch}
            returnKeyType="search"
          />
          <Pressable style={styles.sideBtn} onPress={doSearch}>
            <Text style={styles.sideBtnText}>Search</Text>
          </Pressable>
        </View>
        {searching && <ActivityIndicator color="#fff" style={styles.loader} />}
        {!searching && searched && results.length === 0 && (
          <Text style={styles.body}>No matches — check the spelling, or try the original title.</Text>
        )}
        {results.map((m) => {
          const uri = posterUrl(m.posterPath);
          return (
            <Pressable key={`${m.mediaType}-${m.tmdbID}-${m.title}`} style={styles.result} onPress={() => addManual(m)}>
              {uri ? (
                <Image source={{ uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text>🎬</Text>
                </View>
              )}
              <View style={styles.resultText}>
                <Text style={styles.resultTitle} numberOfLines={1}>{m.title}</Text>
                <Text style={styles.resultSub}>
                  {[m.year > 0 ? String(m.year) : null, m.mediaType === 'tv' ? 'Series' : 'Movie']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={styles.addPlus}>＋</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.heading}>🔗&nbsp; From a reel or video link</Text>
        <Text style={styles.body}>
          Paste a <Text style={styles.bold}>Facebook reel</Text>,{' '}
          <Text style={styles.bold}>Instagram reel</Text> or{' '}
          <Text style={styles.bold}>YouTube</Text> link. The app reads the post and
          identifies the movie for you.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={url}
            onChangeText={setUrl}
            placeholder="Paste link here"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.sideBtn} onPress={paste}>
            <Text style={styles.sideBtnText}>Paste</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.button, importing && styles.buttonDisabled]}
          onPress={doImport}
          disabled={importing || !url.trim()}
        >
          {importing ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Identify & add to Watchlist</Text>
          )}
        </Pressable>
        {!!importMessage && <Text style={styles.message}>{importMessage}</Text>}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.heading}>▶️&nbsp; From a YouTube video</Text>
        <Text style={styles.body}>
          Paste a <Text style={styles.bold}>watch</Text>,{' '}
          <Text style={styles.bold}>Shorts</Text> or{' '}
          <Text style={styles.bold}>youtu.be</Text> link. The app reads the
          video’s title and identifies the movie for you.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={ytUrl}
            onChangeText={setYtUrl}
            placeholder="Paste YouTube link here"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.sideBtn} onPress={pasteYt}>
            <Text style={styles.sideBtnText}>Paste</Text>
          </Pressable>
        </View>
        <Pressable
          style={[styles.button, ytWorking && styles.buttonDisabled]}
          onPress={doYouTube}
          disabled={ytWorking || !ytUrl.trim()}
        >
          {ytWorking ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Identify & add to Watchlist</Text>
          )}
        </Pressable>
        {!!ytMessage && <Text style={styles.message}>{ytMessage}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  section: { marginTop: 20 },
  divider: { height: 1, backgroundColor: '#2c2c2e', marginTop: 28 },
  heading: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 8 },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21, marginBottom: 14 },
  bold: { fontWeight: '700', color: '#fff' },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  input: {
    backgroundColor: FIELD_BG, color: '#111', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
  },
  sideBtn: {
    backgroundColor: FIELD_BG, borderRadius: 12, paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sideBtnText: { color: '#0a84ff', fontWeight: '700', fontSize: 15 },
  button: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  message: { color: '#30d158', fontSize: 14, marginTop: 12, lineHeight: 20 },
  loader: { marginTop: 16 },
  result: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1c1e',
    borderRadius: 14, padding: 10, marginTop: 10,
  },
  thumb: { width: 44, height: 66, borderRadius: 8, backgroundColor: '#2c2c2e' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  resultText: { flex: 1, marginLeft: 12 },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },
  addPlus: { color: '#30d158', fontSize: 24, fontWeight: '700', marginRight: 6 },
});
