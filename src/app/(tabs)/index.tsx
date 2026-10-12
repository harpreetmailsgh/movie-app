import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
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
import MovieProgressBar from '../../components/MovieProgressBar';

export default function WatchlistScreen() {
  const {
    movies, ready, settings, setWatchlistView,
    moveMovie, deleteMovie, cycleToBack, setOnboardingSeen,
  } = useStore();
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useSharedFilters();
  // Jump-to-cards machinery (focusId/originView): retained as-is so the
  // cards view jump keeps working; tile/row taps now open the detail page.
  // originView remembers where the jump came from so the back chevron
  // can return to it; null when cards was reached normally.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [originView, setOriginView] = useState<'tiles' | 'list' | null>(null);

  const view = settings.watchlistView;

  const watchlist = useMemo(
    () => movies.filter((m) => m.status === 'watchlist'),
    [movies]
  );

  // Alphabetical A→Z for tiles/list — sorted copy, never the stored order.
  const filtered = useMemo(
    () => [...applyFilters(watchlist, filters)].sort((a, b) => a.title.localeCompare(b.title)),
    [watchlist, filters]
  );

  // Cards deck: library order, NOT A→Z. "Next" swipes (left/right) cycle the
  // card to the back of the stored order via cycleToBack — on a sorted deck
  // that reorder is a no-op, so the deck could never advance past the top
  // card (v1.6.0 regression).
  const deckOrder = useMemo(
    () => applyFilters(watchlist, filters),
    [watchlist, filters]
  );

  const deck = useMemo(() => {
    if (!focusId) return deckOrder;
    const m = deckOrder.find((t) => t.id === focusId);
    return m ? [m, ...deckOrder.filter((t) => t.id !== focusId)] : deckOrder;
  }, [deckOrder, focusId]);

  const clearJump = () => {
    setFocusId(null);
    setOriginView(null);
  };

  const changeView = (v: 'cards' | 'tiles' | 'list') => {
    clearJump();
    setWatchlistView(v);
  };

  // Tapping a tile/row opens the detail page; the cards view stays
  // reachable via the view switcher.
  const openDetail = (m: Movie) => {
    router.push(`/movie/${m.id}`);
  };

  const goBackToOrigin = () => {
    const target = originView ?? 'tiles';
    clearJump();
    setWatchlistView(target);
  };

  // First-time guide: animated coach-mark arrows floating over the deck
  // (↑ Seen, ↓ Trash, ← → Next). Shows when the deck has cards and the
  // guide hasn't been seen (fresh install or Settings → Replay guide);
  // fades out permanently on the user's first swipe. The dismissing ref
  // keeps the overlay mounted through the fade-out; onboardingSeen flips
  // only after the fade completes, then the overlay unmounts for good.
  const [guideOpacity] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const dismissing = useRef(false);
  const showGuide = ready && !settings.onboardingSeen && view === 'cards' && deck.length > 0;

  // Fade the arrows in and start the looping bob (transform + opacity only,
  // native driver). No setState here — visibility is derived from showGuide.
  useEffect(() => {
    if (!showGuide) return;
    dismissing.current = false; // re-arm (covers Settings → Replay guide)
    guideOpacity.setValue(0);
    Animated.timing(guideOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showGuide, guideOpacity, bob]);

  const bobUp = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const bobDown = bob.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });
  const bobLeft = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const bobRight = bob.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

  const dismissGuide = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    // Fade out, then unmount (never unmount mid-animation — iOS blanks the deck).
    Animated.timing(guideOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
      .start(() => setOnboardingSeen());
  }, [guideOpacity, setOnboardingSeen]);

  const handleSwipe = (dir: SwipeDir, movie: Movie) => {
    dismissGuide();
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
        <MovieProgressBar indeterminate size="small" />
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
              {/* Coach-mark arrows for the first-time guide: pointer-transparent
                  so swipes pass through; kept mounted through the fade-out. */}
              {showGuide && (
                <Animated.View style={[styles.guideOverlay, { opacity: guideOpacity }]} pointerEvents="none">
                  <Animated.View style={[styles.guideMark, styles.guideTop, { transform: [{ translateY: bobUp }] }]}>
                    <View style={styles.guideBubble}>
                      <Ionicons name="arrow-up" size={22} color="#fff" />
                    </View>
                    <Text style={styles.guideLabel}>Seen</Text>
                  </Animated.View>
                  <Animated.View style={[styles.guideMark, styles.guideBottom, { transform: [{ translateY: bobDown }] }]}>
                    <View style={styles.guideBubble}>
                      <Ionicons name="arrow-down" size={22} color="#fff" />
                    </View>
                    <Text style={styles.guideLabel}>Trash</Text>
                  </Animated.View>
                  <Animated.View style={[styles.guideMark, styles.guideLeft, { transform: [{ translateX: bobLeft }] }]}>
                    <View style={styles.guideBubble}>
                      <Ionicons name="arrow-back" size={22} color="#fff" />
                    </View>
                    <Text style={styles.guideLabel}>Next</Text>
                  </Animated.View>
                  <Animated.View style={[styles.guideMark, styles.guideRight, { transform: [{ translateX: bobRight }] }]}>
                    <View style={styles.guideBubble}>
                      <Ionicons name="arrow-forward" size={22} color="#fff" />
                    </View>
                    <Text style={styles.guideLabel}>Next</Text>
                  </Animated.View>
                </Animated.View>
              )}
            </View>
          )}
        </View>
      )}

      {view === 'tiles' && (
        <TilesView movies={filtered} onSelect={openDetail} emptyText="Nothing in your watchlist yet." />
      )}

      {view === 'list' && (
        <ListView
          movies={filtered}
          onSelect={openDetail}
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
  // First-time guide coach marks: floating arrow bubbles over the deck.
  guideOverlay: { ...StyleSheet.absoluteFill, zIndex: 20 },
  guideMark: { position: 'absolute', alignItems: 'center', gap: 6 },
  guideTop: { top: 10, left: '50%', marginLeft: -28 },
  guideBottom: { bottom: 10, left: '50%', marginLeft: -28 },
  guideLeft: { left: 10, top: '50%', marginTop: -38 },
  guideRight: { right: 10, top: '50%', marginTop: -38 },
  guideBubble: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  guideLabel: {
    color: '#fff', fontSize: 13, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
});
