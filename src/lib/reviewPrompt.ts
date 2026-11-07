import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * In-app review prompt (backlog #80).
 *
 * Counts successful Watchlist saves and asks the user to rate the app via
 * the native store sheet (expo-store-review) at save milestones 5, 20 and
 * 50, with at least 30 days between asks and at most 3 asks ever. The OS
 * decides whether the sheet actually shows (at most 3 times a year on iOS),
 * so an ask is recorded when the request is made — we can never know if the
 * sheet appeared. Counter + ask history live in AsyncStorage, so they
 * survive force-close / reopen. Never throws: a missing native module or
 * an unavailable review flow just means no prompt, never a crash.
 */

export const REVIEW_MILESTONES = [5, 20, 50] as const;
const MAX_ASKS = 3;
const MIN_GAP_MS = 30 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'reviewPrompt.v1';

export interface ReviewPromptState {
  /** Successful movies saved to the Watchlist (all save paths). */
  saveCount: number;
  /** Rating requests made so far (max 3). */
  askCount: number;
  /** Epoch ms of the last request, or null when never asked. */
  lastAskDate: number | null;
  /** Next save-count milestone to ask at, or null when all asked. */
  nextMilestone: number | null;
}

const DEFAULT_STATE: ReviewPromptState = {
  saveCount: 0,
  askCount: 0,
  lastAskDate: null,
  nextMilestone: REVIEW_MILESTONES[0],
};

function normalizeState(raw: unknown): ReviewPromptState {
  const r = (raw ?? {}) as Partial<ReviewPromptState>;
  const saveCount = typeof r.saveCount === 'number' && r.saveCount >= 0 ? Math.floor(r.saveCount) : 0;
  const askCount = typeof r.askCount === 'number' && r.askCount >= 0 ? Math.floor(r.askCount) : 0;
  const lastAskDate = typeof r.lastAskDate === 'number' && r.lastAskDate > 0 ? r.lastAskDate : null;
  // Old saves lack the key entirely: derive the next milestone from the
  // ask count (asks happen in milestone order), so a milestone is never
  // asked twice and a due-but-unasked milestone is never skipped.
  const nextMilestone = typeof r.nextMilestone === 'number' && (REVIEW_MILESTONES as readonly number[]).includes(r.nextMilestone)
    ? r.nextMilestone
    : askCount < MAX_ASKS ? REVIEW_MILESTONES[askCount] : null;
  return { saveCount, askCount, lastAskDate, nextMilestone };
}

function nextMilestoneAfter(count: number): number | null {
  for (const m of REVIEW_MILESTONES) {
    if (count < m) return m;
  }
  return null;
}

async function loadState(): Promise<ReviewPromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return normalizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state: ReviewPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Never let prompt bookkeeping break the save flow.
  }
}

/** True only when a milestone is hit, fewer than 3 asks made, and ≥30 days since the last ask. */
export function shouldAsk(state: ReviewPromptState, now: number = Date.now()): boolean {
  if (state.nextMilestone === null) return false;
  if (state.askCount >= MAX_ASKS) return false;
  if (state.saveCount < state.nextMilestone) return false;
  if (state.lastAskDate !== null && now - state.lastAskDate < MIN_GAP_MS) return false;
  return true;
}

// Saves are recorded through a single chain so back-to-back addMovie calls
// (e.g. a multi-title import) can't load the same count twice and lose an
// increment.
let saveChain: Promise<void> = Promise.resolve();

/**
 * Record one successful Watchlist save. When a milestone is due, request the
 * native rating sheet. Never throws.
 */
export function recordWatchlistSave(): Promise<void> {
  const run = saveChain.then(recordWatchlistSaveOnce);
  saveChain = run.catch(() => {});
  return run;
}

async function recordWatchlistSaveOnce(): Promise<void> {
  const state = await loadState();
  state.saveCount += 1;
  await saveState(state);
  if (!shouldAsk(state)) return;
  // Lazy import: the native module is absent from some binaries (and the
  // import itself throws there), so a missing module must not crash the app
  // at startup — only this path touches it.
  let StoreReview: typeof import('expo-store-review');
  try {
    StoreReview = await import('expo-store-review');
  } catch {
    return;
  }
  let available = false;
  try {
    available = await StoreReview.isAvailableAsync();
  } catch {
    return;
  }
  if (!available) return;
  // Record the ask before requesting: the request is the ask — the OS
  // decides whether the sheet shows, and requestReview gives no signal.
  const asked: ReviewPromptState = {
    ...state,
    askCount: state.askCount + 1,
    lastAskDate: Date.now(),
    nextMilestone: nextMilestoneAfter(state.nextMilestone ?? 0),
  };
  await saveState(asked);
  try {
    await StoreReview.requestReview();
  } catch {
    // The OS declined or the sheet failed: the ask is already recorded, so
    // this milestone is never asked twice.
  }
}
