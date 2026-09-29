import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Movie, posterUrl, tmdbUrl } from '../lib/types';
import { resolveTrailerKey } from '../lib/tmdb';
import { firstYoutubeResultId } from '../lib/youtube';
import { useStore } from '../lib/store';
import ClapboardPoster from './ClapboardPoster';

export default function MovieCard({ movie, onInfoTap }: { movie: Movie; onInfoTap?: () => void }) {
  const { settings, revalidateTitle, deleteMovie, playTrailer } = useStore();
  const uri = posterUrl(movie.posterPath, 'w780');
  const gated = movie.needsReview && movie.status === 'watchlist';
  const sourceUrl = tmdbUrl(movie.tmdbID, movie.mediaType);
  const genres = movie.genres ?? [];
  const cast = movie.cast ?? [];

  const openTrailer = async () => {
    // Only the trailer video itself ever opens, inside the app: the official
    // TMDB trailer when there is one, otherwise the top YouTube result for
    // "<title> <year> official trailer". The "not found" note only appears
    // when both come up empty — never a search page.
    const tmdbKey = await resolveTrailerKey(movie, settings.tmdbKey);
    const tmdbStatus = tmdbKey ? 'found' : 'not found';
    let videoKey = tmdbKey;
    let fallbackNote = '';
    if (!videoKey) {
      videoKey = await firstYoutubeResultId(
        `${movie.title} ${movie.year || ''} official trailer`
      );
      fallbackNote = videoKey ? '\nYouTube fallback: found' : '\nYouTube fallback: not found';
    }
    // TEMP-DIAG: temporary popup reporting whether TMDB served the trailer,
    // so the TMDB path can be verified on device. Remove once confirmed.
    const diagMsg = `TMDB: ${tmdbStatus}${fallbackNote}`;
    if (!videoKey) {
      Alert.alert('Trailer check', `${diagMsg}\n\nWe couldn't find a trailer for "${movie.title}".`);
      return;
    }
    const key = videoKey;
    Alert.alert('Trailer check', diagMsg, [
      { text: 'Play', onPress: () => playTrailer(`https://www.youtube.com/embed/${key}?autoplay=1&rel=0`) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const metaBits = [
    movie.year > 0 ? String(movie.year) : null,
    movie.mediaType === 'tv' ? 'Series' : 'Movie',
    movie.imdbRating > 0 ? `★ ${movie.imdbRating.toFixed(1)}` : null,
    movie.originalLanguage || null,
  ].filter(Boolean);

  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.45)']}
      locations={[0, 0.45, 1]}
      style={styles.bezel}
    >
      <View style={styles.card}>
      {gated ? (
        <ClapboardPoster style={styles.poster} />
      ) : uri ? (
        <Image source={{ uri }} style={styles.poster} resizeMode="cover" />
      ) : (
        <View style={[styles.poster, styles.posterFallback]}>
          <Text style={styles.fallbackIcon}>{movie.mediaType === 'tv' ? '📺' : '🎬'}</Text>
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
        locations={[0.3, 0.62, 1]}
        style={styles.gradient}
      />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{movie.title}</Text>
          {onInfoTap && (
            <Pressable onPress={onInfoTap} hitSlop={12} style={styles.infoBtn}>
              <Text style={styles.infoText}>ⓘ</Text>
            </Pressable>
          )}
        </View>
        {metaBits.length > 0 && (
          <Text style={styles.meta}>{metaBits.join(' · ')}</Text>
        )}
        {genres.length > 0 && (
          <View style={styles.chips}>
            {genres.slice(0, 3).map((g) => (
              <View key={g} style={styles.chip}>
                <Text style={styles.chipText}>{g}</Text>
              </View>
            ))}
          </View>
        )}
        {!!movie.overview && (
          <View>
            <Text style={styles.overview} numberOfLines={3}>
              {movie.overview}
            </Text>
            <View style={styles.linkRow}>
              {!!sourceUrl && (
                <Pressable onPress={() => Linking.openURL(sourceUrl)} hitSlop={8}>
                  <Text style={styles.more}>More ↗</Text>
                </Pressable>
              )}
              {!!sourceUrl && <Text style={styles.linkDot}>·</Text>}
              <Pressable onPress={openTrailer} hitSlop={8} style={styles.trailerBtn}>
                <Text style={styles.trailerBtnText}>Trailer ▶</Text>
              </Pressable>
            </View>
          </View>
        )}
        {cast.length > 0 && (
          <Text style={styles.cast} numberOfLines={1}>
            Starring {cast.slice(0, 3).join(', ')}
          </Text>
        )}
        {gated && (
          <View>
            <Text style={styles.reviewNotice}>
              We couldn&apos;t validate this title. Do you want to Keep It or Trash It?
            </Text>
            <View style={styles.reviewRow}>
              <Pressable
                style={[styles.reviewBtn, styles.keepBtn]}
                onPress={async () => { await revalidateTitle(movie.id); }}
              >
                <Text style={styles.reviewBtnText}>Keep It</Text>
              </Pressable>
              <Pressable
                style={[styles.reviewBtn, styles.trashBtn]}
                onPress={() => deleteMovie(movie.id)}
              >
                <Text style={styles.reviewBtnText}>Trash It</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bezel: {
    flex: 1,
    borderRadius: 28,
    padding: 2,
    // NOTE: no iOS drop shadow here on purpose. A pathless shadow on a view
    // whose transform animates forces Core Animation to re-render the shadow
    // offscreen every frame (3 cards x full-bleed image + gradients) — that's
    // what made every swipe stutter. The bezel gradient already gives the
    // bevel; a black shadow on a black background would be invisible anyway.
    // Android keeps its cheap elevation shadow.
    elevation: 12,
  },
  card: {
    flex: 1,
    borderRadius: 26,
    backgroundColor: '#1c1c1e',
    overflow: 'hidden',
  },
  poster: { ...StyleSheet.absoluteFill, width: undefined, height: undefined },
  posterFallback: {
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: { fontSize: 64, opacity: 0.5 },
  gradient: { ...StyleSheet.absoluteFill },
  content: { flex: 1, justifyContent: 'flex-end', padding: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { flex: 1, color: '#fff', fontSize: 28, fontWeight: '800' },
  infoBtn: { marginLeft: 8, marginTop: 4 },
  infoText: { color: 'rgba(255,255,255,0.85)', fontSize: 24 },
  meta: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 6 },
  chips: { flexDirection: 'row', marginTop: 10, gap: 6 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  overview: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 10, lineHeight: 20 },
  more: { color: '#0a84ff', fontSize: 13, fontWeight: '700', marginTop: 4 },
  // Proper red trailer button on the swipe cards: cinematic red #C1272D
  // (same as the detail screen), white text, rounded corners.
  trailerBtn: {
    backgroundColor: '#C1272D',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 4,
  },
  trailerBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  linkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  linkDot: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 },
  cast: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  reviewNotice: { color: '#ff9f0a', fontSize: 12, fontWeight: '700', marginTop: 8 },
  reviewRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  reviewBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  keepBtn: { backgroundColor: '#30d158' },
  trashBtn: { backgroundColor: '#ff453a' },
  reviewBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
