import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
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
  const [query, setQuery] = useState('');
  // originView remembers where a cards-view jump came from so the floating
  // back button can return to it; null when cards was reached normally.
  // (Tile/row taps now open the detail page, so the jump path is dormant.)
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

  // Live search over the filtered list — title substring, case-insensitive.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((m) => m.title.toLowerCase().includes(q));
  }, [filtered, query]);

  const clearJump = () => {
    setOriginView(null);
  };

  const changeView = (v: 'cards' | 'tiles' | 'list') => {
    clearJump();
    setSeenView(v);
  };

  // Tapping a tile/row opens the detail page; the cards view stays
  // reachable via the view switcher.
  const openDetail = (m: Movie) => {
    router.push(`/movie/${m.id}`);
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
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search seen movies…"
          placeholderTextColor="rgba(0,0,0,0.45)"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable
            accessibilityLabel="Clear search"
            onPress={() => setQuery('')}
            hitSlop={8}
            style={styles.clearBtn}
          >
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        )}
      </View>

      {view === 'cards' && (
        <View style={styles.deckArea}>
          {searched.length === 0 ? (
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
                cards={searched}
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
          movies={searched}
          onSelect={openDetail}
          emptyText={
            filtersActive(filters)
              ? 'No movies match these filters.'
              : 'Nothing here yet.'
          }
        />
      )}

      {view === 'list' && (
        <ListView
          movies={searched}
          onSelect={openDetail}
          actions={{
            onAdd: (m) => moveMovie(m.id, 'watchlist'),
            addLabel: '＋ Watchlist',
            onRemove: (m) => deleteMovie(m.id),
            removeLabel: 'Trash',
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
  searchRow: { position: 'relative', marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  searchInput: {
    backgroundColor: '#E9E9EE',
    color: '#000',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingRight: 38,
    paddingVertical: 10,
    fontSize: 15,
  },
  clearBtn: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  clearText: { color: 'rgba(0,0,0,0.5)', fontSize: 20, fontWeight: '600' },
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
