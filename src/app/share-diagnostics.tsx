// Route: /share-diagnostics
// Viewer for the iOS share-extension diagnostics log written by the
// extension into the App Group container (see src/lib/shareLog.ts).
// In Expo Go the log is unavailable (native module not in the binary),
// so the empty state shows.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { readShareLog, clearShareLog } from '../lib/shareLog';

export default function ShareDiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState<string | null>(null); // null = loading
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const text = await readShareLog();
      if (!cancelled) setLog(text);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    setLog(null);
    setLog(await readShareLog());
  }, []);

  const copy = useCallback(async () => {
    if (!log) return;
    try {
      await Clipboard.setStringAsync(log);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [log]);

  const confirmClear = useCallback(() => {
    Alert.alert(
      'Clear share diagnostics?',
      'This deletes the share-extension log. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearShareLog();
            reload();
          },
        },
      ],
    );
  }, [reload]);

  const hasLog = !!log;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Share Diagnostics</Text>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, !hasLog && styles.buttonDisabled]}
          onPress={copy}
          disabled={!hasLog}
        >
          <Text style={styles.buttonText}>{copied ? 'Copied ✓' : 'Copy'}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, !hasLog && styles.buttonDisabled]}
          onPress={confirmClear}
          disabled={!hasLog}
        >
          <Text style={styles.buttonText}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        {log === null ? (
          <Text style={styles.status}>Reading share log…</Text>
        ) : log === '' ? (
          <Text style={styles.status}>
            No share diagnostics yet. Share something to Movie Deck, then check back here.
          </Text>
        ) : (
          <Text style={styles.log} selectable>
            {log}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  done: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  button: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  status: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 21 },
  log: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 12,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
