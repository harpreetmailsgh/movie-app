import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type QueueItemStatus = 'queued' | 'processing' | 'failed';

export type QueueItem = {
  /** `${Date.now()}-${Math.random().toString(36).slice(2)}` */
  id: string;
  url: string;
  /** From oEmbed during processing, null until fetched. */
  videoTitle: string | null;
  status: QueueItemStatus;
  /** Set when status is 'failed'. */
  error: string | null;
  createdAt: number;
};

const QUEUE_KEY = 'movieapp.fetchQueue.v1';

/**
 * Old saves may lack newer fields entirely (JSON.parse won't add them), so
 * every field gets a default here. Mandatory guard: a 'processing' item can
 * only exist if the app died mid-run — it goes back to 'queued' so no
 * spinner is orphaned on launch.
 */
function normalizeItem(raw: unknown): QueueItem {
  const r = (raw ?? {}) as Partial<QueueItem>;
  return {
    id: typeof r.id === 'string' && r.id
      ? r.id
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: typeof r.url === 'string' ? r.url : '',
    videoTitle: typeof r.videoTitle === 'string' ? r.videoTitle : null,
    status: r.status === 'failed' ? 'failed' : 'queued',
    error: typeof r.error === 'string' ? r.error : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  };
}

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem);
  } catch {
    // Corrupt storage: start with an empty queue rather than crash.
    return [];
  }
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* storage full etc. — keep the in-memory copy */ }
}

export interface QueueApi {
  items: QueueItem[];
  enqueue: (url: string) => Promise<QueueItem>;
  updateItem: (id: string, patch: Partial<QueueItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

/**
 * AsyncStorage-backed fetch queue. Items are processed sequentially by the
 * caller (Dev-2's worker loop on the Add screen); this hook only owns the
 * persisted list and the mutation helpers.
 */
export function useQueue(): QueueApi {
  const [items, setItems] = useState<QueueItem[]>([]);
  // Ref mirror so sequential async mutations always build on the latest
  // list instead of a stale closure.
  const itemsRef = useRef<QueueItem[]>([]);

  const persist = useCallback(async (next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
    await saveQueue(next);
  }, []);

  // Load persisted state; normalizeItem resets orphaned 'processing' items.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadQueue();
      if (cancelled) return;
      await persist(loaded);
    })();
    return () => { cancelled = true; };
  }, [persist]);

  const enqueue = useCallback(async (url: string): Promise<QueueItem> => {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      videoTitle: null,
      status: 'queued',
      error: null,
      createdAt: Date.now(),
    };
    await persist([...itemsRef.current, item]);
    return item;
  }, [persist]);

  const updateItem = useCallback(async (id: string, patch: Partial<QueueItem>): Promise<void> => {
    await persist(itemsRef.current.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    ));
  }, [persist]);

  const removeItem = useCallback(async (id: string): Promise<void> => {
    await persist(itemsRef.current.filter((item) => item.id !== id));
  }, [persist]);

  return { items, enqueue, updateItem, removeItem };
}
