import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, Linking, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useStore } from '../../lib/store';
import { posterUrl, tmdbUrl, EntryStatus } from '../../lib/types';
import { resolveTrailerUrl } from '../../lib/tmdb';

const MOVE_TARGETS: { status: EntryStatus; label: string }[] = [
  { status: 'watchlist', label: 'Watch List' },
  { status: 'seen', label: 'Seen' },
];

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { movies, moveMovie, deleteMovie, updateMovie, settings } = useStore();
  const movie = movies.find((m) => m.id === id);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  if (!movie) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>This entry no longer exists.</Text>
      </View>
    );
  }

  const openTrailer = async () => {
    const url = await resolveTrailerUrl(movie, settings.tmdbKey);
    Linking.openURL(url);
  };

  const uri = posterUrl(movie.posterPath, 'w780');

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t) updateMovie(movie.id, { title: t, needsReview: false });
    setEditingTitle(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {uri ? (
        <Image source={{ uri }} style={styles.poster} resizeMode="cover" />
      ) : (
        <View style={[styles.poster, styles.posterFallback]}>
          <Text style={styles.fallbackIcon}>{movie.mediaType === 'tv' ? '📺' : '🎬'}</Text>
        </View>
      )}

      {editingTitle ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            autoFocus
            placeholder="Movie title"
            placeholderTextColor="rgba(255,255,255,0.35)"
          />
          <Pressable style={styles.saveBtn} onPress={saveTitle}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setTitleDraft(movie.title === 'Unknown title' ? '' : movie.title);
            setEditingTitle(true);
          }}
        >
          <Text style={styles.title}>
            {movie.title} <Text style={styles.editHint}>✎</Text>
          </Text>
        </Pressable>
      )}

      {movie.year > 0 && (
        <Text style={styles.meta}>
          {movie.year} · {movie.mediaType === 'tv' ? 'Series' : 'Movie'}
          {movie.imdbRating > 0 ? ` · ★ ${movie.imdbRating.toFixed(1)}` : ''}
          {movie.originalLanguage ? ` · ${movie.originalLanguage}` : ''}
        </Text>
      )}
      {(movie.genres ?? []).length > 0 && (
        <Text style={styles.genres}>{(movie.genres ?? []).join(' · ')}</Text>
      )}
      {!!movie.overview && <Text style={styles.overview}>{movie.overview}</Text>}
      {(() => {
        const source = tmdbUrl(movie.tmdbID, movie.mediaType);
        return source ? (
          <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(source)}>
            <Text style={styles.linkBtnText}>More on TMDB ↗</Text>
          </Pressable>
        ) : null;
      })()}
      <Pressable
        style={styles.linkBtn}
        onPress={openTrailer}
      >
        <Text style={styles.linkBtnText}>Watch trailer ▶</Text>
      </Pressable>
      {(movie.cast ?? []).length > 0 && (
        <View style={styles.castBox}>
          <Text style={styles.castLabel}>Cast</Text>
          <Text style={styles.cast}>{(movie.cast ?? []).join(', ')}</Text>
        </View>
      )}
      {!!movie.notes && (
        <Text style={styles.notes}>📌 {movie.notes}</Text>
      )}
      {!!movie.caption && (
        <View style={styles.captionBox}>
          <Text style={styles.captionLabel}>From the reel</Text>
          <Text style={styles.caption}>{movie.caption}</Text>
        </View>
      )}
      {!!movie.reelURL && (
        <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(movie.reelURL)}>
          <Text style={styles.linkBtnText}>Open source reel ↗</Text>
        </Pressable>
      )}

      <Text style={styles.sectionLabel}>Move to</Text>
      <View style={styles.moveRow}>
        {MOVE_TARGETS.filter((t) => t.status !== movie.status).map((t) => (
          <Pressable
            key={t.status}
            style={styles.moveBtn}
            onPress={() => {
              moveMovie(movie.id, t.status);
              router.back();
            }}
          >
            <Text style={styles.moveBtnText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.deleteBtn}
        onPress={() => {
          deleteMovie(movie.id);
          router.back();
        }}
      >
        <Text style={styles.deleteBtnText}>Delete forever</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  dim: { color: 'rgba(255,255,255,0.6)' },
  poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 18, backgroundColor: '#1c1c1e' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackIcon: { fontSize: 72, opacity: 0.5 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 18 },
  editHint: { fontSize: 16, color: 'rgba(255,255,255,0.4)' },
  editRow: { flexDirection: 'row', marginTop: 18, gap: 10 },
  titleInput: {
    flex: 1, backgroundColor: '#1c1c1e', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700',
  },
  saveBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  saveBtnText: { color: '#000', fontWeight: '700' },
  meta: { color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 8 },
  genres: { color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 6 },
  overview: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 23, marginTop: 14 },
  castBox: { marginTop: 16 },
  castLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  cast: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 21 },
  notes: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 21, marginTop: 12 },
  captionBox: { backgroundColor: '#1c1c1e', borderRadius: 12, padding: 14, marginTop: 16 },
  captionLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  caption: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20 },
  linkBtn: {
    backgroundColor: 'rgba(10,132,255,0.15)', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  linkBtnText: { color: '#0a84ff', fontSize: 15, fontWeight: '700' },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700', marginTop: 26, marginBottom: 10 },
  moveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moveBtn: { backgroundColor: '#1c1c1e', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  moveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  deleteBtn: { marginTop: 30, alignItems: 'center', paddingVertical: 12 },
  deleteBtnText: { color: '#ff453a', fontSize: 15, fontWeight: '700' },
});
