import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useStore } from '../../lib/store';
import { Movie } from '../../lib/types';
import SwipeDeck, { SwipeDir } from '../../components/SwipeDeck';
import ViewHeader from '../../components/ViewHeader';
import TilesView from '../../components/TilesView';
import ListView from '../../components/ListView';
import { useSharedFilters, applyFilters } from '../../lib/sharedFilters';
import FilterBar, { filtersActive } from '../../components/FilterBar';

export default function SeenScreen() {
  const {
    movies, ready, settings, setSeenView,
    moveMovie, deleteMovie, cycleToBack,
  } = useStore();
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useSharedFilters();
  // Tapping a tile/row jumps to the Cards view with that movie on top.
  // originView remembers where the jump came from so the floating back
  // button can return to it; null when cards was reached normally.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [originView, setOriginView] = useState<'tiles' | 'list' | null>(null);

  const view = settings.seenView;

  // Library order (like Watchlist) so left/right "cycle to back" works.
  const seen = useMemo(
    () => movies.filter((m) => m.status === 'seen'),
    [movies]
  );

  const filtered = useMemo(
    () => applyFilters(seen, filters),
    [seen, filters]
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
    setSeenView(v);
  };

  const openInCards = (m: Movie) => {
    setOriginView(view === 'list' ? 'list' : 'tiles');
    setFocusId(m.id);
    setSeenView('cards');
  };

  const goBackToOrigin = () => {
    const target = originView ?? 'tiles';
    clearJump();
    setSeenView(target);
  };

  const handleSwipe = (dir: SwipeDir, movie: Movie) => {
    clearJump();
    if (dir === 'left' || dir === 'right') {
      // Next: cycle the card to the back of the deck.
      cycleToBack(movie.id);
    } else if (dir === 'up') {
      // Already seen — no-op (Watchlist-identical mapping).
      moveMovie(movie.id, 'seen');
    } else if (dir === 'down') {
      deleteMovie(movie.id);
    }
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.dim}>Loading your seen movies…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ViewHeader
        title="Seen"
        value={view}
        onChange={changeView}
      />
      <FilterBar values={filters} onChange={setFilters} />

      {view === 'cards' && (
        <View style={styles.deckArea}>
          {deck.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>👁️</Text>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.dim}>
                {seen.length === 0
                  ? 'Swipe a watchlist card up and it will land here.'
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
              {originView !== null && (
                <Pressable
                  accessibilityLabel="Back"
                  onPress={goBackToOrigin}
                  style={styles.fabBack}
                >
                  <Ionicons name="chevron-back" size={24} color="#1c1c1e" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {view === 'tiles' && (
        <TilesView
          movies={filtered}
          onSelect={openInCards}
          emptyText={
            filtersActive(filters)
              ? 'No movies match these filters.'
              : 'Nothing here yet.'
          }
        />
      )}

      {view === 'list' && (
        <ListView
          movies={filtered}
          onSelect={openInCards}
          actions={{
            onRemove: (m) => deleteMovie(m.id),
          }}
          emptyText={
            filtersActive(filters)
              ? 'No movies match these filters.'
              : 'Nothing here yet.'
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingBottom: 24 },
  deckArea: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', marginTop: 8 },
  deckWrap: { position: 'relative' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  // Floating back button shown after a tile/row jump into cards: a solid
  // white circle so it reads on ANY poster art, dark chevron for contrast.
  fabBack: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
});
