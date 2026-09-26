import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { ALL_GENRES } from '../lib/genres';

export interface FilterValues {
  type: string | null;
  genre: string[];
  language: string[];
  year: string | null;
  rating: string | null;
}

export const EMPTY_FILTERS: FilterValues = { type: null, genre: [], language: [], year: null, rating: null };

/** Top 10 languages of the world by total speakers. */
const LANGUAGES = [
  'English', 'Mandarin Chinese', 'Hindi', 'Spanish', 'French',
  'Arabic', 'Bengali', 'Portuguese', 'Russian', 'Indonesian',
];

const YEARS = ['2020s', '2010s', '2000s', '1990s', '1980s', 'Before 1980'];
const RATINGS = ['9+', '8+', '7+', '6+'];

interface SheetDef {
  key: keyof FilterValues;
  title: string;
  multi: boolean;
  options: string[];
}

const SHEETS: SheetDef[] = [
  { key: 'type', title: 'Type', multi: false, options: ['Movies', 'Series'] },
  { key: 'genre', title: 'Genre', multi: true, options: ALL_GENRES },
  { key: 'language', title: 'Language', multi: true, options: LANGUAGES },
  { key: 'year', title: 'Year', multi: false, options: YEARS },
  { key: 'rating', title: 'IMDb rating', multi: false, options: RATINGS },
];

export function yearMatches(year: number, bucket: string): boolean {
  if (year <= 0) return false;
  switch (bucket) {
    case '2020s': return year >= 2020;
    case '2010s': return year >= 2010 && year < 2020;
    case '2000s': return year >= 2000 && year < 2010;
    case '1990s': return year >= 1990 && year < 2000;
    case '1980s': return year >= 1980 && year < 1990;
    case 'Before 1980': return year < 1980;
    default: return true;
  }
}

export function ratingMatches(imdbRating: number, min: string): boolean {
  return imdbRating >= parseInt(min, 10);
}

export function filtersActive(v: FilterValues): boolean {
  return (
    v.type !== null ||
    v.genre.length > 0 ||
    v.language.length > 0 ||
    v.year !== null ||
    v.rating !== null
  );
}

function pillLabel(def: SheetDef, values: FilterValues): string {
  const v = values[def.key];
  if (def.multi) {
    const arr = v as string[];
    return arr.length > 0 ? `${def.title} · ${arr.length}` : def.title;
  }
  return (v as string | null) ?? def.title;
}

export default function FilterBar({
  values,
  onChange,
}: {
  values: FilterValues;
  onChange: (v: FilterValues) => void;
}) {
  const [openKey, setOpenKey] = useState<keyof FilterValues | null>(null);
  const openDef = SHEETS.find((s) => s.key === openKey) ?? null;

  const toggle = (def: SheetDef, option: string) => {
    if (def.multi) {
      const arr = values[def.key] as string[];
      const next = arr.includes(option) ? arr.filter((x) => x !== option) : [...arr, option];
      onChange({ ...values, [def.key]: next });
    } else {
      onChange({ ...values, [def.key]: values[def.key] === option ? null : option });
      setOpenKey(null);
    }
  };

  const clearSheet = (def: SheetDef) => {
    onChange({ ...values, [def.key]: def.multi ? [] : null });
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bar}
        contentContainerStyle={styles.barContent}
      >
        {SHEETS.map((def) => {
          const active = def.multi
            ? (values[def.key] as string[]).length > 0
            : values[def.key] !== null;
          return (
            <Pressable
              key={def.key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => setOpenKey(def.key)}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {pillLabel(def, values)} ▾
              </Text>
            </Pressable>
          );
        })}
        {filtersActive(values) && (
          <Pressable style={styles.clearPill} onPress={() => onChange(EMPTY_FILTERS)}>
            <Text style={styles.clearPillText}>✕ Clear</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={openDef !== null} transparent animationType="slide">
        <View style={styles.backdrop}>
          <Pressable style={styles.dismiss} onPress={() => setOpenKey(null)} />
          {openDef && (
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{openDef.title}</Text>
                <Pressable onPress={() => clearSheet(openDef)} hitSlop={8}>
                  <Text style={styles.sheetClear}>Clear</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.options}>
                {openDef.options.map((opt) => {
                  const selected = openDef.multi
                    ? (values[openDef.key] as string[]).includes(opt)
                    : values[openDef.key] === opt;
                  return (
                    <Pressable
                      key={opt}
                      style={styles.option}
                      onPress={() => toggle(openDef, opt)}
                    >
                      <Text style={[styles.check, selected && styles.checkOn]}>
                        {selected ? '☑' : '☐'}
                      </Text>
                      <Text style={[styles.optionText, selected && styles.optionTextOn]}>
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable style={styles.doneBtn} onPress={() => setOpenKey(null)}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { maxHeight: 52, flexGrow: 0, marginTop: 8 },
  barContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  pill: {
    backgroundColor: '#1c1c1e',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pillActive: { backgroundColor: '#fff' },
  pillText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: '#000' },
  clearPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  clearPillText: { color: '#ff9f0a', fontSize: 13, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 28,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sheetClear: { color: '#ff9f0a', fontSize: 14, fontWeight: '700' },
  options: { paddingHorizontal: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  check: { color: 'rgba(255,255,255,0.4)', fontSize: 20, width: 34 },
  checkOn: { color: '#30d158' },
  optionText: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  optionTextOn: { color: '#fff', fontWeight: '700' },
  doneBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
  },
  doneBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
