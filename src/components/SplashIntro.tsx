import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Haptics from 'expo-haptics';

/**
 * Animated launch intro — "Save My Movie" clapperboard.
 *
 * Spec: docs/splash-spec-save-my-movie.md (v2, 2026-11-08).
 * Built-in `Animated` only — no reanimated, no other animation library.
 *
 * The Watchlist deck is mounted beneath this view from t = 0, fully
 * opaque. Only the intro fades — never a crossfade over the deck.
 *
 * Frame 1 is the static splash PNG itself (contain, black background),
 * so the handoff from the native splash has no flash or jump: the native
 * splash IS this image. At the clap onset (t = 0.40 s) the PNG hides and
 * the layered views beneath take over — the swap is hidden by the
 * motion starting. Layer geometry is the spec's static geometry, scaled
 * from the 1152 x 2048 image with the same contain-fit math, so the
 * layered frame matches the PNG.
 *
 * Timeline (total ~1.53 s, hard ceiling 2.0 s — never waits for data):
 *   0.00-0.40  open hold (400 ms), nothing moves
 *   0.40-0.55  clap (150 ms): stick -30 deg -> 0 deg, Easing.in, hard stop
 *   0.55       impact: board punch 1 -> 1.015 (50 ms) -> 1.0 (150 ms,
 *              Easing.out); text + underline fade out over 80 ms
 *   0.55-0.63  closed hold (80 ms)
 *   0.63-1.33  zoom (700 ms, Easing.in): M 1 -> 3.5x, board (+ stick)
 *              1 -> 1.5x, both anchored on the M centre (50.0% width,
 *              55.8% height of the static image)
 *   1.33-1.53  reveal (200 ms, linear): whole intro opacity 1 -> 0,
 *              then unmounts. No crossfade, no ghosting.
 */

const IMAGE_W = 1152;
const IMAGE_H = 2048;

// Static-geometry numbers from the spec (image px, 1152 x 2048).
const BOARD = { x: 196, y: 780, w: 760, h: 640 };
const STRIP_H = 86;
const M_BOX = { x: 326, y: 925, w: 500, h: 435 };
const M_CENTRE = { x: 576, y: 1143 };
const TEXT_TOP = 1500;
const UNDERLINE_TOP = 1630;

const OPEN_HOLD_MS = 400;
const CLAP_MS = 150;
const IMPACT_MS = 550;
const PUNCH_OUT_MS = 50;
const PUNCH_BACK_MS = 150;
const TEXT_FADE_MS = 80;
const CLOSED_HOLD_MS = 80;
const ZOOM_START_MS = IMPACT_MS + CLOSED_HOLD_MS; // 630
const ZOOM_MS = 700;
const REVEAL_START_MS = ZOOM_START_MS + ZOOM_MS; // 1330
const REVEAL_MS = 200;
const HARD_CEILING_MS = 2000;

const RIVETS = [
  { x: 226, y: 896 },
  { x: 926, y: 896 },
  { x: 226, y: 1390 },
  { x: 926, y: 1390 },
];

export default function SplashIntro({ onDone }: { onDone: () => void }) {
  const { width: screenW, height: screenH } = useWindowDimensions();

  // Contain-fit of the 1152 x 2048 static image on this screen — the
  // same math the native splash uses, so layered geometry lands exactly
  // where the PNG shows it.
  const s = Math.min(screenW / IMAGE_W, screenH / IMAGE_H);
  const ox = (screenW - IMAGE_W * s) / 2;
  const oy = (screenH - IMAGE_H * s) / 2;
  const px = (n: number) => n * s;
  const X = (n: number) => ox + n * s;
  const Y = (n: number) => oy + n * s;

  // Animated values, created once via lazy state initialisers (stable
  // across renders, no ref access during render).
  const [stickRot] = useState(() => new Animated.Value(0));
  const [punch] = useState(() => new Animated.Value(1));
  const [textOpacity] = useState(() => new Animated.Value(1));
  const [boardZoom] = useState(() => new Animated.Value(1));
  const [mZoom] = useState(() => new Animated.Value(1));
  const [introOpacity] = useState(() => new Animated.Value(1));
  const [pngOpacity] = useState(() => new Animated.Value(1));
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    // Hide the native splash once the intro has mounted and frame 1
    // (the PNG, identical to the native splash) is on screen.
    void SplashScreen.hideAsync().catch(() => {});

    const animation = Animated.parallel([
      // Frame-1 PNG hides at the clap onset; the layered views beneath
      // take over. The swap is hidden by the motion starting.
      Animated.sequence([
        Animated.delay(OPEN_HOLD_MS),
        Animated.timing(pngOpacity, { toValue: 0, duration: 1, useNativeDriver: true }),
      ]),
      // Clap: stick snaps shut, accelerating into the hit, hard stop.
      Animated.sequence([
        Animated.delay(OPEN_HOLD_MS),
        Animated.timing(stickRot, {
          toValue: 1,
          duration: CLAP_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // Impact punch: 1 -> 1.015 in 50 ms, back to 1.0 over 150 ms.
      Animated.sequence([
        Animated.delay(IMPACT_MS),
        Animated.timing(punch, {
          toValue: 1.015,
          duration: PUNCH_OUT_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(punch, {
          toValue: 1,
          duration: PUNCH_BACK_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      // Text + underline fade out at impact, gone before the zoom starts.
      Animated.sequence([
        Animated.delay(IMPACT_MS),
        Animated.timing(textOpacity, {
          toValue: 0,
          duration: TEXT_FADE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
      // Zoom, anchored on the M centre: M 3.5x, board (+ stick) 1.5x.
      Animated.sequence([
        Animated.delay(ZOOM_START_MS),
        Animated.parallel([
          Animated.timing(boardZoom, {
            toValue: 1.5,
            duration: ZOOM_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(mZoom, {
            toValue: 3.5,
            duration: ZOOM_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Reveal: the intro alone fades out; the deck is already beneath.
      Animated.sequence([
        Animated.delay(REVEAL_START_MS),
        Animated.timing(introOpacity, {
          toValue: 0,
          duration: REVEAL_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    ]);
    animation.start(({ finished }) => {
      if (finished) finish();
    });

    // Light impact haptic at the clap. Fire-and-forget — it never
    // delays the animation. (expo-haptics is already a dependency.)
    timersRef.current.push(
      setTimeout(() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }, IMPACT_MS),
    );
    // Hard ceiling: unmount by 2.0 s even if anything above stalls.
    // The intro never waits for fonts or data.
    timersRef.current.push(setTimeout(finish, HARD_CEILING_MS));

    return () => {
      animation.stop();
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stick rotation about the hinge (board-local hinge x 14 px, stick
  // centre x 380 px): translate so the hinge is the rotation origin,
  // rotate, translate back. The stick is a child of the board, so the
  // board's punch + zoom (about the M centre) carry it automatically;
  // the rotation only runs while the zoom is 1, and the zoom only runs
  // once the rotation is 0, so the two never fight.
  const stickTransform = [
    { translateX: px(14 - 380) },
    {
      rotate: stickRot.interpolate({
        inputRange: [0, 1],
        outputRange: ['-30deg', '0deg'],
      }),
    },
    { translateX: px(380 - 14) },
  ];

  // Board punch + zoom, both anchored on the M centre. Board centre is
  // (576, 1100); M centre is (576, 1143) — 43 px below it.
  const boardTransform = [
    { translateY: px(M_CENTRE.y - (BOARD.y + BOARD.h / 2)) },
    { scale: punch },
    { scale: boardZoom },
    { translateY: -px(M_CENTRE.y - (BOARD.y + BOARD.h / 2)) },
  ];

  return (
    <Animated.View
      style={[styles.root, { opacity: introOpacity }]}
      pointerEvents="auto"
    >
      {/* Layered views (frame 1 underneath the PNG until the clap). */}
      <Animated.View
        style={[
          styles.board,
          {
            left: X(BOARD.x),
            top: Y(BOARD.y),
            width: px(BOARD.w),
            height: px(BOARD.h),
            borderRadius: px(20),
            borderWidth: px(3),
            transform: boardTransform,
          },
        ]}
      >
        {/* Board top strip — same stripe bar as the stick, same x-range
            and phase, so the closed stick covers it exactly (one band). */}
        <View
          style={[
            styles.strip,
            {
              width: px(BOARD.w),
              height: px(STRIP_H),
              borderTopLeftRadius: px(17),
              borderTopRightRadius: px(17),
              borderBottomWidth: px(3),
            },
          ]}
        >
          <Image
            source={require('../../assets/splash-stripes.png')}
            style={{ width: px(BOARD.w), height: px(STRIP_H) }}
            resizeMode="stretch"
          />
        </View>

        {/* Corner rivets. */}
        {RIVETS.map((r) => (
          <View
            key={`${r.x}-${r.y}`}
            style={[
              styles.rivet,
              {
                left: px(r.x - BOARD.x - 9),
                top: px(r.y - BOARD.y - 9),
                width: px(18),
                height: px(18),
                borderRadius: px(9),
                borderWidth: px(2),
              },
            ]}
          />
        ))}

        {/* Stick (clapper), hinged at the board's top-left corner. */}
        <Animated.View
          style={[
            styles.stick,
            {
              width: px(BOARD.w),
              height: px(STRIP_H),
              borderRadius: px(10),
              transform: stickTransform,
            },
          ]}
        >
          <Image
            source={require('../../assets/splash-stripes.png')}
            style={{ width: px(BOARD.w), height: px(STRIP_H) }}
            resizeMode="stretch"
          />
          {/* Hinge bolt — on the pivot, so it stays put under rotation. */}
          <View
            style={[
              styles.bolt,
              {
                left: 0,
                top: px(29),
                width: px(28),
                height: px(28),
                borderRadius: px(14),
                borderWidth: px(2),
              },
            ]}
          >
            <View
              style={{
                width: px(12),
                height: px(12),
                borderRadius: px(6),
                backgroundColor: '#96969E',
              }}
            />
          </View>
        </Animated.View>
      </Animated.View>

      {/* The M alone — fast zoom, about its own centre (= M centre). */}
      <Animated.View
        style={[
          styles.m,
          {
            left: X(M_BOX.x),
            top: Y(M_BOX.y),
            width: px(M_BOX.w),
            height: px(M_BOX.h),
            transform: [{ scale: punch }, { scale: mZoom }],
          },
        ]}
      >
        <Image
          source={require('../../assets/splash-m.png')}
          style={{ width: px(M_BOX.w), height: px(M_BOX.h) }}
          resizeMode="stretch"
        />
      </Animated.View>

      {/* "Save My Movie" + amber underline — fades out at impact,
          never scales, never crops. */}
      <Animated.View
        style={[
          styles.textWrap,
          {
            left: ox,
            top: Y(TEXT_TOP),
            width: px(IMAGE_W),
            opacity: textOpacity,
          },
        ]}
      >
        <Text
          style={[
            styles.text,
            { fontSize: px(96), letterSpacing: px(3), lineHeight: px(115) },
          ]}
        >
          Save My Movie
        </Text>
        <View
          style={[
            styles.underline,
            {
              width: px(140),
              height: px(9),
              borderRadius: px(4.5),
              marginTop: px(UNDERLINE_TOP - TEXT_TOP - 115),
            },
          ]}
        />
      </Animated.View>

      {/* Frame 1: the static splash PNG itself — the native splash
          hands off to this identical frame with no flash or jump. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: pngOpacity }]}>
        <Image
          source={require('../../assets/splash.png')}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 999,
    elevation: 999,
  },
  board: {
    position: 'absolute',
    backgroundColor: '#1E1E21',
    borderColor: '#3A3A40',
    overflow: 'visible',
  },
  strip: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    borderBottomColor: '#3A3A40',
  },
  rivet: {
    position: 'absolute',
    backgroundColor: '#4A4A50',
    borderColor: '#66666E',
  },
  stick: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  bolt: {
    position: 'absolute',
    backgroundColor: '#28282C',
    borderColor: '#787880',
    alignItems: 'center',
    justifyContent: 'center',
  },
  m: {
    position: 'absolute',
  },
  textWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  underline: {
    backgroundColor: '#F5A623',
  },
});
