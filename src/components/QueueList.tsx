import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { QueueItem } from '../lib/queue';
import { parseYouTubeId } from '../lib/youtube';
import ClapboardPoster from './ClapboardPoster';

/** "Processing..." with animated dots cycling 1 → 2 → 3 → 1. */
function ProcessingStatus() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.statusProcessing}>Processing{'.'.repeat(dots)}</Text>;
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
  if (items.length === 0) return null;
  return (
    <View>
      <Text style={styles.header}>Queue</Text>
      {items.map((item) => (
        <QueueRow key={item.id} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  result: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1c1e',
    borderRadius: 14, padding: 10, marginTop: 10,
  },
  thumb: { width: 44, height: 66, borderRadius: 8, backgroundColor: '#2c2c2e' },
  resultText: { flex: 1, marginLeft: 12, marginRight: 10 },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultError: { color: '#ff453a', fontSize: 12, marginTop: 4, lineHeight: 16 },
  statusQueued: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  statusProcessing: { color: '#fff', fontSize: 13 },
  statusFailed: { color: '#ff453a', fontSize: 13 },
});
