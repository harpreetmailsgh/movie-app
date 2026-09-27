import React, { useRef, useState } from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Movie, posterUrl } from '../lib/types';
import { useStore } from '../lib/store';
import ClapboardPoster from './ClapboardPoster';

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
}: {
  movies: Movie[];
  onSelect: (m: Movie) => void;
  actions: ListActions;
  emptyText?: string;
}) {
  if (movies.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{emptyText ?? 'Nothing here yet.'}</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Movie }) => (
    <Row item={item} onSelect={onSelect} actions={actions} />
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
}: {
  item: Movie;
  onSelect: (m: Movie) => void;
  actions: ListActions;
}) {
  const ref = useRef<Swipeable>(null);
  const { revalidateTitle, deleteMovie } = useStore();
  const uri = posterUrl(item.posterPath);
  const gated = item.needsReview && item.status === 'watchlist';
  // Measured width of the swipe actions strip. Swipeable parks the row at
  // exactly -rightWidth (its own measurement of this strip), so the
  // follow-along translate below must span the measured width — the old
  // hardcoded 160px is what cut buttons off on single-button rows
  // (Trending/Seen) while two-button rows (Watchlist) happened to fit.
  const [actionsWidth, setActionsWidth] = useState(0);
  const close = () => ref.current?.close();

  const renderRight = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
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
    <Swipeable ref={ref} renderRightActions={renderRight} overshootRight={false}>
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
  reviewNotice: { color: '#ff9f0a', fontSize: 13, marginTop: 6 },
  reviewRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  reviewBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  keepBtn: { backgroundColor: '#30d158' },
  trashBtn: { backgroundColor: '#ff453a' },
  reviewBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
