import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type GuideDir = 'up' | 'down' | 'left' | 'right';

export interface GuideMark {
  dir: GuideDir;
  label: string;
  /** Bubble background color (per-mark accent, e.g. iOS system palette). */
  color: string;
}

interface GuideOverlayProps {
  marks: GuideMark[];
  /**
   * Fired after the fade-out completes — the parent flips its guide-seen
   * flag here, which unmounts the overlay for good.
   */
  onDismiss: () => void;
  /**
   * Adds a neutral (non-swipe) hint near the top of the overlay, pointing
   * upward toward the header view icons: "Tap to switch views".
   */
  showViewHint: boolean;
}

export interface GuideOverlayHandle {
  /** Starts the fade-out, then fires onDismiss. Safe to call repeatedly. */
  dismiss: () => void;
}

const ICONS = {
  up: 'arrow-up',
  down: 'arrow-down',
  left: 'arrow-back',
  right: 'arrow-forward',
} as const;

const POSITION: Record<GuideDir, object> = {
  up: { top: 10, left: '50%', marginLeft: -28 },
  down: { bottom: 10, left: '50%', marginLeft: -28 },
  left: { left: 10, top: '50%', marginTop: -38 },
  right: { right: 10, top: '50%', marginTop: -38 },
};

// Neutral grey — the view hint is a tap action, not a swipe gesture.
const VIEW_HINT_COLOR = '#8e8e93';
const VIEW_HINT_LABEL = 'Tap to switch views';

/**
 * First-time guide coach-mark arrows floating over a card deck: fades in
 * on mount, loops a gentle bob on each mark (transform + opacity only,
 * native driver), stays pointer-transparent so swipes pass through. The
 * parent detects the first swipe and calls dismiss(); the overlay fades
 * out and fires onDismiss — never unmounting mid-animation (iOS blanks
 * the deck when native layers re-sort mid-fade).
 */
const GuideOverlay = forwardRef<GuideOverlayHandle, GuideOverlayProps>(function GuideOverlay(
  { marks, onDismiss, showViewHint },
  ref
) {
  const [guideOpacity] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const dismissing = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Fade the arrows in and start the looping bob. No setState here —
  // visibility is derived from the parent's guide flag.
  useEffect(() => {
    guideOpacity.setValue(0);
    Animated.timing(guideOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [guideOpacity, bob]);

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Animated.timing(guideOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
      .start(() => onDismissRef.current());
  }, [guideOpacity]);

  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  // Each mark bobs along its own axis (up/left toward −8, down/right toward +8).
  const bobTransform = (dir: GuideDir) => {
    const v = bob.interpolate({
      inputRange: [0, 1],
      outputRange: [0, dir === 'up' || dir === 'left' ? -8 : 8],
    });
    return dir === 'up' || dir === 'down'
      ? { transform: [{ translateY: v }] }
      : { transform: [{ translateX: v }] };
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: guideOpacity }]} pointerEvents="none">
      {marks.map((m, i) => (
        <Animated.View
          key={`${m.dir}-${i}`}
          style={[styles.mark, POSITION[m.dir], bobTransform(m.dir)]}
        >
          <View style={[styles.bubble, { backgroundColor: m.color }]}>
            <Ionicons name={ICONS[m.dir]} size={22} color="#fff" />
          </View>
          <Text style={styles.label}>{m.label}</Text>
        </Animated.View>
      ))}
      {showViewHint && (
        <Animated.View style={[styles.mark, styles.viewHint, bobTransform('up')]}>
          <View style={[styles.bubble, { backgroundColor: VIEW_HINT_COLOR }]}>
            <Ionicons name="hand-left" size={22} color="#fff" />
          </View>
          <Text style={[styles.label, styles.hintLabel]}>{VIEW_HINT_LABEL}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
});

export default GuideOverlay;

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 20 },
  mark: { position: 'absolute', alignItems: 'center', gap: 6 },
  // Near the top, right of center — pointing up toward the header's
  // view-switch icons.
  viewHint: { top: 8, right: 24 },
  bubble: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    color: '#fff', fontSize: 13, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  hintLabel: { maxWidth: 110, textAlign: 'center' },
});
