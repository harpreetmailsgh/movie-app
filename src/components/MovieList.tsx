import React from 'react';
import { View, Text, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Movie, posterUrl } from '../lib/types';
import { useStore } from '../lib/store';

/** The Seen tab: simple rows, tap for detail, Remove deletes permanently. */
export default function MovieList() {
  const { movies, ready, moveMovie, deleteMovie } = useStore();
  const items = movies
    .filter((m) => m.status === 'seen')
    .sort((a, b) => b.dateAdded - a.dateAdded);

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Loading…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Nothing here yet.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Movie }) => {
    const uri = posterUrl(item.posterPath);
    return (
      <Pressable style={styles.row} onPress={() => router.push(`/movie/${item.id}`)}>
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbIcon}>{item.mediaType === 'tv' ? '📺' : '🎬'}</Text>
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.sub}>
            {[item.year > 0 ? String(item.year) : null, item.mediaType === 'tv' ? 'Series' : 'Movie']
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {item.needsReview && <Text style={styles.review}>Needs a look</Text>}
        </View>
        <Pressable style={styles.miniBtn} onPress={() => moveMovie(item.id, 'watchlist')}>
          <Text style={styles.miniBtnText}>Watchlist</Text>
        </Pressable>
        <Pressable style={[styles.miniBtn, styles.dangerBtn]} onPress={() => deleteMovie(item.id)}>
          <Text style={[styles.miniBtnText, styles.dangerText]}>Remove</Text>
        </Pressable>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(m) => m.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dim: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  sep: { height: 1, backgroundColor: '#1c1c1e', marginLeft: 76 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  thumb: { width: 48, height: 72, borderRadius: 8, backgroundColor: '#1c1c1e' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 22 },
  rowText: { flex: 1, marginLeft: 12, marginRight: 8 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 3 },
  review: { color: '#ff9f0a', fontSize: 12, marginTop: 2 },
  miniBtn: {
    backgroundColor: '#1c1c1e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 6,
  },
  miniBtnText: { color: '#0a84ff', fontSize: 12, fontWeight: '700' },
  dangerBtn: { backgroundColor: 'rgba(255,69,58,0.12)' },
  dangerText: { color: '#ff6961' },
});
