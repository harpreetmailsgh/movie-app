import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ViewMode } from '../lib/types';

const MODES: { id: ViewMode; icon: 'albums' | 'grid' | 'list'; label: string }[] = [
  { id: 'cards', icon: 'albums', label: 'Cards view' },
  { id: 'tiles', icon: 'grid', label: 'Tiles view' },
  { id: 'list', icon: 'list', label: 'List view' },
];

/** Slim header row: screen title on the left, compact view icons on the right. */
export default function ViewHeader({
  title,
  value,
  onChange,
  showBack = false,
  onBack,
}: {
  title: string;
  value: ViewMode;
  onChange: (m: ViewMode) => void;
  /** Show a back chevron before the title (e.g. after a tile/row jump into cards). */
  showBack?: boolean;
  onBack?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {showBack && onBack && (
          <Pressable
            accessibilityLabel="Back"
            hitSlop={10}
            style={styles.backBtn}
            onPress={onBack}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.icons}>
        {MODES.map((m) => {
          const active = value === m.id;
          return (
            <Pressable
              key={m.id}
              accessibilityLabel={m.label}
              hitSlop={10}
              style={styles.btn}
              onPress={() => onChange(m.id)}
            >
              <Ionicons name={m.icon} size={22} color={active ? '#fff' : '#48484a'} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  left: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  backBtn: { paddingVertical: 8, paddingRight: 8 },
  icons: { flexDirection: 'row', alignItems: 'center' },
  btn: { padding: 8 },
});
