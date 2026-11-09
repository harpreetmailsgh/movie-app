import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

const BAR_WIDTH = 56;
const DURATION_MS = 1100;

/**
 * Thin (3pt) indeterminate progress bar in amber: a short bar slides
 * across a track and loops while mounted. Indeterminate, never a fake
 * percentage — fetch length is unpredictable (Gemini can take ~99s), so
 * no fraction of the work can be honestly shown. Animation uses only
 * `transform` with the native driver, driving a real Animated.View.
 */
export default function IndeterminateBar({ style }: { style?: ViewStyle }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: DURATION_MS, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAR_WIDTH, Math.max(trackWidth, BAR_WIDTH)],
  });
  return (
    <View
      style={[styles.track, style]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.bar, { transform: [{ translateX }] }]} />
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
  bar: {
    width: BAR_WIDTH,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ff9f0a',
  },
});
