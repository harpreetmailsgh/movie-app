import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../lib/store';

// YouTube's embed endpoint rejects a bare top-level WebView load of
// /embed/<id> with "Error 153: Video player configuration error"
// (PLAYABILITY_ERROR_CODE_EMBEDDER_IDENTITY_MISSING_REFERRER): no http(s)
// Referer is sent, so YouTube refuses to configure the player. Wrapping the
// embed in an <iframe> inside a minimal page served from an https baseUrl
// makes the iframe request carry a Referer, and the video plays.
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

// trailerUrl is always an https://www.youtube.com/embed/<11-char-id> URL built
// by the trailer buttons; the id charset is strict so interpolation is safe.
function videoIdFromEmbedUrl(url: string): string | null {
  const m = url.match(/\/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function TrailerPlayer() {
  const { trailerUrl, closeTrailer } = useStore();
  const insets = useSafeAreaInsets();
  const videoId = trailerUrl ? videoIdFromEmbedUrl(trailerUrl) : null;

  return (
    <Modal
      visible={!!trailerUrl}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={closeTrailer}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <Text style={styles.title}>Trailer</Text>
          <Pressable onPress={closeTrailer} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeText}>✕ Done</Text>
          </Pressable>
        </View>
        {!!trailerUrl && (
          <WebView
            key={trailerUrl}
            source={
              videoId
                ? { html: embedHtml(videoId), baseUrl: 'https://www.youtube.com' }
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
    </Modal>
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
