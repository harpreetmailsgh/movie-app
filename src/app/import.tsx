import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useStore } from '../lib/store';
import { searchTitles, searchTitlesKeyless, fetchImdbRating, fetchKeylessMeta, TmdbMatch } from '../lib/tmdb';
import { posterUrl } from '../lib/types';
import ClapboardPoster from '../components/ClapboardPoster';
import QueueList from '../components/QueueList';
import { useQueue } from '../lib/queue';
import { processQueueItem } from '../lib/importWorker';
import { parseYouTubeId } from '../lib/youtube';
import { useRecentVideos } from '../lib/recentVideos';
import type { RecentVideoEntry } from '../lib/recentVideos';

const FIELD_BG = '#C7C7CC';
const SEARCH_DEBOUNCE_MS = 500;

/** One "Recent videos" row (backlog #72): thumbnail, title, subtitle,
 *  status glyph; tap expands an accordion with the video's titles. */
function RecentVideoRow({ entry, expanded, onToggle, onRetry }: {
  entry: RecentVideoEntry;
  expanded: boolean;
  onToggle: () => void;
  onRetry: (url: string) => void;
}) {
  const videoId = parseYouTubeId(entry.url);
  const [imgFailed, setImgFailed] = useState(false);
  const glyph = entry.status === 'success' ? '✓' : entry.status === 'partial' ? '⚠' : '✕';
  const glyphColor = entry.status === 'success' ? '#30d158' : entry.status === 'partial' ? '#ff9f0a' : '#ff453a';
  return (
    <View style={styles.recentRow}>
      <Pressable style={styles.recentHeader} onPress={onToggle}>
        {videoId && !imgFailed ? (
          <Image
            source={{ uri: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }}
            style={styles.thumb}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ClapboardPoster style={styles.thumb} />
        )}
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={1} ellipsizeMode="tail">
            {entry.videoTitle ?? entry.url}
          </Text>
          {entry.status === 'failed' && !!entry.error ? (
            <Text style={styles.recentErrorSub} numberOfLines={2}>{entry.error}</Text>
          ) : (
            <Text style={styles.resultSub}>
              {entry.titles.length === 1 ? '1 title' : `${entry.titles.length} titles`}
            </Text>
          )}
        </View>
        <Text style={[styles.recentGlyph, { color: glyphColor }]}>{glyph}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.recentExpanded}>
          {entry.status === 'failed' ? (
            <>
              {!!entry.error && <Text style={styles.errorText}>{entry.error}</Text>}
              <Pressable style={styles.retryButton} onPress={() => onRetry(entry.url)}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            entry.titles.map((t, i) => (
              t.unverified ? (
                <View key={`${i}-${t.title}`} style={styles.unverifiedRow}>
                  <Text style={styles.unverifiedTitle}>Couldn&apos;t verify this title</Text>
                  <Text style={styles.unverifiedRawTitle}>{t.title}</Text>
                </View>
              ) : (
                <Text key={`${i}-${t.title}`} style={styles.resultsRow}>
                  {i + 1}. {t.title}
                </Text>
              )
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default function ImportScreen() {
  const { importReel, settings, addMovie } = useStore();
  // Deep link from the iOS share extension: movierecommender://import?sharedUrl=...
  const { sharedUrl } = useLocalSearchParams<{ sharedUrl?: string }>();
  /** One link field for every platform — TikTok, YouTube, Facebook, Instagram.
   *  Submit auto-detects the platform and runs the matching import. */
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMatch[]>([]);
  const [searching, setSearching] = useState(false);
  /** Inline results card data — replaces the old Alert.alert popup. */
  const [fetchResults, setFetchResults] = useState<{ title: string; unverified: boolean; caption?: string }[] | null>(null);
  /** Inline error card — shows the worker's error verbatim, in the results card's spot. */
  const [fetchError, setFetchError] = useState<string | null>(null);

  /** Fetch queue: paste/share links enqueue here; the worker loop below processes them one at a time. */
  const { items: queueItems, enqueue, updateItem, removeItem } = useQueue();

  /** Recent videos (backlog #72): replaces the "Recently added" section. */
  const { videos: recentVideos, recordVideo } = useRecentVideos();
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);

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
  // Links enqueue into the fetch queue (worker loop processes them one at a time).
  const onLinkChange = (text: string) => {
    setLink(text);
    setFetchResults(null);
    setFetchError(null);
  };

  /** Queue replaces the immediate-fetch path: Fetch tap enqueues the link. */
  const submitLink = () => {
    const trimmed = link.trim();
    if (!trimmed) return;
    void enqueue(trimmed);
    setLink('');
  };

  // ---- Share-extension deep link --------------------------------------------
  // The iOS share extension opens movierecommender://import?sharedUrl=... .
  // The incoming URL seeds the link field and enqueues into the fetch queue —
  // the worker picks it up; nothing runs immediately.
  const sharedHandled = useRef(false);
  useEffect(() => {
    if (sharedHandled.current || !sharedUrl) return;
    sharedHandled.current = true;
    const incoming = String(sharedUrl);
    // Share-extension URLs go through the fetch queue now — no auto-run.
    // Don't seed the text field: the queue shows the item, and leaving the
    // URL in the field would let one Fetch tap enqueue it a second time.
    void enqueue(incoming);
    // The guard ref above keeps this a one-shot, so no dependency tracking is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  // ---- Fetch queue worker: one item at a time, oldest queued first -------------
  // Guard ref so the effect never starts two items concurrently. processQueueItem
  // returns a result and never throws; the finally resets the guard regardless.
  const queueProcessingRef = useRef(false);
  useEffect(() => {
    if (queueProcessingRef.current) return;
    const next = queueItems
      .filter((i) => i.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    if (queueItems.some((i) => i.status === 'processing')) return;
    queueProcessingRef.current = true;
    (async () => {
      try {
        await updateItem(next.id, { status: 'processing' });
        const result = await processQueueItem(next.url, {
          tmdbKey: settings.tmdbKey,
          importReel,
          addMovie,
        });
        // Rider (backlog #70): write the worker-fetched video title back so
        // QueueRow shows the title instead of the raw URL.
        if (result.videoTitle) {
          await updateItem(next.id, { videoTitle: result.videoTitle });
        }
        if (result.ok) {
          // Record first, then auto-dismiss — failure path mirrors this order.
          await recordVideo({
            url: next.url,
            videoTitle: result.videoTitle ?? null,
            titles: result.results.slice(0, 10).map((r) => ({ title: r.title, unverified: !!r.unverified })),
            status: result.results.some((r) => r.unverified) ? 'partial' : 'success',
            error: null,
          });
          await removeItem(next.id);
          setFetchResults(result.results.slice(0, 10));
          setFetchError(null);
        } else {
          const error = result.error ?? 'Something went wrong.';
          // Record first, then auto-dismiss — mirrors the success path.
          await recordVideo({
            url: next.url,
            videoTitle: result.videoTitle ?? null,
            titles: [],
            status: 'failed',
            error,
          });
          await removeItem(next.id);
          setFetchError(error);
          setFetchResults(null);
        }
      } finally {
        queueProcessingRef.current = false;
      }
    })();
  }, [queueItems, updateItem, removeItem, settings.tmdbKey, importReel, addMovie, recordVideo]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.heading}>🎬&nbsp; Add movie</Text>
        <View style={styles.sectionCard}>
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
      </View>

      <View style={styles.section}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>🔗&nbsp; Paste a link from</Text>
          <View style={styles.headingIcons}>
            <FontAwesome6 name="youtube" size={20} color="#FF0000" />
          </View>
        </View>
        <View style={styles.sectionCard}>
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
              style={styles.fetchButton}
              onPress={submitLink}
              disabled={!link.trim()}
            >
              <Text style={styles.fetchButtonText}>Fetch</Text>
            </Pressable>
          </View>
          <Text style={styles.body}>Paste a YouTube Short link to add a movie</Text>
          <QueueList items={queueItems} />
          {fetchResults && fetchResults.length > 0 && (
            <View style={styles.resultsCard}>
              <Text style={styles.resultsHeader}>
                {fetchResults.length === 1 ? '1 title fetched' : `${fetchResults.length} titles fetched`}
              </Text>
              {fetchResults.map((r, i) => (
                r.unverified ? (
                  <View key={`${i}-${r.title}`} style={styles.unverifiedRow}>
                    <Text style={styles.unverifiedTitle}>Couldn&apos;t verify this title</Text>
                    <Text style={styles.unverifiedRawTitle}>{r.title}</Text>
                  </View>
                ) : (
                  <Text key={`${i}-${r.title}`} style={styles.resultsRow}>
                    {i + 1}. {r.title}
                  </Text>
                )
              ))}
            </View>
          )}
          {fetchError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{fetchError}</Text>
            </View>
          )}
        </View>
      </View>

      {recentVideos.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>🕘&nbsp; Recent videos</Text>
          <View style={styles.sectionCard}>
            {recentVideos.map((entry) => (
              <RecentVideoRow
                key={entry.id}
                entry={entry}
                expanded={expandedVideoId === entry.id}
                onToggle={() => setExpandedVideoId((cur) => (cur === entry.id ? null : entry.id))}
                onRetry={(url) => { void enqueue(url); }}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 48 },
  section: { marginTop: 20 },
  sectionCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  divider: { height: 1, backgroundColor: '#2c2c2e', marginTop: 28 },
  heading: { color: '#fff', fontSize: 19, fontWeight: '800' },
  headingRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10 },
  headingIcons: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21, marginTop: 12, marginBottom: 14 },
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
  fetchButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  brandIcons: { flexDirection: 'row', gap: 20, marginTop: 12, marginBottom: 12, alignItems: 'center' },
  unverifiedRow: { marginTop: 10 },
  unverifiedTitle: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 22 },
  unverifiedRawTitle: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, marginTop: 2 },
  resultsCard: {
    backgroundColor: '#1c1c1e', borderRadius: 14, padding: 16, marginTop: 14,
  },
  resultsHeader: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  resultsRow: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 24 },
  errorCard: {
    backgroundColor: '#1c1c1e', borderRadius: 14, padding: 16, marginTop: 14,
  },
  errorText: { color: '#ff453a', fontSize: 14, lineHeight: 21 },
  recentRow: {
    backgroundColor: '#1c1c1e', borderRadius: 14, padding: 10, marginTop: 10,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'center' },
  recentGlyph: { fontSize: 18, fontWeight: '800', marginRight: 4 },
  recentErrorSub: { color: '#ff453a', fontSize: 13, marginTop: 4, lineHeight: 18 },
  recentExpanded: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  retryButton: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 18,
    paddingVertical: 9, alignSelf: 'flex-start', marginTop: 10, alignItems: 'center',
  },
  retryButtonText: { color: '#000', fontSize: 14, fontWeight: '700' },
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
