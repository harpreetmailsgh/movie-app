import React from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { SwipeDir, Stamp } from './deckMath';

/** The raw direction icon (no pill). Used by the tap-hint pills for icon-only directions. */
export function DirectionIcon({ dir, stamp, size }: { dir: SwipeDir; stamp: Stamp; size: number }) {
  const color = stamp.textColor;
  switch (stamp.dragIcon) {
    case 'eye':
      return <Ionicons name="eye" size={size} color={color} />;
    case 'trash':
      return <Ionicons name="trash" size={size} color={color} />;
    case 'add':
      return <Ionicons name="add" size={size + 2} color={color} />;
    case 'hide':
      return <Ionicons name="eye-off" size={size} color={color} />;
    case 'next': {
      // Directional: the chevrons point the way the finger is moving.
      const name = dir === 'right' ? 'chevron-forward' : 'chevron-back';
      return (
        <View style={styles.nextIconWrap}>
          <Ionicons name={name} size={size} color={color} />
          <Ionicons name={name} size={size} color={color} style={{ marginLeft: -size * 0.55 }} />
        </View>
      );
    }
    default:
      return <Text style={[styles.stampText, { color }]}>{stamp.text}</Text>;
  }
}

/**
 * Fancy icon pill: glossy gradient, bright rim, and a neon glow in the
 * direction's color. Used for the drag icon and the linger icon.
 * Pass `small` for the 64px linger size (matches the trash bin); default is
 * the large drag size.
 */
export function DirectionPill({
  dir,
  stamp,
  small,
}: {
  dir: SwipeDir;
  stamp: Stamp;
  small?: boolean;
}) {
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.24)']}
      style={[
        styles.pill,
        {
          backgroundColor: stamp.color,
          borderColor: 'rgba(255,255,255,0.55)',
          shadowColor: stamp.color,
          padding: small ? 17 : 28,
        },
      ]}
    >
      <DirectionIcon dir={dir} stamp={stamp} size={small ? 30 : 52} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    padding: 28,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    // Neon glow in the direction's color (shadowColor set inline).
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 18,
    elevation: 12,
  },
  stampText: { fontSize: 18, fontWeight: '800' },
  nextIconWrap: { flexDirection: 'row', alignItems: 'center' },
});
