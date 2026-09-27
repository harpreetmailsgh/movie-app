import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Movie, posterUrl } from '../lib/types';
import { useStore } from '../lib/store';
import ClapboardPoster from './ClapboardPoster';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 10;
const COLS = 2;
const TILE_W = (SCREEN_W - 32 - GAP * (COLS - 1)) / COLS;
const TILE_H = TILE_W * 1.5;

export default function TilesView({
  movies,
  onSelect,
  emptyText,
}: {
  movies: Movie[];
  onSelect: (m: Movie) => void;
  emptyText?: string;
}) {
  const { revalidateTitle, deleteMovie } = useStore();
  if (movies.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{emptyText ?? 'Nothing here yet.'}</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Movie }) => {
    const uri = posterUrl(item.posterPath);
    const gated = item.needsReview && item.status === 'watchlist';
    const meta = [
      item.year > 0 ? String(item.year) : null,
      item.imdbRating > 0 ? `★ ${item.imdbRating.toFixed(1)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <Pressable style={styles.tile} onPress={() => onSelect(item)}>
        {gated ? (
          <ClapboardPoster style={styles.poster} />
        ) : uri ? (
          <Image source={{ uri }} style={styles.poster} />
        ) : (
          <View style={[styles.poster, styles.fallback]}>
            <Text style={styles.fallbackIcon}>{item.mediaType === 'tv' ? '📺' : '🎬'}</Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {!!meta && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {gated && (
          <View>
            <Text style={styles.reviewNotice} numberOfLines={3}>
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
                onPress={() => deleteMovie(item.id)}
              >
                <Text style={styles.reviewBtnText}>Trash It</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <FlatList
      data={movies}
      keyExtractor={(m) => m.id}
      renderItem={renderItem}
      numColumns={COLS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: { justifyContent: 'flex-start', gap: GAP, marginBottom: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  tile: { width: TILE_W },
  poster: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 10,
    backgroundColor: '#1c1c1e',
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackIcon: { fontSize: 32 },
  title: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 15 },
  meta: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 },
  reviewNotice: { color: '#ff9f0a', fontSize: 11, marginTop: 4 },
  reviewRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  reviewBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  keepBtn: { backgroundColor: '#30d158' },
  trashBtn: { backgroundColor: '#ff453a' },
  reviewBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
