import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../lib/store';
import { Movie } from '../../lib/types';
import { fetchTrending, trendingToInput } from '../../lib/trending';
import { cacheFeedItem } from '../../lib/feedCache';
import * as trendingLib from '../../lib/trending';
import SwipeDeck, { SwipeDir } from '../../components/SwipeDeck';
import ViewHeader from '../../components/ViewHeader';
import { useSharedFilters, applyFilters } from '../../lib/sharedFilters';
import FilterBar, { filtersActive } from '../../components/FilterBar';
import TilesView from '../../components/TilesView';
import ListView from '../../components/ListView';

// Dev-1 adds getTrendingLabel(): Promise<string> to src/lib/trending in parallel.
// This shim compiles until that lands, then resolves to the real export at
// runtime (module namespace objects carry live bindings).
const getTrendingLabel: () => Promise<string> =
  (trendingLib as unknown as { getTrendingLabel?: () => Promise<string> }).getTrendingLabel ??
  (async () => 'Trending 🔥');

export default function TrendingScreen() {
  const {
    movies, ready, settings, addMovie, setTrendingView,
  } = useStore();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Movie[] | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [headerTitle, setHeaderTitle] = useState('Trending 🔥');
  const [filters, setFilters] = useSharedFilters();
  // Jump-to-cards machinery (focusId/originView): retained as-is so the
  // cards view jump keeps working; tile/row taps now open the detail page.
  // originView remembers where the jump came from so the back chevron
  // can return to it; null when cards was reached normally.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [originView, setOriginView] = useState<'tiles' | 'list' | null>(null);

  const view = settings.trendingView;

  useEffect(() => {
    let live = true;
    fetchTrending().then((t) => {
      if (!live) return;
      setItems(t);
      getTrendingLabel().then((label) => {
        if (live) setHeaderTitle(label);
      });
    });
    return () => { live = false; };
  }, []);

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

  const handleSwipe = (dir: SwipeDir, movie: Movie) => {
    clearJump();
    if (dir === 'right') {
      // ＋ Watchlist: save it, then take it out of the feed.
      addToWatchlist(movie);
      setHiddenIds((h) => [...h, movie.id]);
    } else if (dir === 'down') {
      // Trash: remove from the feed (bin commit UI via trashBin, like Watchlist).
      setHiddenIds((h) => [...h, movie.id]);
    } else if (dir === 'up') {
      // Seen: save it to the Seen list, then take it out of the feed.
      if (!addedIds.has(movie.id)) addMovie({ ...trendingToInput(movie), status: 'seen' });
      setHiddenIds((h) => [...h, movie.id]);
    } else if (dir === 'left') {
      // Next: cycle to the back of the feed.
      setItems((prev) =>
        prev ? [...prev.filter((t) => t.id !== movie.id), movie] : prev
      );
    }
  };

  if (!ready || items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
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
      <Text style={styles.sub}>Popular movies & series right now</Text>
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
                enabledDirs={['left', 'right', 'up', 'down']}
                trashBin
                toBackDirs={['left']}
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
          actions={{
            onAdd: addToWatchlist,
            addedIds,
            addLabel: '＋ Watchlist',
            onRemove: (t) => setHiddenIds((h) => [...h, t.id]),
            removeLabel: 'Trash',
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
  sub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
});
