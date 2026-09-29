import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../lib/store';

export default function TrailerPlayer() {
  const { trailerUrl, closeTrailer } = useStore();
  const insets = useSafeAreaInsets();

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
            source={{ uri: trailerUrl }}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
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
