import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';

// The trailer player is a regular Stack screen, NOT a React Native Modal:
// the movie detail screen (movie/[id]) is itself presented as a modal, and
// presenting an RN Modal over it leaves an invisible fullscreen overlay on
// iOS that swallows every tap (the app looks frozen and no trailer appears).
// A pushed route stays inside the navigation stack and presents reliably
// from both tab screens and the modal detail screen.
//
// YouTube's embed endpoint rejects a bare top-level WebView load of
// /embed/<id> with "Error 153: Video player configuration error"
// (PLAYABILITY_ERROR_CODE_EMBEDDER_IDENTITY_MISSING_REFERRER): no http(s)
// Referer is sent, so YouTube refuses to configure the player. Wrapping the
// embed in an <iframe> inside a minimal page served from an https baseUrl
// makes the iframe request carry a Referer, and the video plays.
// NOTE: the baseUrl must be a THIRD-PARTY origin, never youtube.com itself:
// a page claiming to be youtube.com embedding a youtube.com iframe is
// rejected as an invalid embed context ("Error 152: this video is
// unavailable"). .invalid is RFC-reserved and can never collide with a real
// site or its cookies.
const EMBED_BASE_URL = 'https://movie-recommender.invalid/';
function embedHtml(videoId: string): string {
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
  return (
    '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
    '<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}' +
    'iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}</style>' +
    '</head><body>' +
    `<iframe src="${src}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" ` +
    'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
    '</body></html>'
  );
}

// The url param is always an https://www.youtube.com/embed/<11-char-id> URL
// built by the trailer buttons; the id charset is strict so interpolation
// is safe.
function videoIdFromEmbedUrl(url: string): string | null {
  const m = url.match(/\/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function TrailerScreen() {
  const { url } = useLocalSearchParams<{ url?: string }>();
  const insets = useSafeAreaInsets();
  const trailerUrl = typeof url === 'string' && url ? url : null;
  const videoId = trailerUrl ? videoIdFromEmbedUrl(trailerUrl) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Text style={styles.title}>Trailer</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={12}>
          <Text style={styles.closeText}>✕ Done</Text>
        </Pressable>
      </View>
      {!!trailerUrl && (
        <WebView
          key={trailerUrl}
          source={
            videoId
              ? { html: embedHtml(videoId), baseUrl: EMBED_BASE_URL }
              : { uri: trailerUrl }
          }
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  closeBtn: { padding: 6 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  webview: { flex: 1, backgroundColor: '#000' },
});
