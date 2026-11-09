import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import type { QueueItem } from '../lib/queue';
import { parseYouTubeId } from '../lib/youtube';
import ClapboardPoster from './ClapboardPoster';

/** "Processing..." with animated dots cycling 1 → 2 → 3 → 1, plus a spinner. */
function ProcessingStatus() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={styles.statusRow}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.statusProcessing}>Processing{'.'.repeat(dots)}</Text>
    </View>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const videoId = parseYouTubeId(item.url);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <View style={styles.result}>
      {videoId && !imgFailed ? (
        <Image
          source={{ uri: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }}
          style={styles.thumb}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <ClapboardPoster style={styles.thumb} />
      )}
      <View style={styles.resultText}>
        <Text style={styles.resultTitle} numberOfLines={1} ellipsizeMode="tail">
          {item.videoTitle ?? item.url}
        </Text>
        {item.status === 'failed' && !!item.error && (
          <Text style={styles.resultError} numberOfLines={2}>
            {item.error}
          </Text>
        )}
      </View>
      {item.status === 'queued' && <Text style={styles.statusQueued}>Queued</Text>}
      {item.status === 'processing' && <ProcessingStatus />}
      {item.status === 'failed' && <Text style={styles.statusFailed}>Failed</Text>}
    </View>
  );
}

export default function QueueList({ items }: { items: QueueItem[] }) {
  return (
    <View>
      <Text style={styles.header}>Queue</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>Videos being fetched will show up here.</Text>
      ) : (
        items.map((item) => (
          <QueueRow key={item.id} item={item} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 21, marginTop: 4 },
  // Flat rows: the section card is the single card, so rows are transparent
  // with no radius (no nested #1c1c1e card inside the section card).
  result: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, marginTop: 4,
  },
  // Landscape 4:3 to match hqdefault.jpg (480x360) — no portrait crop.
  thumb: { width: 88, height: 66, borderRadius: 8, backgroundColor: '#2c2c2e' },
  resultText: { flex: 1, marginLeft: 12, marginRight: 10 },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultError: { color: '#ff453a', fontSize: 12, marginTop: 4, lineHeight: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusQueued: { color: '#fff', fontSize: 14 },
  statusProcessing: { color: '#fff', fontSize: 14 },
  statusFailed: { color: '#ff453a', fontSize: 14 },
});
