import { StyleSheet, View, ViewStyle } from 'react-native';

/**
 * Thin (3pt) determinate stage progress bar in amber: the fill width is
 * the reported fraction of the fetch so far (direct width, no animation).
 * No percentage number is shown next to it — the fraction is a stage
 * estimate, not a promise of how much time is left.
 */
export default function StageProgressBar({
  progress,
  style,
}: {
  /** 0–1 fraction of the fetch so far; clamped to 0..1. */
  progress: number;
  style?: ViewStyle;
}) {
  const fraction = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ff9f0a',
  },
});
