import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

interface MovieProgressBarProps {
  indeterminate?: boolean;
  progress?: number;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const TRACK = '#1C1C1E';
const BORDER = '#38383A';
const SPROCKET = '#48484A';
const FILL = '#FF9F0A';
const HIGHLIGHT = '#FFD60A';

const HEIGHTS: Record<NonNullable<MovieProgressBarProps['size']>, number> = {
  small: 10,
  medium: 14,
  large: 20,
};

const DOT_COUNT = 16;

/** Film-strip progress bar for black backgrounds. Zero deps, native driver. */
export default function MovieProgressBar({
  indeterminate = true,
  progress,
  size = 'medium',
  style,
}: MovieProgressBarProps) {
  const height = HEIGHTS[size];
  const dotSize = Math.max(2, height * 0.18);
  const [trackWidth, setTrackWidth] = useState(0);
  // Lazy-init (not refs): the render body interpolates these, which the
  // react-hooks/refs rule forbids on refs.
  const [slide] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!indeterminate || trackWidth <= 0) return;
    slide.setValue(0);
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    blink.start();
    return () => {
      loop.stop();
      blink.stop();
    };
  }, [indeterminate, trackWidth, slide, pulse]);

  const highlightW = Math.max(56, trackWidth * 0.35);
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-highlightW, trackWidth],
  });
  const clamped = typeof progress === 'number' ? Math.min(1, Math.max(0, progress)) : 0;

  return (
    <View
      style={[styles.outer, style]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        {!indeterminate && (
          <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
        )}
        {indeterminate && trackWidth > 0 && (
          <Animated.View
            style={[
              styles.highlight,
              { width: highlightW, opacity: pulse, transform: [{ translateX }] },
            ]}
          />
        )}
        <View style={[styles.sprocketRow, { top: 2 }]}>
          {Array.from({ length: DOT_COUNT }, (_, i) => (
            <View key={`t${i}`} style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
          ))}
        </View>
        <View style={[styles.sprocketRow, { bottom: 2 }]}>
          {Array.from({ length: DOT_COUNT }, (_, i) => (
            <View key={`b${i}`} style={[styles.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { width: '100%' },
  track: {
    width: '100%',
    backgroundColor: TRACK,
    borderColor: BORDER,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: FILL },
  highlight: { height: '100%', backgroundColor: HIGHLIGHT, borderRadius: 999 },
  sprocketRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dot: { backgroundColor: SPROCKET },
});
