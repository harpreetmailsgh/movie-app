import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { getQueueIdentity } from './push';

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
  /** Row id in the Supabase fetch_queue mirror, null when not mirrored. */
  supabaseId: string | null;
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
    supabaseId: typeof r.supabaseId === 'string' ? r.supabaseId : null,
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

// ---------------------------------------------------------------------------
// Supabase fetch_queue mirror (backlog #71, push-notification support).
// All helpers are fire-and-forget: they catch everything and never reject
// into the UI. Mirroring only happens when a user identity is known.
// ---------------------------------------------------------------------------

/** Insert a new row; resolves with the row id or null. */
async function mirrorInsert(
  userId: string,
  url: string,
  pushToken: string | null
): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('fetch_queue')
      .insert({ user_id: userId, url, status: 'queued', push_token: pushToken })
      .select('id')
      .single();
    if (error || !data) return null;
    const id = (data as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** Atomic claim: flip to 'processing' only if the row is still 'queued'. */
async function mirrorClaim(supabaseId: string): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb
      .from('fetch_queue')
      .update({ status: 'processing' })
      .eq('id', supabaseId)
      .eq('status', 'queued');
  } catch { /* mirror is best-effort */ }
}

/** Mirror a failure: row status 'failed' plus the error message. */
async function mirrorFail(supabaseId: string, error: string | null): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb
      .from('fetch_queue')
      .update({ status: 'failed', error })
      .eq('id', supabaseId);
  } catch { /* mirror is best-effort */ }
}

/** Mirror completion: row status 'done'. */
async function mirrorDone(supabaseId: string): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('fetch_queue').update({ status: 'done' }).eq('id', supabaseId);
  } catch { /* mirror is best-effort */ }
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

  const updateItem = useCallback(async (id: string, patch: Partial<QueueItem>): Promise<void> => {
    await persist(itemsRef.current.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    ));
    // Supabase mirror (fire-and-forget, never rejects into the UI).
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.supabaseId) {
      if (patch.status === 'processing') {
        void mirrorClaim(item.supabaseId);
      } else if (patch.status === 'failed') {
        void mirrorFail(item.supabaseId, item.error);
      }
    }
  }, [persist]);

  const enqueue = useCallback(async (url: string): Promise<QueueItem> => {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      videoTitle: null,
      status: 'queued',
      error: null,
      supabaseId: null,
      createdAt: Date.now(),
    };
    await persist([...itemsRef.current, item]);
    // Supabase mirror (fire-and-forget): stamp the row id back on the item.
    void (async () => {
      const { userId, pushToken } = getQueueIdentity();
      if (!userId) return;
      const supabaseId = await mirrorInsert(userId, url, pushToken);
      if (supabaseId) {
        await updateItem(item.id, { supabaseId });
      }
    })();
    return item;
  }, [persist, updateItem]);

  const removeItem = useCallback(async (id: string): Promise<void> => {
    const item = itemsRef.current.find((i) => i.id === id);
    await persist(itemsRef.current.filter((i) => i.id !== id));
    // Supabase mirror (fire-and-forget): mark the row done.
    if (item?.supabaseId) {
      void mirrorDone(item.supabaseId);
    }
  }, [persist]);

  return { items, enqueue, updateItem, removeItem };
}
