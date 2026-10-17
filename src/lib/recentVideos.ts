import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * at 10 entries; `recordVideo` prepends and trims. Dev-2's Add-screen UI
 * consumes `videos` and calls `recordVideo` once per processed video.
 */
export function useRecentVideos(): {
  videos: RecentVideoEntry[];
  recordVideo: (entry: Omit<RecentVideoEntry, 'id' | 'createdAt'>) => Promise<void>;
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadVideos();
      if (cancelled) return;
      await persist(loaded);
    })();
    return () => { cancelled = true; };
  }, [persist]);

  const recordVideo = useCallback(async (
    entry: Omit<RecentVideoEntry, 'id' | 'createdAt'>
  ): Promise<void> => {
    const full: RecentVideoEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    };
    await persist([full, ...videosRef.current].slice(0, MAX_ENTRIES));
  }, [persist]);

  return { videos, recordVideo };
}
