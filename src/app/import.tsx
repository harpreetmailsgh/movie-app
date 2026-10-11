import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useStore } from '../lib/store';
import { bestMatch, bestMatchKeyless, searchTitles, searchTitlesKeyless, fetchImdbRating, fetchKeylessMeta, TmdbMatch } from '../lib/tmdb';
import { parseYouTubeId, fetchYouTubeTitle } from '../lib/youtube';
import { isTikTokUrl, fetchTikTokInfo } from '../lib/tiktok';
import { posterUrl } from '../lib/types';
import ClapboardPoster from '../components/ClapboardPoster';

const FIELD_BG = '#E9E9EE';
const SEARCH_DEBOUNCE_MS = 500;

export default function ImportScreen() {
  const { importReel, importing, importMessage, settings, addMovie } = useStore();
  // Deep link from the iOS share extension: movierecommender://import?sharedUrl=...
  const { sharedUrl } = useLocalSearchParams<{ sharedUrl?: string }>();
  /** After a share-extension import, land on the Watchlist instead of going back. */
  const doneFromShare = () => (sharedUrl ? router.replace('/(tabs)') : router.back());
  /** One link field for every platform — TikTok, YouTube, Facebook, Instagram.
   *  Submit auto-detects the platform and runs the matching import. */
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [ytWorking, setYtWorking] = useState(false);
  const [ytMessage, setYtMessage] = useState<string | null>(null);
  const [ttWorking, setTtWorking] = useState(false);
  const [ttMessage, setTtMessage] = useState<string | null>(null);
  const [fbFailed, setFbFailed] = useState(false);

  // Run ids: editing a field mid-run cancels that run's completion UI.
  const fbRunRef = useRef(0);
  const ytRunRef = useRef(0);
  const ttRunRef = useRef(0);

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
      overview, posterPath: m.posterPath, reelURL: link.trim(),
      caption: '', notes: '', status: 'watchlist', tmdbID: m.tmdbID, imdbRating,
      originalLanguage: m.originalLanguage, cast,
      needsReview: false,
    });
    router.back();
  };

  /** "By title" last row: save the typed text as-is, flagged for review. */
  const saveAsTyped = () => {
    const t = query.trim();
    if (!t) return;
    addMovie({
      title: t, year: 0, mediaType: 'movie', genres: [],
      overview: '', posterPath: '', reelURL: '',
      caption: '', notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
      originalLanguage: '', cast: [], needsReview: true,
    });
    router.back();
  };

  // ---- Unified link import: one field, platform auto-detected ------------------
  const onLinkChange = (text: string) => {
    setLink(text);
    // Editing mid-run cancels that run's completion UI on every platform.
    fbRunRef.current += 1;
    ytRunRef.current += 1;
    ttRunRef.current += 1;
    setFbFailed(false);
    setYtMessage(null);
    setTtMessage(null);
  };

  /** Route one link to the matching import — same routing as the share-extension deep link. */
  const routeLink = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (isTikTokUrl(trimmed)) {
      doFetchTt(trimmed);
    } else {
      let host = '';
      try { host = new URL(trimmed).hostname.toLowerCase(); } catch { /* fall through to the reel handler */ }
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        doFetchYt(trimmed);
      } else {
        doFetchFb(trimmed);
      }
    }
  };

  const submitLink = () => routeLink(link);

  // ---- Card 2: Facebook / Instagram reel link --------------------------------
  const doFetchFb = async (linkOverride?: string) => {
    const target = (linkOverride ?? link).trim();
    if (!target) return;
    const runId = ++fbRunRef.current;
    setFbFailed(false);
    const outcome = await importReel(target);
    if (runId !== fbRunRef.current) return; // user edited mid-run — ignore stale completion
    if (outcome.ok) {
      setLink('');
      const { added, alreadyHave, savedForReview } = outcome;
      const message = added.length
        ? `“${added.join('”, “')}” added to watchlist.` +
          (alreadyHave.length ? ` Already in your list: “${alreadyHave.join('”, “')}”.` : '')
        : alreadyHave.length
          ? `Already in your watchlist: “${alreadyHave.join('”, “')}”.`
          : savedForReview.length
            ? `Saved “${savedForReview.join('”, “')}” — couldn't validate the title.`
            : 'Saved to your Watchlist — couldn\'t identify the movie.';
      Alert.alert('Fetch complete', message, [{ text: 'OK', onPress: doneFromShare }]);
    } else {
      // Error case: show the store's specific message inline, keep the link for editing.
      setFbFailed(true);
    }
  };

  // ---- YouTube link ------------------------------------------------------------
  /** YouTube import: oEmbed title (caption-first step), then TMDB/keyless match. */
  const doFetchYt = async (linkOverride?: string) => {
    const target = (linkOverride ?? link).trim();
    if (!target) return;
    const runId = ++ytRunRef.current;
    setYtMessage(null);
    if (!parseYouTubeId(target)) {
      setYtMessage("That doesn't look like a YouTube link — use a watch, Shorts, or youtu.be link.");
      return;
    }
    setYtWorking(true);
    try {
      const info = await fetchYouTubeTitle(target);
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
          overview, posterPath: match.posterPath, reelURL: target,
          caption, notes: '', status: 'watchlist', tmdbID: match.tmdbID, imdbRating,
          originalLanguage: match.originalLanguage, cast,
          needsReview: false,
        });
        if (runId !== ytRunRef.current) return;
        setLink('');
        Alert.alert('Fetch complete', `“${match.title}” added to watchlist.`, [
          { text: 'OK', onPress: doneFromShare },
        ]);
        return;
      }
      addMovie({
        title: info.title, year: 0, mediaType: 'movie', genres: [],
        overview: '', posterPath: '', reelURL: target,
        caption, notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
        originalLanguage: '', cast: [], needsReview: true,
      });
      if (runId !== ytRunRef.current) return;
      setLink('');
      Alert.alert('Fetch complete', `Saved “${info.title}” — couldn't validate the title.`, [
        { text: 'OK', onPress: doneFromShare },
      ]);
    } finally {
      setYtWorking(false);
    }
  };

  // ---- TikTok link -------------------------------------------------------------
  /** TikTok import: oEmbed caption (caption-first step), then TMDB/keyless match. */
  const doFetchTt = async (linkOverride?: string) => {
    const target = (linkOverride ?? link).trim();
    if (!target) return;
    const runId = ++ttRunRef.current;
    setTtMessage(null);
    if (!isTikTokUrl(target)) {
      setTtMessage("That doesn't look like a TikTok link — use a tiktok.com or vm.tiktok.com link.");
      return;
    }
    setTtWorking(true);
    try {
      const info = await fetchTikTokInfo(target);
      if (runId !== ttRunRef.current) return;
      if (!info) {
        setTtMessage("Couldn't read that video (it may be private or removed).");
        return;
      }
      const match = settings.tmdbKey
        ? await bestMatch(info.caption, settings.tmdbKey)
        : await bestMatchKeyless(info.caption);
      if (runId !== ttRunRef.current) return;
      const caption = `${info.caption} — ${info.author}`;
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
          overview, posterPath: match.posterPath, reelURL: target,
          caption, notes: '', status: 'watchlist', tmdbID: match.tmdbID, imdbRating,
          originalLanguage: match.originalLanguage, cast,
          needsReview: false,
        });
        if (runId !== ttRunRef.current) return;
        setLink('');
        Alert.alert('Fetch complete', `“${match.title}” added to watchlist.`, [
          { text: 'OK', onPress: doneFromShare },
        ]);
        return;
      }
      addMovie({
        title: info.caption, year: 0, mediaType: 'movie', genres: [],
        overview: '', posterPath: '', reelURL: target,
        caption, notes: '', status: 'watchlist', tmdbID: 0, imdbRating: 0,
        originalLanguage: '', cast: [], needsReview: true,
      });
      if (runId !== ttRunRef.current) return;
      setLink('');
      Alert.alert('Fetch complete', `Saved “${info.caption}” — couldn't validate the title.`, [
        { text: 'OK', onPress: doneFromShare },
      ]);
    } finally {
      setTtWorking(false);
    }
  };

  // ---- Share-extension deep link --------------------------------------------
  // The iOS share extension opens movierecommender://import?sharedUrl=... .
  // Seed the single link field with the incoming URL and run the matching
  // import automatically — the whole flow the user asked for: share in the
  // reel app, movie saved.
  const sharedHandled = useRef(false);
  useEffect(() => {
    if (sharedHandled.current || !sharedUrl) return;
    sharedHandled.current = true;
    const incoming = String(sharedUrl);
    // One-shot deep-link init: seeding the link field from the incoming URL.
    setLink(incoming);
    routeLink(incoming);
    // The fetch functions are plain per-render closures; the guard ref above
    // keeps this a one-shot, so no dependency tracking is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  /** Any platform import currently running — drives the unified Fetch button. */
  const anyWorking = importing || ytWorking || ttWorking;

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
        {query.trim().length > 0 && (
          <Pressable style={styles.result} onPress={saveAsTyped}>
            <ClapboardPoster style={styles.thumb} />
            <View style={styles.resultText}>
              <Text style={styles.resultTitle} numberOfLines={2}>
                Don&apos;t see it? Save &quot;{query.trim()}&quot; exactly as typed
              </Text>
            </View>
            <Text style={styles.addPlus}>＋</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.heading}>🔗&nbsp; Add from a link</Text>
        <Text style={styles.body}>Paste a TikTok, YouTube, Facebook, or Instagram link — the right import runs automatically.</Text>
        <View style={styles.fetchRow}>
          <TextInput
            style={[styles.input, styles.inputFlex]}
            value={link}
            onChangeText={onLinkChange}
            placeholder="Paste a link here"
            placeholderTextColor="#8E8E93"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.fetchButton, anyWorking && styles.buttonDisabled]}
            onPress={submitLink}
            disabled={anyWorking || !link.trim()}
          >
            {anyWorking ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.fetchButtonText}>Fetch</Text>
            )}
          </Pressable>
        </View>
        {fbFailed && !!importMessage && <Text style={styles.error}>{importMessage}</Text>}
        {!!ytMessage && <Text style={styles.error}>{ytMessage}</Text>}
        {!!ttMessage && <Text style={styles.error}>{ttMessage}</Text>}
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
