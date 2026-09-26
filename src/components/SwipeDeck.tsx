import React, { useRef, useState } from 'react';
import { Animated, PanResponder, Dimensions, View, Text, StyleSheet, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Movie, CardAnimation, DeckStyle } from '../lib/types';
import MovieCard from './MovieCard';
import {
  swipeDir,
  softSwipeDir,
  offscreenTarget,
  DECKS,
  THRESHOLD,
  PEEL_FULL,
  HINT_FADE,
  type SwipeDir,
  type Stamp,
} from './deck/deckMath';
import { DirectionPill, DirectionIcon } from './deck/DirectionPill';
import { useGulp } from './deck/useGulp';

export type { SwipeDir };
export { CardAnimation, DeckStyle };

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
export const CARD_W = Math.min(SCREEN_W - 32, 420);
export const CARD_H = Math.min(SCREEN_H * 0.6, 620);

const STAMPS: Record<SwipeDir, Stamp> = {
  left: { text: 'Next', color: '#ff9f0a', textColor: '#fff', dragIcon: 'next' },
  right: { text: 'Next', color: '#ff9f0a', textColor: '#fff', dragIcon: 'next' },
  up: { text: 'Seen it', color: '#0a84ff', textColor: '#fff', dragIcon: 'eye' },
  down: { text: 'Delete', color: '#ff453a', textColor: '#fff', dragIcon: 'trash' },
};

// Edge positions for the tap-hint pills (shown on touch-down, before any drag).
const HINT_POS: Record<SwipeDir, object> = {
  left: { left: 14, top: CARD_H / 2 - 18 },
  right: { right: 14, top: CARD_H / 2 - 18 },
  up: { top: 14, left: 0, right: 0, alignItems: 'center' },
  down: { bottom: 14, left: 0, right: 0, alignItems: 'center' },
};

const ALL_DIRS: SwipeDir[] = ['left', 'right', 'up', 'down'];

interface Props {
  cards: Movie[];
  onSwipe: (dir: SwipeDir, movie: Movie) => void;
  onInfoTap?: (movie: Movie) => void;
  animation: CardAnimation;
  deckStyle: DeckStyle;
  /** Override stamp text/colors per direction (e.g. Trending's "＋ Watchlist"). */
  stampOverrides?: Partial<Record<SwipeDir, Stamp>>;
  /** Directions that are live on this deck. Disabled ones show no hints and snap back. */
  enabledDirs?: SwipeDir[];
  /** Mail-style trash: on swipe-down the card dives into a trash bin instead of flying off. */
  trashBin?: boolean;
  /** Directions where the card tucks behind the deck ("send to back") instead
   *  of flying off-screen. Watchlist passes left+right (Next); Trending
   *  passes left only (right saves to Watchlist and leaves the feed). */
  toBackDirs?: SwipeDir[];
}

export default function SwipeDeck({ cards, onSwipe, onInfoTap, animation, deckStyle, stampOverrides, enabledDirs, trashBin, toBackDirs }: Props) {
  const stamps: Record<SwipeDir, Stamp> = { ...STAMPS, ...stampOverrides };
  const dirs = enabledDirs ?? ALL_DIRS;
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const position = useRef(new Animated.ValueXY()).current;
  // 0 → 1 as the drag grows; drives the peel lift/scale.
  const dragAmount = useRef(new Animated.Value(0)).current;
  // Visibility of the tap-hint pills (1 on touch-down, fades as dragging starts).
  const hintVis = useRef(new Animated.Value(0)).current;
  // Refs avoid stale closures inside the PanResponder created once.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const animationRef = useRef(animation);
  animationRef.current = animation;
  const lastDirRef = useRef<SwipeDir | null>(null);
  // True only while a finger is down on the card. The destination glow and
  // stamps only mount while this is true, so they can never get stuck on
  // at rest no matter what the animated values do.
  const [isDragging, setIsDragging] = useState(false);
  // True while the top card is flying out on a committed swipe. The top
  // card only reads the exit values (exitOpacity/exitScale) while this is
  // true — so finishCommit never has to snap them back to visible while the
  // old card is still mounted (that snap is what flashed the exited card
  // back for a split second before React unmounted it).
  const [exiting, setExiting] = useState(false);
  // True while the exiting card is tucking behind the deck (a to-back
  // direction) rather than flying off. Drops its zIndex under the stack
  // so it slides behind the advancing cards.
  const [toBack, setToBack] = useState(false);
  const toBackDirsRef = useRef(toBackDirs ?? []);
  toBackDirsRef.current = toBackDirs ?? [];
  // Back-slot geometry for the tuck-behind effect, mirrored from the
  // deck look computed below (the PanResponder is created once, above it).
  const backSlotRef = useRef({ x: 0, y: 28, scale: 0.9 });
  // Commit animations: trash dive.
  const [trashing, setTrashing] = useState(false);
  // The committed direction's icon lingers at the deck's center: it lands
  // with a springy overshoot at commit, holds while the card exits, bounces
  // a little once the card has fully moved, then fades out softly.
  const [lingerDir, setLingerDir] = useState<SwipeDir | null>(null);
  // The single direction the current drag is heading (for display). Only
  // this direction's icon/glow renders while dragging — diagonal drags can
  // never stack overlapping icons. Updated only when the direction changes,
  // so it doesn't re-render every frame.
  const [displayDir, setDisplayDir] = useState<SwipeDir | null>(null);
  const displayDirRef = useRef<SwipeDir | null>(null);
  // Exit animation values for the commit choreography. The exiting card
  // keeps its own view for the whole exit — no remount, no new views
  // mid-animation.
  const exitScale = useRef(new Animated.Value(1)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;
  // A commit waiting for its exit animation to finish. State is NEVER
  // updated mid-animation: the reorder/remove lands in the animation's
  // completion callback, when the exiting card is already invisible.
  const pendingRef = useRef<{ dir: SwipeDir; movie: Movie } | null>(null);
  const exitAnimsRef = useRef<Animated.CompositeAnimation[]>([]);
  // The top card's view, for the synchronous layer drop on a to-back swipe
  // (setNativeProps applies before the exit animations start).
  const topCardRef = useRef<View | null>(null);
  // The trash bin's gulp runs on its own timeline (decoupled from the
  // commit), so a re-trash mid-gulp restarts it cleanly.
  const playBinGulp = useGulp();
  const finishCommitRef = useRef<() => void>(() => {});
  // The bin "gulps" (quick scale pop) as the trashed card lands in it.
  const binScale = useRef(new Animated.Value(1)).current;
  // The linger icon's lifecycle (Seen / Next), mirroring the trash bin
  // exactly: appears at commit and starts the bin's gulp immediately — same
  // clock as the bin, in parallel with the card's exit — then hides the
  // moment the card finishes exiting (~400ms), exactly like the bin's
  // setTrashing(false) in finishCommit. It never waits for the gulp's
  // springs to settle: that wait kept the icons hanging ~0.5s longer than
  // the bin, which is what made them feel slow. A new swipe stops any
  // in-flight gulp via lingerFor below.
  const lingerScale = useRef(new Animated.Value(1)).current;
  const lingerOpacity = useRef(new Animated.Value(0)).current;
  const lingerBounceRef = useRef<Animated.CompositeAnimation | null>(null);
  const bounceLinger = () => {
    lingerBounceRef.current?.stop();
    lingerScale.setValue(1);
    lingerOpacity.setValue(1);
    // The trash bin's gulp, exactly (see useGulp): delay 300ms, spring to
    // 1.3 (friction 4), spring back to 1 (friction 6), all on the NATIVE
    // driver. Started at commit, in parallel with the card's exit — like
    // the bin. Normally cut short at card-finish by hideLinger below; the
    // on-finish hide is only a fallback so the icon can never stick.
    const seq = Animated.sequence([
      Animated.delay(300),
      Animated.spring(lingerScale, { toValue: 1.3, friction: 4, useNativeDriver: true }),
      Animated.spring(lingerScale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]);
    lingerBounceRef.current = seq;
    seq.start(({ finished }) => {
      if (finished) {
        setLingerDir(null);
        lingerScale.setValue(1);
      }
    });
  };

  // Hide the linger icon instantly: stop any in-flight gulp, drop the pill,
  // reset the scale. Called when the card finishes exiting (finishCommit) —
  // the bin hides the same way via setTrashing(false), without waiting for
  // its springs to settle.
  const hideLinger = () => {
    lingerBounceRef.current?.stop();
    lingerBounceRef.current = null;
    setLingerDir(null);
    lingerScale.setValue(1);
  };

  // Start the linger for a committed direction: icon appears and gulps at
  // commit (parallel with the card exit), matching the trash bin timeline.
  // Does NOT gate the commit.
  const lingerFor = (dir: SwipeDir) => {
    lingerBounceRef.current?.stop();
    lingerScale.setValue(1);
    lingerOpacity.setValue(1);
    setLingerDir(dir);
    bounceLinger();
  };

  // Completes a pending commit. The exiting card is already invisible at its
  // exit-end state, so this does NOT snap any animated value back to visible:
  // snapping exitOpacity/position while the old card is still mounted paints
  // 1-3 frames of the exited card flashing back at full opacity before React
  // unmounts it. Instead the top card only reads the exit values while
  // `exiting` is true (set false here), and the shared values are reset on
  // the next grant — an invisible no-op, since the card is at rest then.
  // Behind cards render declarative rest positions whenever no gesture or
  // exit is active, so dragAmount needs no reset here either: the index
  // shift and the rest positions coincide exactly, with no gap and no jump.
  // Called when the exit animation finishes, or instantly if the user grabs
  // the deck mid-exit, so the next card is draggable right away and the
  // deck never feels blocked.
  // The linger gulp starts at commit (lingerFor), in parallel with the card's
  // exit; here the icon hides the moment the card finishes — exactly like
  // the trash bin (setTrashing(false) below).
  const finishCommit = () => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    exitAnimsRef.current.forEach((a) => a.stop());
    exitAnimsRef.current = [];
    setExiting(false);
    setToBack(false);
    setTrashing(false);
    // The card has fully moved: the linger icon hides instantly — exactly
    // like the trash bin. Waiting for the gulp's springs to settle first
    // kept the icons hanging ~0.5s longer than the bin.
    if (lingerDir) hideLinger();
    onSwipeRef.current(p.dir, p.movie);
  };
  finishCommitRef.current = finishCommit;

  const snapBack = () => {
    Animated.parallel([
      Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
      Animated.spring(dragAmount, { toValue: 0, useNativeDriver: true }),
      Animated.timing(hintVis, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => { lastDirRef.current = null; setIsDragging(false); });
  };

  const trashBinRef = useRef(trashBin);
  trashBinRef.current = trashBin;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Tap: reveal the direction hint pills (text labels).
        // Grabbing mid-exit settles the pending commit instantly — the
        // deck never blocks the next gesture.
        finishCommitRef.current();
        // Reset the shared values for the next gesture. Invisible no-op:
        // the top card is at rest (it only reads these while dragging or
        // exiting), so nothing on screen moves.
        position.setValue({ x: 0, y: 0 });
        dragAmount.setValue(0);
        exitScale.setValue(1);
        exitOpacity.setValue(1);
        hintVis.setValue(1);
        displayDirRef.current = null;
        setDisplayDir(null);
        setIsDragging(true);
      },
      onPanResponderMove: (_, g) => {
        const dist = Math.hypot(g.dx, g.dy);
        position.setValue({ x: g.dx, y: g.dy });
        dragAmount.setValue(Math.min(1, dist / PEEL_FULL));
        // Text hints fade out as soon as a drag takes over.
        hintVis.setValue(Math.max(0, 1 - dist / HINT_FADE));
        // Single display direction: only this direction's icon/glow shows,
        // so a diagonal drag never stacks overlapping icons. Updates only
        // on change — not every frame.
        const soft = softSwipeDir(g.dx, g.dy);
        const shown = soft && dirsRef.current.includes(soft) ? soft : null;
        if (shown !== displayDirRef.current) {
          displayDirRef.current = shown;
          setDisplayDir(shown);
        }
        const dir = swipeDir(g.dx, g.dy);
        const active = dir && dirsRef.current.includes(dir) ? dir : null;
        if (active && active !== lastDirRef.current) {
          lastDirRef.current = active;
          // Fire-and-forget: never block the gesture thread on haptics.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (!active) {
          lastDirRef.current = null;
        }
      },
      onPanResponderRelease: (_, g) => {
        const dir = swipeDir(g.dx, g.dy);
        const active = dir && dirsRef.current.includes(dir) ? dir : null;
        if (!active) {
          snapBack();
          return;
        }
        // Distinctive double-buzz on commit; runs alongside the exit animation.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsDragging(false);
        Animated.timing(hintVis, { toValue: 0, duration: 120, useNativeDriver: true }).start();

        const movie = cardsRef.current[0];
        if (!movie) {
          snapBack();
          return;
        }
        lastDirRef.current = null;
        // The commit waits for the exit animation: the card animates out
        // on its existing view while the behind cards finish closing
        // (dragAmount -> 1) in step with it, each landing exactly on its
        // post-commit rest spot. Nothing re-renders until the card is
        // invisible — so there is nothing that can flicker.
        pendingRef.current = { dir: active, movie };
        setExiting(true);
        const runExit = (cardAnims: Animated.CompositeAnimation[], duration: number) => {
          const all = Animated.parallel([
            ...cardAnims,
            Animated.timing(dragAmount, { toValue: 1, duration, useNativeDriver: true }),
          ]);
          exitAnimsRef.current = [all];
          all.start(({ finished }) => {
            if (finished) finishCommitRef.current();
          });
        };

        if (active === 'down' && trashBinRef.current) {
          // iOS Mail-style trash: the card accelerates straight into the
          // bin, shrinking to nothing as it lands. The bin gulps on its own
          // timeline — it must NOT gate the commit: the deletion lands at
          // 400ms like every other direction, and the bin finishes gulping
          // (and hides itself) afterwards.
          setTrashing(true);
          playBinGulp(binScale, () => setTrashing(false));
          runExit(
            [
              Animated.timing(position, {
                toValue: { x: g.dx * 0.25, y: 0 }, // bin is at deck center
                duration: 400,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(exitScale, {
                toValue: 0.08,
                duration: 400,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(exitOpacity, { toValue: 0, duration: 360, useNativeDriver: true }),
            ],
            400
          );
          return;
        }
        if (active === 'left' || active === 'right') {
          if (toBackDirsRef.current.includes(active)) {
            // Next: the card tucks behind the deck — it shrinks toward the
            // back slot, slides under the advancing cards, and fades as it
            // lands behind them. The layer drop is applied SYNCHRONOUSLY via
            // setNativeProps BEFORE the animations start: a state-driven
            // zIndex change lands mid-animation on iOS (the re-render is
            // async), and reordering the layer while native animations run
            // blanks the deck. (Guarded: web refs don't forward
            // setNativeProps; iOS does.) React's style keeps zIndex constant
            // so it never reorders the layer itself.
            //
            // Small-deck hazards (1-3 cards): the tucked card stays mounted
            // (VISIBLE is 3), so two iOS-only native overrides would stick:
            // - zIndex: with 1 card there is nothing to tuck behind, and the
            //   setNativeProps zIndex=5 bypasses React's shadow (which still
            //   says 10), so it never heals — and would bury this card once
            //   more cards arrive. Skipped for a single card.
            // - fade-out: leaves the native opacity at 0 while the style
            //   switches back to a plain value; iOS doesn't apply that
            //   Animated→plain transition, so the card stays invisible and
            //   the deck goes blank. Skipped whenever the card stays mounted.
            const cardCount = cardsRef.current.length;
            if (cardCount > 1) {
              (topCardRef.current as any)?.setNativeProps?.({ zIndex: 5 });
            }
            setToBack(true);
            lingerFor(active);
            const back = backSlotRef.current;
            runExit(
              [
                Animated.timing(position, {
                  toValue: { x: back.x, y: back.y },
                  duration: 450,
                  easing: Easing.inOut(Easing.quad),
                  useNativeDriver: true,
                }),
                Animated.timing(exitScale, {
                  toValue: back.scale,
                  duration: 450,
                  useNativeDriver: true,
                }),
                // Stay visible while traveling; fade only as it tucks in —
                // and only when the card will unmount (4+ cards). With 1-3
                // cards it stays on screen (see above).
                ...(cardCount > 3
                  ? [
                      Animated.sequence([
                        Animated.delay(300),
                        Animated.timing(exitOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
                      ]),
                    ]
                  : []),
              ],
              450
            );
            return;
          }
          // Otherwise (e.g. Trending's "save to Watchlist"): classic dive
          // off-screen while the next card rises into its place.
          lingerFor(active);
          runExit(
            [
              Animated.timing(position, {
                toValue: { x: active === 'left' ? -70 : 70, y: 60 },
                duration: 380,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(exitScale, { toValue: 0.82, duration: 380, useNativeDriver: true }),
              Animated.timing(exitOpacity, { toValue: 0, duration: 340, useNativeDriver: true }),
            ],
            380
          );
          return;
        }
        if (active === 'up') {
          // Seen: the card floats upward and fades away, like a memory.
          lingerFor(active);
          runExit(
            [
              Animated.timing(position, {
                toValue: { x: g.dx * 0.3, y: -SCREEN_H * 0.55 },
                duration: 450,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(exitScale, { toValue: 0.94, duration: 450, useNativeDriver: true }),
              Animated.timing(exitOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
            ],
            450
          );
          return;
        }
        // Down without a trash bin (e.g. Trending's Hide): classic fly-off.
        const speed = Math.hypot(g.vx ?? 0, g.vy ?? 0);
        // Faster flick → snappier exit (120–300ms).
        const duration = animationRef.current === 'flick'
          ? Math.min(300, Math.max(120, 300 - speed * 30))
          : 260;
        lingerFor(active);
        runExit(
          [
            Animated.timing(position, {
              toValue: offscreenTarget(active, g.dx, g.dy, g.vx ?? 0, g.vy ?? 0),
              duration,
              useNativeDriver: true,
            }),
          ],
          duration
        );
      },
      onPanResponderTerminate: () => {
        finishCommitRef.current();
        snapBack();
      },
    })
  ).current;

  const isPeel = animation === 'peel';

  // ---- Behind-cards deck: three switchable looks. As the top card is
  // dragged away, each look closes one step so the next card settles
  // into the top card's place.
  //   stack:    Tinder-style — no rotation, each card slightly smaller and
  //             lower, clean edges peeking out all around.
  //   sidepeek: cards hide behind except a sliver on the left edge.
  //   fan:      subtle playing-cards fan, cards tilted a touch and dimmed.
  // Behind-cards deck geometry (stack / sidepeek / fan) lives in deckMath.
  const deck = DECKS[deckStyle] ?? DECKS.stack;
  backSlotRef.current = { x: 2 * deck.x, y: 2 * deck.y, scale: 1 - 2 * deck.scale };
  // Behind cards follow dragAmount only while a gesture or exit is active.
  // At rest (and across the commit handoff) they render declarative rest
  // positions — so finishCommit never has to snap a shared animated value
  // while old views are still mounted, and there is no frame where a
  // behind card can jump or stutter.
  const deckActive = isDragging || exiting;
  const behindRotate = (i: number) =>
    deckActive
      ? dragAmount.interpolate({
          inputRange: [0, 1],
          outputRange: [`${i * deck.rot}deg`, `${(i - 1) * deck.rot}deg`],
          extrapolate: 'clamp',
        })
      : `${i * deck.rot}deg`;
  const behindX = (i: number) =>
    deckActive
      ? dragAmount.interpolate({
          inputRange: [0, 1],
          outputRange: [i * deck.x, (i - 1) * deck.x],
          extrapolate: 'clamp',
        })
      : i * deck.x;
  const behindY = (i: number) =>
    deckActive
      ? dragAmount.interpolate({
          inputRange: [0, 1],
          outputRange: [i * deck.y, (i - 1) * deck.y],
          extrapolate: 'clamp',
        })
      : i * deck.y;
  const behindScale = (i: number) =>
    deckActive
      ? dragAmount.interpolate({
          inputRange: [0, 1],
          outputRange: [1 - i * deck.scale, 1 - (i - 1) * deck.scale],
          extrapolate: 'clamp',
        })
      : 1 - i * deck.scale;

  // Flick: classic tilt that follows the finger. Peel: the card lifts off the
  // deck, tilts harder and shrinks, like a page being peeled away.
  const rotate = position.x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: isPeel ? ['-28deg', '0deg', '28deg'] : ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });
  const peelScale = dragAmount.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.88],
    extrapolate: 'clamp',
  });
  const peelLiftY = dragAmount.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -26],
    extrapolate: 'clamp',
  });

  const dirOpacity = (dir: SwipeDir) =>
    (dir === 'left'
      ? position.x.interpolate({ inputRange: [-THRESHOLD, -30], outputRange: [1, 0], extrapolate: 'clamp' })
      : dir === 'right'
        ? position.x.interpolate({ inputRange: [30, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' })
        : dir === 'up'
          ? position.y.interpolate({ inputRange: [-THRESHOLD, -30], outputRange: [1, 0], extrapolate: 'clamp' })
          : position.y.interpolate({ inputRange: [30, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' }));

  // The deck renders the cards as given; a pending commit only lands in
  // state after the exit animation finishes.
  const visible = cards.slice(0, 3);

  // Tap hints keep their text labels; icon-only directions show the icon.
  const renderHintContent = (dir: SwipeDir) => {
    const s = stamps[dir];
    if (s.text) {
      return <Text style={[styles.hintText, { color: s.textColor }]}>{s.text}</Text>;
    }
    return <DirectionIcon dir={dir} stamp={s} size={20} />;
  };

  return (
    <View style={styles.deck}>
      {visible.map((movie, i) => {
        if (i === 0) {
          return (
            <Animated.View
              key={movie.id}
              ref={topCardRef}
              {...panResponder.panHandlers}
              style={[
                styles.cardWrap,
                // The top card's zIndex stays constant (10) in React's
                // render — React must NEVER see a zIndex change here, or its
                // async re-render reorders the layer mid-animation on iOS
                // (which blanks the deck). The to-back tuck drops the layer
                // synchronously via topCardRef.setNativeProps BEFORE the exit
                // animations start; the card unmounts at the commit, so the
                // native override never needs to be undone.
                {
                  zIndex: 10,
                  elevation: 10,
                  opacity: exiting ? exitOpacity : 1,
                },
                // The card only follows the animated values while a finger is
                // dragging it or it's flying out on a commit. At rest it
                // renders with no transform — so stale exit-end values can
                // never paint a frame of the card misplaced or flashed back.
                // (At grant the values are reset to rest first, so opening
                // the gate is itself invisible.)
                {
                  transform:
                    isDragging || exiting
                      ? [
                          ...position.getTranslateTransform(),
                          { rotate },
                          { scale: exiting ? exitScale : 1 },
                          // Peel lift/shrink is a drag feel; the tuck-behind
                          // drives its own scale, so peel stays out of it.
                          ...(isPeel && !toBack ? [{ scale: peelScale }, { translateY: peelLiftY }] : []),
                        ]
                      : [],
                },
              ]}
            >
              <MovieCard movie={movie} onInfoTap={onInfoTap ? () => onInfoTap(movie) : undefined} />
              {/* Tap hints: the live directions as text, fading as a drag takes over */}
              {dirs.map((dir) => (
                <Animated.View
                  key={`hint-${dir}`}
                  pointerEvents="none"
                  style={[styles.hintPos, HINT_POS[dir], { opacity: hintVis }]}
                >
                  <View style={[styles.hintPill, { backgroundColor: stamps[dir].color }]}>
                    {renderHintContent(dir)}
                  </View>
                </Animated.View>
              ))}
              {/* Destination glow: edge + halo in the direction's color.
                  Only the drag's single display direction ever shows, so a
                  diagonal drag can't light up two edges. Mounted only while
                  dragging, so it can never stick at rest. */}
              {isDragging && displayDir && (
                <Animated.View
                  key={`glow-${displayDir}`}
                  pointerEvents="none"
                  style={[
                    styles.glow,
                    {
                      borderColor: stamps[displayDir].color,
                      // No shadow on the glow: a pathless shadow whose opacity
                      // animates costs an offscreen render pass per frame.
                      // The colored border edge is the visible signal.
                      opacity: dirOpacity(displayDir),
                    },
                  ]}
                />
              )}
              {/* Active stamp: one big icon at the card's exact center —
                  the same spot for every direction. Only the drag's single
                  display direction shows — Seen/Trash stay hidden unless the
                  swipe is truly heading up/down. Mounted only while
                  dragging, so it can never stick at rest. */}
              {isDragging && displayDir && (
                <Animated.View
                  key={displayDir}
                  pointerEvents="none"
                  style={[styles.stampPos, { opacity: dirOpacity(displayDir) }]}
                >
                  {<DirectionPill dir={displayDir} stamp={stamps[displayDir]} />}
                </Animated.View>
              )}
            </Animated.View>
          );
        }
        // Cards behind the top one (must be Animated.View: the
        // transforms are driven by animated values).
        return (
          <Animated.View
            key={movie.id}
            style={[
              styles.cardWrap,
              styles.behind,
              deck.dim > 0 && { opacity: 1 - deck.dim },
              {
                zIndex: 10 - i,
                elevation: 10 - i,
                transform: [
                  { rotate: behindRotate(i) },
                  { translateX: behindX(i) },
                  { translateY: behindY(i) },
                  { scale: behindScale(i) },
                ],
              },
            ]}
            pointerEvents="none"
          >
            <MovieCard movie={movie} />
          </Animated.View>
        );
      })}
      {/* Trash bin: appears for the Mail-style dive commit, gulps on landing. */}
      {trashing && (
        <Animated.View
          style={[styles.binWrap, { opacity: 1 }]}
          pointerEvents="none"
        >
          <Animated.View style={[styles.bin, { transform: [{ scale: binScale }] }]}>
            <Ionicons name="trash" size={30} color="#fff" />
          </Animated.View>
        </Animated.View>
      )}
      {/* Linger: the committed direction's icon lands at the deck's center at
          commit, gulps (the trash bin's exact sequence, started in parallel
          with the card's exit), then hides the moment the card finishes
          moving — exactly like the bin. Always mounted: mounting this
          overlay (zIndex 20) mid-exit re-sorts the iOS native layers while
          the tuck's exit animation runs, which blanks the deck. Visibility
          is opacity-only, so showing/hiding it never touches the layer
          hierarchy. */}
      <Animated.View
        style={[styles.lingerWrap, { opacity: lingerOpacity, transform: [{ scale: lingerScale }] }]}
        pointerEvents="none"
      >
        {lingerDir && (
          <DirectionPill dir={lingerDir} stamp={stamps[lingerDir]} small />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' },
  cardWrap: { position: 'absolute', width: CARD_W, height: CARD_H, shadowOffset: { width: 0, height: 12 }, shadowRadius: 24 },
  behind: { opacity: 0.9 },
  glow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 5, borderRadius: 20,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 22,
  },
  hintPos: { position: 'absolute' },
  hintPill: {
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6,
  },
  hintText: { fontSize: 13, fontWeight: '800' },
  stampPos: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  binWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20, elevation: 20,
  },
  lingerWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20, elevation: 20,
  },
  bin: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#ff453a',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
});
