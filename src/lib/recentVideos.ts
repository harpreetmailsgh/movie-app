import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeminiFailureReason } from './gemini';

export type RecentVideoStatus = 'success' | 'partial' | 'failed';

export type RecentVideoTitle = { title: string; unverified: boolean };

export type RecentVideoEntry = {
  /** `${Date.now()}-${Math.random().toString(36).slice(2)}` */
  id: string;
  url: string;
  /** From oEmbed during processing, null when unknown. */
  videoTitle: string | null;
  titles: RecentVideoTitle[];
  status: RecentVideoStatus;
  /** Set when status is 'failed'. */
  error: string | null;
  /** Why the Gemini step failed, when known — lets the UI + diagnostics
   *  tell "no movies in this video" from "the movie service is down".
   *  Null on old saves and on non-Gemini failures. */
  failureReason?: GeminiFailureReason | null;
  /** Last Gemini HTTP status the server saw, when reported. */
  failureStatus?: number | null;
  /** When the failure happened (ms since epoch). */
  failureAt?: number | null;
  createdAt: number;
};

const RECENT_VIDEOS_KEY = 'movieapp.recentVideos.v1';
const MAX_ENTRIES = 10;

function normalizeTitle(raw: unknown): RecentVideoTitle | null {
  const t = (raw ?? {}) as Partial<RecentVideoTitle>;
  if (typeof t.title !== 'string' || !t.title) return null;
  return { title: t.title, unverified: t.unverified === true };
}

/**
 * Old saves may lack newer fields entirely (JSON.parse won't add them), so
 * every field gets a default here. An old save can also carry a field as an
 * EMPTY STRING (baked env defaults persisted by old bundles), so string
 * fields normalize with `||` rather than `??`. Returns null for corrupt
 * entries (e.g. missing url) so they are dropped on load.
 */
function normalizeEntry(raw: unknown): RecentVideoEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RecentVideoEntry>;
  if (typeof r.url !== 'string' || !r.url) return null;
  const status: RecentVideoStatus =
    r.status === 'success' || r.status === 'partial' || r.status === 'failed'
      ? r.status
      : r.error ? 'failed' : 'success';
  const knownReasons = ['ok', 'transient', 'permanent', 'no_movies', 'deadline', 'unknown'];
  return {
    id: typeof r.id === 'string' && r.id
      ? r.id
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: r.url,
    videoTitle: typeof r.videoTitle === 'string' ? r.videoTitle || null : null,
    titles: Array.isArray(r.titles)
      ? r.titles.map(normalizeTitle).filter((t): t is RecentVideoTitle => t !== null)
      : [],
    status,
    error: typeof r.error === 'string' ? r.error || null : null,
    // Old saves lack these keys entirely — default to null.
    failureReason: typeof r.failureReason === 'string' && knownReasons.includes(r.failureReason)
      ? (r.failureReason as GeminiFailureReason)
      : null,
    failureStatus: typeof r.failureStatus === 'number' ? r.failureStatus : null,
    failureAt: typeof r.failureAt === 'number' ? r.failureAt : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  };
}

async function loadVideos(): Promise<RecentVideoEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_VIDEOS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((e): e is RecentVideoEntry => e !== null);
  } catch {
    // Corrupt storage: start empty rather than crash.
    return [];
  }
}

async function saveVideos(entries: RecentVideoEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_VIDEOS_KEY, JSON.stringify(entries));
  } catch { /* storage full etc. — keep the in-memory copy */ }
}

/**
 * AsyncStorage-backed "Recent videos" import history. Newest first, capped
 * at 10 entries; `recordVideo` prepends and trims — except when an entry
 * for the same URL already exists (e.g. a Retry of a failed video), in
 * which case it replaces that entry IN PLACE (same slot, same id) so the
 * failed entry flips to its new status instead of leaving a stale
 * duplicate behind. Dev-2's Add-screen UI consumes `videos` and calls
 * `recordVideo` once per processed video.
 */
export function useRecentVideos(): {
  videos: RecentVideoEntry[];
  recordVideo: (entry: Omit<RecentVideoEntry, 'id' | 'createdAt'>) => Promise<void>;
  /** Removes the stored history and empties the list (local history only;
   *  movies already in the Watchlist are untouched). */
  clearVideos: () => Promise<void>;
} {
  const [videos, setVideos] = useState<RecentVideoEntry[]>([]);
  // Ref mirror so rapid successive recordVideo calls build on the latest
  // list instead of a stale closure (the stale-closure bug from backlog #69).
  const videosRef = useRef<RecentVideoEntry[]>([]);

  const persist = useCallback(async (next: RecentVideoEntry[]) => {
    videosRef.current = next;
    setVideos(next);
    await saveVideos(next);
  }, []);

  // Load persisted history on mount.
  // A share/record can land before this read resolves — merge the loaded
  // snapshot with the live list (same #89 pattern as the fetch queue) so
  // a resolving load never overwrites live entries with a stale snapshot.
  // Live entries win on id clash (they are newer). And a loaded snapshot
  // that is empty must never wipe a non-empty live list (or its storage).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadVideos();
      if (cancelled) return;
      if (loaded.length === 0 && videosRef.current.length > 0) return;
      const merged = [...loaded];
      for (const entry of videosRef.current) {
        const idx = merged.findIndex((m) => m.id === entry.id);
        if (idx >= 0) merged[idx] = entry;
        else merged.push(entry);
      }
      await persist(merged);
    })();
    return () => { cancelled = true; };
  }, [persist]);

  const recordVideo = useCallback(async (
    entry: Omit<RecentVideoEntry, 'id' | 'createdAt'>
  ): Promise<void> => {
    // A re-run of a URL already in the list (Retry button) updates that
    // entry in place — same slot, same id (so an expanded row stays
    // expanded on its new result) — instead of prepending a second entry
    // and leaving the stale failed one behind.
    const existingIndex = videosRef.current.findIndex((e) => e.url === entry.url);
    if (existingIndex >= 0) {
      const existing = videosRef.current[existingIndex];
      const updated: RecentVideoEntry = {
        ...entry,
        id: existing.id,
        createdAt: existing.createdAt,
      };
      const next = [...videosRef.current];
      next[existingIndex] = updated;
      await persist(next);
      return;
    }
    const full: RecentVideoEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    };
    await persist([full, ...videosRef.current].slice(0, MAX_ENTRIES));
  }, [persist]);

  const clearVideos = useCallback(async (): Promise<void> => {
    // Mirror the persist pattern (ref + state together, no stale closure),
    // but remove the stored key instead of re-saving an empty list.
    videosRef.current = [];
    setVideos([]);
    try {
      await AsyncStorage.removeItem(RECENT_VIDEOS_KEY);
    } catch { /* storage error — in-memory list is already empty */ }
  }, []);

  return { videos, recordVideo, clearVideos };
}
