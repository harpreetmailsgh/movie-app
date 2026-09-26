import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';

const HINTS = [
  { icon: '←', color: '#8e8e93', title: 'Next', detail: 'Swipe left or right → next card, this one cycles to the back' },
  { icon: '↑', color: '#0a84ff', title: 'Seen it', detail: 'Swipe up → moves to Seen' },
  { icon: '↓', color: '#ff453a', title: 'Trash', detail: 'Swipe down → dives into the trash, permanently deleted' },
];

export default function Onboarding({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>How it works</Text>
          <Text style={styles.sub}>Your Watchlist is a deck of cards.{'\n'}Swipe each movie to file it away.</Text>
          {HINTS.map((h) => (
            <View key={h.title} style={styles.row}>
              <View style={[styles.badge, { backgroundColor: h.color + '26' }]}>
                <Text style={[styles.badgeIcon, { color: h.color }]}>{h.icon}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{h.title}</Text>
                <Text style={styles.rowDetail}>{h.detail}</Text>
              </View>
            </View>
          ))}
          <Pressable style={styles.button} onPress={onDone}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: { width: '100%', maxWidth: 380 },
  heading: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { fontSize: 22, fontWeight: '800' },
  rowText: { marginLeft: 14, flex: 1 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowDetail: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
