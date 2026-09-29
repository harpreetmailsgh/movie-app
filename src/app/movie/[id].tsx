import React, { useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, Linking, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useStore } from '../../lib/store';
import { getFeedItem } from '../../lib/feedCache';
import { posterUrl, tmdbUrl, trailerSearchUrl } from '../../lib/types';
import { resolveTrailerKey } from '../../lib/tmdb';
import ClapboardPoster from '../../components/ClapboardPoster';

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { movies, moveMovie, deleteMovie, updateMovie, revalidateTitle, settings, playTrailer } = useStore();
  // Library first; fall back to the in-memory feed cache so tapping a
  // Trending tile (feed items are not in the library) still renders the
  // detail page. Library data always wins; feed items are never written
  // into the library.
  const movie = movies.find((m) => m.id === id) ?? getFeedItem(id);
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
    // Trailers always play inside the app now: the TMDB trailer when we have
    // one, otherwise the YouTube search page in the same in-app player.
    const key = await resolveTrailerKey(movie, settings.tmdbKey);
    playTrailer(
      key
        ? `https://www.youtube.com/embed/${key}?autoplay=1&rel=0`
        : trailerSearchUrl(movie.title, movie.year)
    );
  };

  const uri = posterUrl(movie.posterPath, 'w780');

  const saveTitle = async () => {
    const t = titleDraft.trim();
    setEditingTitle(false);
    if (!t) return;
    updateMovie(movie.id, { title: t, needsReview: true });
    await revalidateTitle(movie.id, t);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {uri ? (
        <Image source={{ uri }} style={styles.poster} resizeMode="cover" />
      ) : movie.needsReview && movie.status === 'watchlist' ? (
        <ClapboardPoster style={styles.poster} />
      ) : (
        <View style={[styles.poster, styles.posterFallback]}>
          <Text style={styles.fallbackIcon}>{movie.mediaType === 'tv' ? '📺' : '🎬'}</Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable style={styles.trailerBtn} onPress={openTrailer}>
          <Text style={styles.trailerBtnText}>Trailer ▶</Text>
        </Pressable>
        {movie.status !== 'seen' && (
          <Pressable
            style={styles.seenBtn}
            onPress={() => {
              moveMovie(movie.id, 'seen');
              router.back();
            }}
          >
            <Text style={styles.seenBtnText}>Seen</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.trashBtn}
          onPress={() => {
            deleteMovie(movie.id);
            router.back();
          }}
        >
          <Text style={styles.trashBtnText}>Trash</Text>
        </Pressable>
      </View>

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
        <View style={styles.titleBlock}>
          <Pressable
            onPress={() => {
              setTitleDraft(movie.title === 'Unknown title' ? '' : movie.title);
              setEditingTitle(true);
            }}
          >
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {movie.title} <Text style={styles.editHint}>✎</Text>
            </Text>
          </Pressable>
          {(() => {
            const segments: string[] = [];
            if (movie.year > 0) segments.push(String(movie.year));
            if (movie.imdbRating > 0) segments.push(`★ ${movie.imdbRating.toFixed(1)}`);
            if ((movie.genres ?? []).length > 0) segments.push((movie.genres ?? []).join(' · '));
            return segments.length > 0 ? (
              <Text style={styles.meta}>{segments.join(' · ')}</Text>
            ) : null;
          })()}
        </View>
      )}

      {movie.needsReview && movie.status === 'watchlist' && (
        <View style={styles.reviewBox}>
          <Text style={styles.reviewText}>
            We couldn’t validate this title. Do you want to Keep It or Trash It?
          </Text>
          <View style={styles.reviewRow}>
            <Pressable
              style={styles.keepBtn}
              onPress={async () => { await revalidateTitle(movie.id); }}
            >
              <Text style={styles.keepBtnText}>Keep It</Text>
            </Pressable>
            <Pressable
              style={styles.trashBtn}
              onPress={() => {
                deleteMovie(movie.id);
                router.back();
              }}
            >
              <Text style={styles.trashBtnText}>Trash It</Text>
            </Pressable>
          </View>
        </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 20, paddingTop: 8, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  dim: { color: 'rgba(255,255,255,0.6)' },
  poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 18, backgroundColor: '#1c1c1e' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackIcon: { fontSize: 72, opacity: 0.5 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  // Trailer gets its own style: a deeper cinematic red (NOT YouTube brand red).
  // Smaller in the action row than the old standalone button. linkBtn/linkBtnText
  // above stay untouched.
  trailerBtn: {
    flex: 1, backgroundColor: '#C1272D', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
  },
  trailerBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  seenBtn: {
    backgroundColor: '#30d158', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center',
  },
  seenBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  trashBtn: {
    backgroundColor: '#ff453a', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center',
  },
  trashBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  titleBlock: { marginTop: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  editHint: { fontSize: 16, color: 'rgba(255,255,255,0.4)' },
  editRow: { flexDirection: 'row', marginTop: 20, gap: 10 },
  titleInput: {
    flex: 1, backgroundColor: '#1c1c1e', color: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700',
  },
  saveBtn: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  saveBtnText: { color: '#000', fontWeight: '700' },
  reviewBox: {
    backgroundColor: '#1c1c1e', borderRadius: 14, padding: 14, marginTop: 16,
  },
  reviewText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  reviewRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  keepBtn: {
    flex: 1, backgroundColor: '#30d158', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
  },
  keepBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  meta: {
    color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 6,
  },
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
});
