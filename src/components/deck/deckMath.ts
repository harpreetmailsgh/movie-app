import { Dimensions } from 'react-native';
import type { DeckStyle } from '../../lib/types';

export type SwipeDir = 'left' | 'right' | 'up' | 'down';

export type DragIcon = 'eye' | 'trash' | 'next' | 'add' | 'hide';

export interface Stamp {
  text: string;
  color: string;
  textColor: string;
  /** Icon shown on the stamp while dragging — replaces the text mid-gesture. */
  dragIcon?: DragIcon;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const THRESHOLD = 110;
// Drag distance at which the peel effect is fully expressed.
export const PEEL_FULL = 170;
// Drag distance at which the tap-hints have fully faded.
export const HINT_FADE = 70;

export function swipeDir(dx: number, dy: number): SwipeDir | null {
  if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * The single direction a gesture is heading, for display purposes. Unlike
 * swipeDir (which gates the commit on THRESHOLD), this uses a small dead
 * zone so the icon appears as soon as the direction is clear — but only one
 * icon ever shows, so diagonal drags can't stack overlapping icons.
 */
export function softSwipeDir(dx: number, dy: number): SwipeDir | null {
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function offscreenTarget(dir: SwipeDir, dx: number, dy: number, vx: number, vy: number) {
  // Momentum: extend the target along the flick velocity so hard throws fly further.
  const mx = vx * 350;
  const my = vy * 350;
  switch (dir) {
    case 'left': return { x: -SCREEN_W + Math.min(0, mx), y: dy * 2 + my };
    case 'right': return { x: SCREEN_W + Math.max(0, mx), y: dy * 2 + my };
    case 'up': return { x: dx * 2 + mx, y: -SCREEN_H + Math.min(0, my) };
    case 'down': return { x: dx * 2 + mx, y: SCREEN_H + Math.max(0, my) };
  }
}

export interface DeckGeometry {
  rot: number;
  x: number;
  y: number;
  scale: number;
  dim: number;
}

// Behind-cards deck: three switchable looks. As the top card is dragged
// away, each look closes one step so the next card settles into the top
// card's place.
//   stack:    Tinder-style — no rotation, each card slightly smaller and
//             lower, clean edges peeking out all around.
//   sidepeek: cards hide behind except a sliver on the left edge.
//   fan:      subtle playing-cards fan, cards tilted a touch and dimmed.
export const DECKS: Record<DeckStyle, DeckGeometry> = {
  stack: { rot: 0, x: 0, y: 14, scale: 0.05, dim: 0 },
  sidepeek: { rot: 0, x: -22, y: 5, scale: 0.02, dim: 0 },
  fan: { rot: -4, x: -14, y: 10, scale: 0.03, dim: 0.25 },
};
