import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface MovieProgressBarProps {
  indeterminate?: boolean;
  progress?: number;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const TRACK = '#000000';
const OUTLINE = '#FFFFFF';
const STRIP = '#FFFFFF';
const PERFORATION = '#000000';
const FRAME = '#000000';
const DIVIDER = '#FFFFFF';
const TITLE = '#FF3B30';

const HEIGHTS: Record<NonNullable<MovieProgressBarProps['size']>, number> = {
  small: 24,
  medium: 44,
  large: 64,
};

const PERFORATION_COUNT = 20;
const FRAME_COUNT = 5;
const TITLE_TEXT = 'Movie Deck';
const LOOP_MS = 1800;

/**
 * Inverted film-strip loader for black backgrounds. A white film strip
 * (black perforation rows top/bottom, large black frames with thin white
 * dividers in the middle) is revealed left-to-right behind the red
 * "Movie Deck" title, which wipes in with the same progress.
 * Forward-only: the wipe runs 0→100% then restarts at 0, never reversing.
 * The wipe is a black cover shrinking from the right edge, so the strip and
 * title stay full-size the whole time — nothing stretches. Zero deps,
 * native driver (transform only) on a real Animated.View.
 */
export default function MovieProgressBar({
  indeterminate = true,
  progress,
  size = 'medium',
  style,
}: MovieProgressBarProps) {
  const height = HEIGHTS[size];
  const [trackWidth, setTrackWidth] = useState(0);
  // Lazy-init (not refs): the render body interpolates these, which the
  // react-hooks/refs rule forbids on refs.
  const [wipe] = useState(
    () =>
      new Animated.Value(
        indeterminate
          ? 0
          : typeof progress === 'number'
            ? Math.min(1, Math.max(0, progress))
            : 0
      )
  );

  useEffect(() => {
    if (indeterminate) {
      wipe.setValue(0);
      const loop = Animated.loop(
        Animated.timing(wipe, {
          toValue: 1,
          duration: LOOP_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    }
    wipe.setValue(
      typeof progress === 'number' ? Math.min(1, Math.max(0, progress)) : 0
    );
    return undefined;
  }, [indeterminate, progress, wipe]);

  // Black cover over the not-yet-filled region: full cover at 0, collapsed
  // to the right edge at 1. Right-anchored via translate-then-scale so the
  // wipe edge travels left→right and never reverses.
  const coverScale = wipe.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const coverTX = wipe.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth / 2],
  });

  const band = Math.max(4, Math.round(height * 0.3));
  const dot = Math.max(2, band * 0.55);
  const fontSize = Math.max(7, Math.round(height * 0.55));
  // Wide letter-spacing so the title stretches across the full bar length.
  const letterSpacing =
    trackWidth > 0
      ? Math.max(
          2,
          (trackWidth - 10 - TITLE_TEXT.length * 0.62 * fontSize) /
            (TITLE_TEXT.length - 1)
        )
      : 2;

  return (
    <View
      style={[styles.outer, style]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <View style={[styles.track, { height, borderRadius: 16 }]}>
        {/* White film strip: black perforation rows top/bottom, large black
            frames separated by thin white dividers in the middle. */}
        <View style={[StyleSheet.absoluteFill, styles.strip]}>
          <View style={[styles.perfRow, { top: (band - dot) / 2 }]}>
            {Array.from({ length: PERFORATION_COUNT }, (_, i) => (
              <View
                key={`t${i}`}
                style={[styles.perf, { width: dot, height: dot }]}
              />
            ))}
          </View>
          <View style={[styles.frames, { top: band, bottom: band }]}>
            {Array.from({ length: FRAME_COUNT }, (_, i) => (
              <React.Fragment key={`f${i}`}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.frame} />
              </React.Fragment>
            ))}
          </View>
          <View style={[styles.perfRow, { bottom: (band - dot) / 2 }]}>
            {Array.from({ length: PERFORATION_COUNT }, (_, i) => (
              <View
                key={`b${i}`}
                style={[styles.perf, { width: dot, height: dot }]}
              />
            ))}
          </View>
        </View>
        {/* Red title, revealed left→right by the wipe. */}
        <View style={[StyleSheet.absoluteFill, styles.titleWrap]}>
          <Text
            style={[styles.title, { fontSize, letterSpacing }]}
            numberOfLines={1}
          >
            {TITLE_TEXT}
          </Text>
        </View>
        {/* Black cover: the wipe itself. */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.cover,
            { transform: [{ translateX: coverTX }, { scaleX: coverScale }] },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { width: '100%' },
  track: {
    width: '100%',
    backgroundColor: TRACK,
    borderColor: OUTLINE,
    borderWidth: 1,
    overflow: 'hidden',
  },
  strip: {
    backgroundColor: STRIP,
  },
  perfRow: {
    position: 'absolute',
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  perf: { backgroundColor: PERFORATION },
  frames: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: FRAME,
  },
  frame: { flex: 1 },
  divider: { width: 2, backgroundColor: DIVIDER },
  titleWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: TITLE,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cover: {
    backgroundColor: TRACK,
  },
});
