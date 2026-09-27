import React from 'react';
import { View, StyleProp, ViewStyle, StyleSheet } from 'react-native';

/**
 * Drawn clapboard placeholder for titles we couldn't validate (needsReview).
 * Pure Views — no emoji, no new dependencies. Everything inside is
 * percentage-based, so it scales with whatever `style` it is given, from a
 * 44x66 list thumb up to a full-bleed poster.
 */
const STRIPES = 9;

export default function ClapboardPoster({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.board, style]}>
      <View style={styles.stickZone}>
        <View style={styles.stick}>
          {Array.from({ length: STRIPES }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.stripe,
                { backgroundColor: i % 2 === 0 ? '#f2f2f5' : '#0c0c0e' },
              ]}
            />
          ))}
        </View>
        <View style={styles.hinge} />
      </View>
      <View style={styles.body}>
        <View style={styles.frame}>
          <View style={[styles.chalk, styles.chalkTitle]} />
          <View style={styles.chalkRow}>
            <View style={[styles.chalk, styles.chalkShort]} />
            <View style={[styles.chalk, styles.chalkShort]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: { backgroundColor: '#17171a', overflow: 'hidden' },
  stickZone: { height: '16%', justifyContent: 'flex-end' },
  stick: {
    flexDirection: 'row',
    height: '72%',
    width: '112%',
    marginLeft: '-4%',
    transform: [{ rotate: '-7deg' }],
    backgroundColor: '#0c0c0e',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  stripe: { flex: 1, transform: [{ skewX: '-24deg' }], marginHorizontal: -0.5 },
  hinge: {
    position: 'absolute',
    left: '6%',
    bottom: '8%',
    width: '7%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#3a3a3f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  body: { flex: 1, backgroundColor: '#1c1c1f', padding: '7%' },
  frame: {
    flex: 1,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 4,
    padding: '10%',
    justifyContent: 'center',
  },
  chalk: {
    height: '13%',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  chalkTitle: { width: '85%' },
  chalkRow: { flexDirection: 'row', marginTop: '16%' },
  chalkShort: { flex: 1, marginRight: '12%' },
});
