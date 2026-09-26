import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * The shared "gulp" animation: a quick scale pop (delay 300ms, spring to
 * 1.3 with friction 4, spring back to 1 with friction 6). The trash bin and
 * the linger icon both use this exact sequence, each on its own timeline —
 * so a re-trigger mid-gulp restarts cleanly without touching the other.
 *
 * Returns a play function: play(scale, onDone) resets the scale, stops any
 * in-flight gulp on this timeline, and runs the sequence. onDone fires only
 * if the sequence finishes uninterrupted.
 */
export function useGulp() {
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const play = useCallback((scale: Animated.Value, onDone?: () => void) => {
    scale.setValue(1);
    animRef.current?.stop();
    const seq = Animated.sequence([
      Animated.delay(300),
      Animated.spring(scale, { toValue: 1.3, friction: 4, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]);
    animRef.current = seq;
    seq.start(({ finished }) => {
      if (finished) onDone?.();
    });
  }, []);
  return play;
}
