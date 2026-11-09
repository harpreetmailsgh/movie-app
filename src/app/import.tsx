import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
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
  const statusWord = entry.status === 'success' ? 'Added' : entry.status === 'partial' ? 'Some titles missing' : 'Failed';
  const fetchedDate = new Date(entry.createdAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <View style={styles.recentRow}>
      <Pressable style={styles.recentHeader} onPress={onToggle}>
        {videoId && !imgFailed ? (
          <Image
            source={{ uri: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }}
            style={styles.videoThumb}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ClapboardPoster style={styles.videoThumb} />
        )}
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={2} ellipsizeMode="tail">
            {entry.videoTitle ?? entry.url}
          </Text>
          <Text style={styles.resultDate}>{fetchedDate}</Text>
          {entry.status === 'failed' && !!entry.error ? (
            <Text style={styles.recentErrorSub} numberOfLines={2}>{entry.error}</Text>
          ) : (
            <Text style={styles.resultSub}>
              {entry.titles.length === 1 ? '1 title' : `${entry.titles.length} titles`}
            </Text>
          )}
        </View>
        <View style={styles.recentStatus}>
          <Text style={[styles.recentGlyph, { color: glyphColor }]}>{glyph}</Text>
          <Text style={[styles.recentStatusWord, { color: glyphColor }]}>{statusWord}</Text>
          <Text style={styles.recentChevron}>{expanded ? '˄' : '˅'}</Text>
        </View>
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
  /** One link field for YouTube — paste a YouTube link to add a movie.
   *  Submit auto-detects the platform and runs the matching import. */
  const [link, setLink] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbMatch[]>([]);
  const [searching, setSearching] = useState(false);
  /** Inline results card data — replaces the old Alert.alert popup. */
  const [fetchResults, setFetchResults] = useState<{ title: string; unverified: boolean; caption?: string }[] | null>(null);
  /** Inline error card — shows the worker's error verbatim, in the results card's spot. */
  const [fetchError, setFetchError] = useState<string | null>(null);
  /** Shown under the link field when a Paste tap reads nothing: on iOS 16+
   *  getStringAsync returns '' both for an empty clipboard and for a denied
   *  paste permission, so the two can't be told apart — either way the tap
   *  must say something instead of doing nothing silently. */
  const [pasteHint, setPasteHint] = useState(false);
  /** URL behind the current fetch error, so the error card's Retry button
   *  can re-enqueue it. Cleared on new link input and on success. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  /** Fetch queue: paste/share links enqueue here; the worker loop below processes them one at a time. */
  const { items: queueItems, enqueue, updateItem, removeItem } = useQueue();
  /** Any item currently processing — drives the "Finding the movies…" line. */
  const isProcessing = queueItems.some((i) => i.status === 'processing');

  /** Recent videos (backlog #72): replaces the "Recently added" section. */
  const { videos: recentVideos, recordVideo, clearVideos } = useRecentVideos();
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
    setPasteHint(false);
    setFetchResults(null);
    setFetchError(null);
    setFailedUrl(null);
  };

  /** Reads the clipboard into the link field (Paste button).
   *  On iOS 16+ the first read shows a system paste-permission prompt; if
   *  the user denies it, getStringAsync resolves to '' — the same as an
   *  empty clipboard, with no way to tell the two apart. Either way the
   *  tap now shows a visible hint instead of silently doing nothing. */
  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        setPasteHint(true);
        return;
      }
      setPasteHint(false);
      setLink(text);
      setFetchResults(null);
      setFetchError(null);
      setFailedUrl(null);
    } catch {
      // A rejected read (native error) used to fail silently — show the hint.
      setPasteHint(true);
    }
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
    // Mount diagnostic: log whether a shared URL arrived and the queue
    // length at the time, so a share lost to the load race is visible in
    // the device log instead of failing silently. The URL itself is never
    // logged.
    console.log('[import] sharedUrl:', sharedUrl ? 'present' : 'absent', 'queue length:', queueItems.length);
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
          // Results card is set BEFORE the queue row is removed, so both
          // state updates flush in the same render — the row never vanishes
          // leaving a gap before the card appears.
          setFetchResults(result.results.slice(0, 10));
          setFetchError(null);
          setFailedUrl(null);
          await removeItem(next.id);
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
          // Error card set before the row is removed — same no-gap ordering
          // as the success path above.
          setFetchError(error);
          setFetchResults(null);
          setFailedUrl(next.url);
          await removeItem(next.id);
        }
      } finally {
        queueProcessingRef.current = false;
      }
    })();
  }, [queueItems, updateItem, removeItem, settings.tmdbKey, importReel, addMovie, recordVideo]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.section, styles.firstSection]}>
        <Text style={styles.heading}>Search by title</Text>
        <View style={styles.sectionCard}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={onQueryChange}
            accessibilityLabel="Search movies"
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
        <Text style={styles.heading}>Paste a link from YouTube</Text>
        <View style={styles.sectionCard}>
          <View style={styles.fetchRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={link}
              onChangeText={onLinkChange}
              accessibilityLabel="Paste link"
              placeholder="Paste a link here"
              placeholderTextColor="#8E8E93"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={styles.pasteButton}
              onPress={() => { void pasteFromClipboard(); }}
            >
              <Text style={styles.pasteButtonText}>Paste</Text>
            </Pressable>
            <Pressable
              style={[styles.fetchButton, !link.trim() && styles.fetchButtonDisabled]}
              onPress={submitLink}
              disabled={!link.trim()}
            >
              <Text style={styles.fetchButtonText}>Fetch</Text>
            </Pressable>
          </View>
          {pasteHint && (
            <Text style={styles.pasteHint}>Nothing to paste — copy a video link first</Text>
          )}
          <Text style={styles.body}>Paste a link from YouTube to add a movie</Text>
          {isProcessing && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.progressText}>Finding the movies in this video…</Text>
            </View>
          )}
          <QueueList items={queueItems} />
          {fetchResults && fetchResults.length > 0 && (
            <View style={styles.resultsCard}>
              <Text style={styles.resultsHeader}>
                {fetchResults.length === 1
                  ? 'Added to your watchlist — 1 title'
                  : `Added to your watchlist — ${fetchResults.length} titles`}
              </Text>
              {fetchResults.map((r, i) => (
                r.unverified ? (
                  <View key={`${i}-${r.title}`} style={styles.unverifiedRow}>
                    <Text style={styles.unverifiedTitle}>Couldn&apos;t verify this title</Text>
                    <Text style={styles.unverifiedRawTitle}>{r.title}</Text>
                  </View>
                ) : (
                  <Pressable key={`${i}-${r.title}`} onPress={() => router.push('/(tabs)')}>
                    <Text style={styles.resultsRow}>
                      {i + 1}. {r.title}
                    </Text>
                  </Pressable>
                )
              ))}
            </View>
          )}
          {fetchError && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{fetchError}</Text>
              {!!failedUrl && (
                <Pressable style={styles.retryButton} onPress={() => { void enqueue(failedUrl); }}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>🕘&nbsp; Recent videos</Text>
          <Pressable
            style={styles.clearButton}
            onPress={() => { setExpandedVideoId(null); void clearVideos(); }}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.sectionCard}>
          {recentVideos.length === 0 ? (
            <Text style={styles.emptyText}>Videos you fetch will show up here.</Text>
          ) : (
            recentVideos.map((entry) => (
              <RecentVideoRow
                key={entry.id}
                entry={entry}
                expanded={expandedVideoId === entry.id}
                onToggle={() => setExpandedVideoId((cur) => (cur === entry.id ? null : entry.id))}
                onRetry={(url) => { void enqueue(url); }}
              />
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 8, paddingBottom: 48 },
  section: { marginTop: 20 },
  // With the screen title dropped, the first section sits closer to the top.
  firstSection: { marginTop: 4 },
  sectionCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  divider: { height: 1, backgroundColor: '#2c2c2e', marginTop: 28 },
  heading: { color: '#fff', fontSize: 19, fontWeight: '800' },
  headingRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10 },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 10 },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 21, marginTop: 4 },
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
  fetchButtonDisabled: { opacity: 0.35 },
  fetchButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
  pasteButton: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  pasteButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Shown under the link field when a Paste tap reads nothing (empty
  // clipboard or denied paste permission) — small grey, like emptyText.
  pasteHint: { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18, marginTop: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 },
  progressText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 21 },
  unverifiedRow: { marginTop: 10 },
  unverifiedTitle: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 22 },
  unverifiedRawTitle: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, marginTop: 2 },
  // Flat panels, not nested cards: the section card is the single card,
  // so results/error sit behind a top divider instead of their own #1c1c1e box.
  resultsCard: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
  },
  resultsHeader: { color: '#34C759', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  resultsRow: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 24 },
  errorCard: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
  },
  errorText: { color: '#ff453a', fontSize: 14, lineHeight: 21 },
  recentRow: {
    paddingVertical: 10, marginTop: 4,
  },
  recentHeader: { flexDirection: 'row', alignItems: 'center' },
  recentStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  recentStatusWord: { fontSize: 13, fontWeight: '700' },
  recentChevron: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '700' },
  recentGlyph: { fontSize: 18, fontWeight: '800' },
  recentErrorSub: { color: '#ff453a', fontSize: 13, marginTop: 4, lineHeight: 18 },
  recentExpanded: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  retryButton: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 18,
    paddingVertical: 13, minHeight: 44, justifyContent: 'center',
    alignSelf: 'flex-start', marginTop: 10, alignItems: 'center',
  },
  retryButtonText: { color: '#000', fontSize: 14, fontWeight: '700' },
  // Clear deletes history, so it is a muted red TEXT button (not a white
  // pill like Fetch/Retry, which would read as a main action). marginLeft
  // auto pushes it right in the headingRow; 44pt target like Retry.
  clearButton: {
    marginLeft: 'auto', minHeight: 44, paddingHorizontal: 12,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  clearButtonText: { color: '#ff453a', fontSize: 14, fontWeight: '700' },
  loader: { marginTop: 16 },
  // Flat rows: transparent, no radius — the section card is the single card.
  result: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, marginTop: 4,
  },
  thumb: { width: 44, height: 66, borderRadius: 8, backgroundColor: '#2c2c2e' },
  // Landscape 4:3 video thumb to match hqdefault.jpg (480x360) — no portrait crop.
  videoThumb: { width: 88, height: 66, borderRadius: 8, backgroundColor: '#2c2c2e' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  resultText: { flex: 1, marginLeft: 12 },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultDate: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },
  resultSub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 4 },
  addPlus: { color: '#30d158', fontSize: 24, fontWeight: '700', marginRight: 6 },
});
