import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../lib/store';
import { Movie } from '../../lib/types';
import SwipeDeck, { SwipeDir } from '../../components/SwipeDeck';
import ViewHeader from '../../components/ViewHeader';
import TilesView from '../../components/TilesView';
import ListView from '../../components/ListView';
import { useSharedFilters, applyFilters } from '../../lib/sharedFilters';
import FilterBar from '../../components/FilterBar';

export default function WatchlistScreen() {
  const {
    movies, ready, settings, setWatchlistView,
    moveMovie, deleteMovie, cycleToBack,
  } = useStore();
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useSharedFilters();
  // Tapping a tile/row jumps to the Cards view with that movie on top.
  // originView remembers where the jump came from so the back chevron
  // can return to it; null when cards was reached normally.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [originView, setOriginView] = useState<'tiles' | 'list' | null>(null);

  const view = settings.watchlistView;

  const watchlist = useMemo(
    () => movies.filter((m) => m.status === 'watchlist'),
    [movies]
  );

  const filtered = useMemo(
    () => applyFilters(watchlist, filters),
    [watchlist, filters]
  );

  const deck = useMemo(() => {
    if (!focusId) return filtered;
    const m = filtered.find((t) => t.id === focusId);
    return m ? [m, ...filtered.filter((t) => t.id !== focusId)] : filtered;
  }, [filtered, focusId]);

  const clearJump = () => {
    setFocusId(null);
    setOriginView(null);
  };

  const changeView = (v: 'cards' | 'tiles' | 'list') => {
    clearJump();
    setWatchlistView(v);
  };

  const openInCards = (m: Movie) => {
    setOriginView(view === 'list' ? 'list' : 'tiles');
    setFocusId(m.id);
    setWatchlistView('cards');
  };

  const goBackToOrigin = () => {
    const target = originView ?? 'tiles';
    clearJump();
    setWatchlistView(target);
  };

  const handleSwipe = (dir: SwipeDir, movie: Movie) => {
    clearJump();
    if (dir === 'left' || dir === 'right') {
      // Next: cycle the card to the back of the deck.
      cycleToBack(movie.id);
    } else if (dir === 'up') {
      moveMovie(movie.id, 'seen');
    } else if (dir === 'down') {
      deleteMovie(movie.id);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.dim}>Loading your watchlist…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ViewHeader
        title="Watchlist"
        value={view}
        onChange={changeView}
      />
      <FilterBar values={filters} onChange={setFilters} />

      {view === 'cards' && (
        <View style={styles.deckArea}>
          {deck.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🎬</Text>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.dim}>
                {watchlist.length === 0
                  ? 'Save movies from Trending or add your own with +.'
                  : 'No movies match these filters.'}
              </Text>
            </View>
          ) : (
            <View style={styles.deckWrap}>
              <SwipeDeck
                cards={deck}
                onSwipe={handleSwipe}
                trashBin
                toBackDirs={['left', 'right']}
                onInfoTap={(m) => router.push(`/movie/${m.id}`)}
                animation={settings.cardAnimation}
                deckStyle={settings.deckStyle}
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
        <TilesView movies={filtered} onSelect={openInCards} emptyText="Nothing in your watchlist yet." />
      )}

      {view === 'list' && (
        <ListView
          movies={filtered}
          onSelect={openInCards}
          actions={{
            onSeen: (m) => moveMovie(m.id, 'seen'),
            onRemove: (m) => deleteMovie(m.id),
          }}
          emptyText="Nothing in your watchlist yet."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingBottom: 24 },
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
