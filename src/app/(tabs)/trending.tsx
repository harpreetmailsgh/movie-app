import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../lib/store';
import { Movie } from '../../lib/types';
import { fetchTrending, trendingToInput, getTrendingMeta } from '../../lib/trending';
import { cacheFeedItem } from '../../lib/feedCache';
import SwipeDeck, { SwipeDir } from '../../components/SwipeDeck';
import ViewHeader from '../../components/ViewHeader';
import { useSharedFilters, applyFilters } from '../../lib/sharedFilters';
import FilterBar, { filtersActive } from '../../components/FilterBar';
import MovieProgressBar from '../../components/MovieProgressBar';
import TilesView from '../../components/TilesView';
import ListView from '../../components/ListView';
import GuideOverlay, { GuideOverlayHandle, GuideMark } from '../../components/GuideOverlay';

// Coach-mark arrows for Trending's first-time guide: → + Watchlist,
// ← Next. Rendered by GuideOverlay; hidden once this tab's guide flag flips.
const TRENDING_GUIDE_MARKS: GuideMark[] = [
  { dir: 'right', label: '+ Watchlist', color: '#30d158' },
  { dir: 'left', label: 'Next', color: '#ff9f0a' },
];

export default function TrendingScreen() {
  const {
    movies, ready, settings, addMovie, setTrendingView, setGuideSeen,
  } = useStore();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Movie[] | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [headerTitle, setHeaderTitle] = useState('Trending 🔥');
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [filters, setFilters] = useSharedFilters();
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Jump-to-cards machinery (focusId/originView): retained as-is so the
  // cards view jump keeps working; tile/row taps now open the detail page.
  // originView remembers where the jump came from so the back chevron
  // can return to it; null when cards was reached normally.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [originView, setOriginView] = useState<'tiles' | 'list' | null>(null);

  const view = settings.trendingView;

  useEffect(() => {
    let live = true;
    // Pass the TMDB key so the trailer-key backfill can resolve keys
    // (optional param — no key still works, backfill then skips silently).
    fetchTrending(settings.tmdbKey)
      .then((t) => {
        if (!live) return;
        setItems(t);
        getTrendingMeta().then((meta) => {
          if (!live) return;
          setHeaderTitle(meta.label);
          setRefreshedAt(meta.refreshedAt);
        });
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => { live = false; };
    // Mount-once fetch: the TMDB key is baked into settings by the time this
    // screen mounts, so re-running on settings changes is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  // Titles already in the library (any status) — for the ✓ state.
  const libraryKeys = useMemo(
    () => new Set(movies.map((m) => `${m.title.toLowerCase()}|${m.year}`)),
    [movies]
  );
  const addedIds = useMemo(
    () => new Set((items ?? []).filter((t) => libraryKeys.has(`${t.title.toLowerCase()}|${t.year}`)).map((t) => t.id)),
    [items, libraryKeys]
  );

  const visible = useMemo(() => {
    const list = applyFilters(
      (items ?? []).filter((t) => !hiddenIds.includes(t.id)),
      filters
    );
    if (!focusId) return list;
    const m = list.find((t) => t.id === focusId);
    return m ? [m, ...list.filter((t) => t.id !== focusId)] : list;
  }, [items, hiddenIds, focusId, filters]);

  const clearJump = () => {
    setFocusId(null);
    setOriginView(null);
  };

  const changeView = (v: 'cards' | 'tiles' | 'list') => {
    clearJump();
    setTrendingView(v);
  };

  // Retry: back to the loading state (film-strip bar) and re-run the fetch.
  const retry = () => {
    setError(false);
    setItems(null);
    setRetryCount((c) => c + 1);
  };
  // Tapping a tile/row opens the detail page; the cards view stays
  // reachable via the view switcher. Feed items are not in the library,
  // so cache the tapped one for the detail page's fallback lookup.
  const openDetail = (t: Movie) => {
    cacheFeedItem(t);
    router.push(`/movie/${t.id}`);
  };

  const goBackToOrigin = () => {
    const target = originView ?? 'tiles';
    clearJump();
    setTrendingView(target);
  };

  const addToWatchlist = (t: Movie) => {
    if (addedIds.has(t.id)) return;
    addMovie(trendingToInput(t));
  };

  // First-time guide: animated coach-mark arrows floating over the deck.
  // Shows when the feed has items and this tab's guide hasn't been seen
  // (fresh install or Settings → Replay guide); fades out permanently on
  // the user's first swipe, then this tab's guide flag flips and the
  // overlay unmounts for good.
  const guideRef = useRef<GuideOverlayHandle>(null);
  const showGuide = ready && items !== null && !settings.guideSeenTrending && view === 'cards' && items.length > 0;

  const handleSwipe = (dir: SwipeDir, movie: Movie) => {
    guideRef.current?.dismiss();
    clearJump();
    if (dir === 'right') {
      // ＋ Watchlist: save it, then take it out of the feed.
      addToWatchlist(movie);
      setHiddenIds((h) => [...h, movie.id]);
    } else if (dir === 'left') {
      // Next: cycle to the back of the feed.
      setItems((prev) =>
        prev ? [...prev.filter((t) => t.id !== movie.id), movie] : prev
      );
    }
  };

  if (!ready || items === null) {
    if (error) {
      return (
        <View style={styles.center}>
          <Text style={styles.dim}>Couldn&apos;t load trending movies in your location. Please try again later.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            style={styles.retryButton}
            onPress={retry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <MovieProgressBar indeterminate size="large" style={styles.loadingBar} />
        <Text style={styles.dim}>Finding what's trending…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ViewHeader
        title={headerTitle}
        value={view}
        onChange={changeView}
      />
      {/* Hidden on first-ever run: getTrendingMeta reports null until a
          cache entry exists. */}
      {refreshedAt !== null && (
        <Text style={styles.refreshLine}>
          Last refreshed {new Date(refreshedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </Text>
      )}
      <FilterBar values={filters} onChange={setFilters} />

      {view === 'cards' && (
        <View style={styles.deckArea}>
          {visible.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🔥</Text>
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.dim}>
                {filtersActive(filters)
                  ? 'No matches — trending items do not carry language or rating data; try clearing those.'
                  : "You've gone through today's trending feed."}
              </Text>
            </View>
          ) : (
            <View style={styles.deckWrap}>
              <SwipeDeck
                cards={visible}
                onSwipe={handleSwipe}
                enabledDirs={['left', 'right']}
                toBackDirs={['left']}
                onInfoTap={(m) => router.push(`/movie/${m.id}`)}
                animation={settings.cardAnimation}
                deckStyle={settings.deckStyle}
                stampOverrides={{
                  right: { text: '＋ Watchlist', color: '#30d158', textColor: '#000', dragIcon: 'add' },
                }}
              />
              {/* Floating back button on the poster after a tile/row jump. */}
              {originView !== null && (
                <Pressable
                  accessibilityLabel="Back"
                  hitSlop={6}
                  style={styles.jumpBack}
                  onPress={goBackToOrigin}
                >
                  <Ionicons name="chevron-back" size={26} color="#1c1c1e" />
                </Pressable>
              )}
              {/* Coach-mark arrows for the first-time guide — pointer-transparent
                  so swipes pass through; the overlay fades out on first swipe. */}
              {showGuide && (
                <GuideOverlay
                  ref={guideRef}
                  marks={TRENDING_GUIDE_MARKS}
                  showViewHint={true}
                  onDismiss={() => setGuideSeen('trending')}
                />
              )}
            </View>
          )}
        </View>
      )}

      {view === 'tiles' && (
        <TilesView
          movies={visible}
          onSelect={openDetail}
          emptyText={
            filtersActive(filters)
              ? 'No matches — trending items do not carry language or rating data; try clearing those.'
              : 'Nothing trending right now.'
          }
        />
      )}

      {view === 'list' && (
        <ListView
          movies={visible}
          onSelect={openDetail}
          compactActions
          actions={{
            onAdd: addToWatchlist,
            addedIds,
          }}
          emptyText={
            filtersActive(filters)
              ? 'No matches — trending items do not carry language or rating data; try clearing those.'
              : 'Nothing trending right now.'
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingBottom: 24 },
  // Small dim line between the header and the filter bar showing the cache
  // freshness ("Last refreshed Fri, Sep 25"); neighbors untouched.
  refreshLine: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  deckArea: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', marginTop: 8 },
  deckWrap: { position: 'relative' },
  // Floating back button after a tile/row jump: white solid circle with a dark
  // chevron, so it stays visible on any poster art (dark or light).
  jumpBack: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#000' },
  loadingBar: { maxWidth: 280 },
  retryButton: {
    backgroundColor: '#FF9F0A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
});
