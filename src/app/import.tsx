import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useStore } from '../lib/store';
import { bestMatch, bestMatchKeyless, searchTitles, searchTitlesKeyless, fetchImdbRating, fetchKeylessMeta, TmdbMatch } from '../lib/tmdb';
import { parseYouTubeId, fetchYouTubeTitle } from '../lib/youtube';
import { posterUrl } from '../lib/types';

const FIELD_BG = '#E9E9EE';
const SEARCH_DEBOUNCE_MS = 500;

export default function ImportScreen() {
  const { importReel, importing, importMessage, settings, addMovie, movies } = useStore();
  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytWorking, setYtWorking] = useState(false);
  const [ytMessage, setYtMessage] = useState<string | null>(null);
  const [fbFailed, setFbFailed] = useState(false);

  // Latest store movies, readable inside async completions.
  const moviesRef = useRef(movies);
  useEffect(() => { moviesRef.current = movies; }, [movies]);

  // Run ids: editing a field mid-run cancels that run's completion UI.
  const fbRunRef = useRef(0);
  const ytRunRef = useRef(0);

  // ---- Card 1: live search-as-you-type -------------------------------------
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef('');

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const hits = settings.tmdbKey
        ? await searchTitles(q, settings.tmdbKey)
        : await searchTitlesKeyless(q);
      if (queryRef.current === q) setResults(hits);
    } finally {
      if (queryRef.current === q) setSearching(false);
    }
  }, [settings.tmdbKey]);

  const onQueryChange = (text: string) => {
    setQuery(text);
    queryRef.current = text;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = text.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
  };

  const submitSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = queryRef.current.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    runSearch(q);
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

  // ---- Card 2: Facebook / Instagram reel link --------------------------------
  const onFbChange = (text: string) => {
    setUrl(text);
    fbRunRef.current += 1; // cancel any in-flight run's completion
    setFbFailed(false);
  };

  const doFetchFb = async () => {
    const link = url.trim();
    if (!link) return;
    const runId = ++fbRunRef.current;
    const beforeIds = new Set(moviesRef.current.map((m) => m.id));
    setFbFailed(false);
    const ok = await importReel(link);
    if (runId !== fbRunRef.current) return; // user edited mid-run — ignore stale completion
    if (ok) {
      setUrl('');
      // Let React commit the newly added movie, then find what the run added.
      await new Promise((r) => setTimeout(r, 150));
      if (runId !== fbRunRef.current) return;
      const added = moviesRef.current.filter((m) => !beforeIds.has(m.id));
      const titles = added.filter((m) => !m.needsReview).map((m) => m.title).filter(Boolean);
      const message = titles.length
        ? `“${titles.join('”, “')}” added to watchlist.`
        : 'Saved to your Watchlist — couldn\'t identify the movie.';
      Alert.alert('Fetch complete', message, [{ text: 'OK', onPress: () => router.back() }]);
    } else {
      // Error case: show the store's specific message inline, keep the link for editing.
      setFbFailed(true);
    }
  };

  // ---- Card 3: YouTube link --------------------------------------------------
  const onYtChange = (text: string) => {
    setYtUrl(text);
    ytRunRef.current += 1; // cancel any in-flight run's completion
    setYtMessage(null);
  };

  /** YouTube import: oEmbed title (caption-first step), then TMDB/keyless match. */
  const doFetchYt = async () => {
    const link = ytUrl.trim();
    if (!link) return;
    const runId = ++ytRunRef.current;
    setYtMessage(null);
    if (!parseYouTubeId(link)) {
      setYtMessage("That doesn't look like a YouTube link — use a watch, Shorts, or youtu.be link.");
      return;
    }
    setYtWorking(true);
    try {
      const info = await fetchYouTubeTitle(link);
      if (runId !== ytRunRef.current) return;
      if (!info) {
        setYtMessage("Couldn't read that video (it may be private or removed).");
        return;
      }
      const match = settings.tmdbKey
        ? await bestMatch(info.title, settings.tmdbKey)
        : await bestMatchKeyless(info.title);
      if (runId !== ytRunRef.current) return;
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
        if (runId !== ytRunRef.current) return;
        setYtUrl('');
        Alert.alert('Fetch complete', `“${match.title}” added to watchlist.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      addMovie({
        title: 'Unknown title', year: 0, mediaType: 'movie', genres: [],
        overview: '', posterPath: '', reelURL: link,
        caption, notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
        originalLanguage: '', cast: [], needsReview: true,
      });
      if (runId !== ytRunRef.current) return;
      setYtUrl('');
      Alert.alert('Fetch complete', 'Saved to your Watchlist — couldn\'t identify the movie.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setYtWorking(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.heading}>🎬&nbsp; Add movie</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder="e.g. Predestination"
          placeholderTextColor="#8E8E93"
          onSubmitEditing={submitSearch}
          returnKeyType="search"
        />
        {searching && <ActivityIndicator color="#fff" style={styles.loader} />}
        {!searching && query.trim().length > 0 && results.length === 0 && (
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
        <View style={styles.headingRow}>
          <View style={styles.fbBadge}>
            <LinearGradient
              colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.06)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <FontAwesome name="facebook-f" size={22} color="#fff" />
          </View>
          <Text style={styles.heading}>Facebook</Text>
        </View>
        <Text style={styles.body}>Paste a Facebook or Instagram reel link.</Text>
        <View style={styles.fetchRow}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            value={url}
            onChangeText={onFbChange}
            placeholder="Paste link here"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.fetchButton, importing && styles.buttonDisabled]}
            onPress={doFetchFb}
            disabled={importing || !url.trim()}
          >
            {importing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.fetchButtonText}>Fetch</Text>
            )}
          </Pressable>
        </View>
        {fbFailed && !!importMessage && <Text style={styles.error}>{importMessage}</Text>}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.headingRow}>
          <View style={styles.ytBadge}>
            <LinearGradient
              colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.06)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="play" size={18} color="#fff" />
          </View>
          <Text style={styles.heading}>YouTube</Text>
        </View>
        <Text style={styles.body}>Paste a watch, Shorts or youtu.be link.</Text>
        <View style={styles.fetchRow}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            value={ytUrl}
            onChangeText={onYtChange}
            placeholder="Paste YouTube link here"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.fetchButton, ytWorking && styles.buttonDisabled]}
            onPress={doFetchYt}
            disabled={ytWorking || !ytUrl.trim()}
          >
            {ytWorking ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.fetchButtonText}>Fetch</Text>
            )}
          </Pressable>
        </View>
        {!!ytMessage && <Text style={styles.error}>{ytMessage}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 48 },
  section: { marginTop: 20 },
  divider: { height: 1, backgroundColor: '#2c2c2e', marginTop: 28 },
  heading: { color: '#fff', fontSize: 19, fontWeight: '800' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  fbBadge: {
    backgroundColor: '#1877F2', borderRadius: 10, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ytBadge: {
    backgroundColor: '#FF0000', borderRadius: 8, width: 42, height: 30,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21, marginBottom: 14 },
  input: {
    backgroundColor: FIELD_BG, color: '#111', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
  },
  inputFlex: { flex: 1 },
  fetchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fetchButton: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 20,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  fetchButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  error: { color: '#ff453a', fontSize: 14, marginTop: 12, lineHeight: 20 },
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
