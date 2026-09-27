import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Movie, posterUrl } from '../lib/types';
import { useStore } from '../lib/store';
import ClapboardPoster from './ClapboardPoster';

// Compact swipe actions (Trending list only): three fixed-size buttons and a
// full-swipe trash zone. With friction=1 (default) and overshootFriction=2,
// overshoot points = (-rawDrag - STRIP_W) / 2, so 90pt of overshoot lands at
// raw dragX = -(STRIP_W + 90 * 2).
const COMPACT_BTN_W = 78;
const STRIP_W = COMPACT_BTN_W * 3; // 234
const TRASH_OVERSHOOT = 90;
const RAW_TRASH_X = -(STRIP_W + TRASH_OVERSHOOT * 2); // -414

export interface ListActions {
  onSeen?: (m: Movie) => void;
  onRemove?: (m: Movie) => void;
  onAdd?: (m: Movie) => void;
  addedIds?: Set<string>;
  addLabel?: string;
  removeLabel?: string;
}

export default function ListView({
  movies,
  onSelect,
  actions,
  emptyText,
  compactActions,
}: {
  movies: Movie[];
  onSelect: (m: Movie) => void;
  actions: ListActions;
  emptyText?: string;
  /** Trending-style swipe: fixed 78pt buttons + full-swipe trash zone. */
  compactActions?: boolean;
}) {
  if (movies.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{emptyText ?? 'Nothing here yet.'}</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Movie }) => (
    <Row item={item} onSelect={onSelect} actions={actions} compactActions={compactActions} />
  );

  return (
    <FlatList
      data={movies}
      keyExtractor={(m) => m.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

function Row({
  item,
  onSelect,
  actions,
  compactActions,
}: {
  item: Movie;
  onSelect: (m: Movie) => void;
  actions: ListActions;
  compactActions?: boolean;
}) {
  const ref = useRef<Swipeable>(null);
  const { revalidateTitle, deleteMovie } = useStore();
  const uri = posterUrl(item.posterPath);
  const gated = item.needsReview && item.status === 'watchlist';
  // Always-current actions for the gesture listener (the listener is
  // attached once; the actions object identity changes every render).
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });
  // Instant full-swipe trash: fires once when the drag crosses the trash
  // threshold mid-gesture. Resets if the finger comes back under it.
  const trashFiredRef = useRef(false);
  useEffect(() => {
    if (!compactActions) return;
    const sx = ref.current as unknown as { state?: { dragX?: Animated.Value } } | null;
    const raw = sx?.state?.dragX;
    if (!raw) return;
    const sub = raw.addListener(({ value }: { value: number }) => {
      if (value <= RAW_TRASH_X) {
        if (!trashFiredRef.current) {
          trashFiredRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          actionsRef.current.onRemove?.(item);
        }
      } else if (value > -STRIP_W - 20) {
        trashFiredRef.current = false;
      }
    });
    return () => raw.removeListener(sub);
  }, [compactActions, item]);
  // Measured width of the swipe actions strip. Swipeable parks the row at
  // exactly -rightWidth (its own measurement of this strip), so the
  // follow-along translate below must span the measured width — the old
  // hardcoded 160px is what cut buttons off on single-button rows
  // (Trending/Seen) while two-button rows (Watchlist) happened to fit.
  const [actionsWidth, setActionsWidth] = useState(0);
  const close = () => ref.current?.close();

  // Compact (Trending) actions: three fixed 78pt buttons, icon over label,
  // plus a red trash zone left of the strip that uncovers as the row
  // overshoots. All visuals are transform/opacity interpolations on the
  // natively-driven row translation — no setState in the gesture path.
  const renderRightCompact = (
    _progress: Animated.AnimatedInterpolation<number>,
    transX: Animated.AnimatedInterpolation<number>
  ) => {
    const overshoot = transX.interpolate({
      inputRange: [-STRIP_W - TRASH_OVERSHOOT, -STRIP_W],
      outputRange: [TRASH_OVERSHOOT, 0],
      extrapolate: 'clamp',
    });
    const trashScale = overshoot.interpolate({
      inputRange: [0, TRASH_OVERSHOOT],
      outputRange: [0.5, 1.5],
      extrapolate: 'clamp',
    });
    const zoneOpacity = overshoot.interpolate({
      inputRange: [0, 30],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    const added = actions.addedIds?.has(item.id);
    const buttons: { icon: string; label: string; color: string; run: () => void }[] = [];
    if (actions.onAdd) {
      buttons.push({
        icon: added ? '✓' : '＋',
        label: added ? 'Added' : 'Watchlist',
        color: '#30d158',
        run: () => { if (!added) actions.onAdd!(item); },
      });
    }
    if (actions.onSeen) {
      buttons.push({
        icon: '✓',
        label: 'Seen',
        color: '#0a84ff',
        run: () => actions.onSeen!(item),
      });
    }
    if (actions.onRemove) {
      buttons.push({
        icon: '🗑',
        label: actions.removeLabel ?? 'Trash',
        color: '#ff453a',
        run: () => actions.onRemove!(item),
      });
    }
    return (
      <>
        <Animated.View pointerEvents="none" style={[styles.trashZone, { opacity: zoneOpacity }]}>
          <Animated.Text style={[styles.trashZoneIcon, { transform: [{ scale: trashScale }] }]}>
            🗑
          </Animated.Text>
        </Animated.View>
        <View style={styles.compactStrip}>
          {buttons.map((b) => (
            <Pressable
              key={b.label}
              style={[styles.compactBtn, { backgroundColor: b.color }]}
              onPress={() => { close(); b.run(); }}
            >
              <Text style={styles.compactIcon}>{b.icon}</Text>
              <Text style={styles.compactLabel}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </>
    );
  };

  const renderRight = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (compactActions) return renderRightCompact(progress, dragX);
    const w = Math.max(actionsWidth, 1);
    const trans = dragX.interpolate({
      inputRange: [-w, 0],
      outputRange: [0, w],
      extrapolate: 'clamp',
    });
    const buttons: { label: string; color: string; run: () => void }[] = [];
    if (actions.onAdd) {
      const added = actions.addedIds?.has(item.id);
      buttons.push({
        label: added ? '✓ Added' : (actions.addLabel ?? '＋ Add'),
        color: '#30d158',
        run: () => { if (!added) actions.onAdd!(item); },
      });
    }
    if (actions.onSeen) {
      buttons.push({
        label: '✓ Seen',
        color: '#0a84ff',
        run: () => actions.onSeen!(item),
      });
    }
    if (actions.onRemove) {
      buttons.push({
        label: actions.removeLabel ?? '🗑 Delete',
        color: '#ff453a',
        run: () => actions.onRemove!(item),
      });
    }
    return (
      <Animated.View
        onLayout={({ nativeEvent }) => setActionsWidth(nativeEvent.layout.width)}
        style={[styles.actions, { transform: [{ translateX: trans }] }]}
      >
        {buttons.map((b) => (
          <Pressable
            key={b.label}
            style={[styles.actionBtn, { backgroundColor: b.color }]}
            onPress={() => { close(); b.run(); }}
          >
            <Text style={styles.actionText}>{b.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={ref}
      renderRightActions={renderRight}
      overshootRight={compactActions ? undefined : false}
      overshootFriction={compactActions ? 2 : undefined}
    >
      <Pressable style={styles.row} onPress={() => onSelect(item)}>
        {gated ? (
          <ClapboardPoster style={styles.thumb} />
        ) : uri ? (
          <Image source={{ uri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbIcon}>{item.mediaType === 'tv' ? '📺' : '🎬'}</Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[
              item.year > 0 ? String(item.year) : null,
              item.mediaType === 'tv' ? 'Series' : 'Movie',
              item.imdbRating > 0 ? `★ ${item.imdbRating.toFixed(1)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {(item.genres ?? []).length > 0 && (
            <Text style={styles.genres} numberOfLines={1}>
              {(item.genres ?? []).slice(0, 3).join(' · ')}
            </Text>
          )}
          {gated && (
            <View>
              <Text style={styles.reviewNotice} numberOfLines={2}>
                We couldn&apos;t validate this title. Do you want to Keep It or Trash It?
              </Text>
              <View style={styles.reviewRow}>
                <Pressable
                  style={[styles.reviewBtn, styles.keepBtn]}
                  onPress={async () => { await revalidateTitle(item.id); }}
                >
                  <Text style={styles.reviewBtnText}>Keep It</Text>
                </Pressable>
                <Pressable
                  style={[styles.reviewBtn, styles.trashBtn]}
                  onPress={() => {
                    if (actions.onRemove) actions.onRemove(item);
                    else deleteMovie(item.id);
                  }}
                >
                  <Text style={styles.reviewBtnText}>Trash It</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  sep: { height: 1, backgroundColor: '#1c1c1e', marginLeft: 88 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#000',
  },
  thumb: { width: 60, height: 90, borderRadius: 10, backgroundColor: '#1c1c1e' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 28 },
  rowText: { flex: 1, marginLeft: 12, marginRight: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 16, marginTop: 3 },
  genres: { color: 'rgba(255,255,255,0.4)', fontSize: 15, marginTop: 2 },
  chev: { color: 'rgba(255,255,255,0.3)', fontSize: 30, fontWeight: '300' },
  actions: { flexDirection: 'row', alignItems: 'stretch' },
  actionBtn: { justifyContent: 'center', paddingHorizontal: 25 },
  actionText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  // Compact (Trending) swipe: fixed-size buttons + full-swipe trash zone.
  compactStrip: { flexDirection: 'row', alignItems: 'stretch' },
  compactBtn: { width: COMPACT_BTN_W, justifyContent: 'center', alignItems: 'center' },
  compactIcon: { color: '#fff', fontSize: 22, fontWeight: '700' },
  compactLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
  trashZone: {
    position: 'absolute',
    right: STRIP_W,
    top: 0,
    bottom: 0,
    width: 200,
    backgroundColor: '#ff453a',
    justifyContent: 'center',
  },
  trashZoneIcon: { position: 'absolute', right: 28, fontSize: 44 },
  reviewNotice: { color: '#ff9f0a', fontSize: 13, marginTop: 6 },
  reviewRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  reviewBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  keepBtn: { backgroundColor: '#30d158' },
  trashBtn: { backgroundColor: '#ff453a' },
  reviewBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
