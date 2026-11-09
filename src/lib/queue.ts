import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from './supabase';
import { getQueueIdentity } from './push';
import { formatRetryMessage } from './retrySchedule';
import type { GeminiFailureReason } from './gemini';

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
  /** Automatic-retry state (backlog #98): when a transient Gemini failure
   *  re-queues the video, the next attempt time (epoch ms), how many auto
   *  re-queues have happened, and the Queue-row line shown for it. */
  retryAt: number | null;
  retryCount: number;
  retryMessage: string | null;
  /** 0–1 fraction of the fetch so far, null when no stage reported.
   *  Transient: never persisted — progress ticks every 250ms for up to
   *  45s, and writing each tick to AsyncStorage is pure churn. */
  progress: number | null;
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
    // Old saves lack these keys entirely — default to "no retry scheduled".
    // retryMessage normalizes with `||` (an empty string is no message).
    retryAt: typeof r.retryAt === 'number' ? r.retryAt : null,
    retryCount: typeof r.retryCount === 'number' ? r.retryCount : 0,
    retryMessage: typeof r.retryMessage === 'string' ? r.retryMessage || null : null,
    // A number clamps to 0..1; anything else (old saves lack the key) → null.
    progress: typeof r.progress === 'number' && Number.isFinite(r.progress)
      ? Math.min(1, Math.max(0, r.progress))
      : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  };
}

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Backlog #70 rider: drop persisted 'failed' items on load. A stuck
    // failed item in storage would never be cleared by the new auto-dismiss.
    return parsed.map(normalizeItem).filter((item) => item.status !== 'failed');
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

/**
 * Mirror an automatic re-queue (backlog #98): row back to 'queued' with
 * its retry time, count, reason, and Gemini status. Reads the row's
 * current retry_count first and writes max(local, server) so a count the
 * server set (its own re-queue while the app was closed) never regresses;
 * falls back to the local count if the read fails.
 */
async function mirrorRetry(
  supabaseId: string,
  opts: { retryAtISO: string; retryCount: number; reason: string; status?: number },
): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    let count = opts.retryCount;
    try {
      const { data } = await sb
        .from('fetch_queue')
        .select('retry_count')
        .eq('id', supabaseId)
        .single();
      const serverCount = (data as { retry_count?: unknown } | null)?.retry_count;
      if (typeof serverCount === 'number') count = Math.max(count, serverCount);
    } catch { /* read failed — fall back to the local count */ }
    await sb
      .from('fetch_queue')
      .update({
        status: 'queued',
        retry_at: opts.retryAtISO,
        retry_count: count,
        retry_reason: opts.reason,
        retry_status: opts.status ?? null,
      })
      .eq('id', supabaseId);
  } catch { /* mirror is best-effort */ }
}

/**
 * Mount merge (backlog #98): the server may have re-queued a row while
 * the app was closed — pull the signed-in user's queued rows that carry
 * a retry time and merge that state into the matching local items (by
 * supabaseId), so the Queue row shows the retry message too. Rows with
 * no matching local item are left alone (never resurrect a row the app
 * already finished or removed).
 */
async function mergeServerRetries(items: QueueItem[]): Promise<QueueItem[]> {
  try {
    const sb = getSupabase();
    const { userId } = getQueueIdentity();
    if (!sb || !userId) return items;
    const { data, error } = await sb
      .from('fetch_queue')
      .select('id,retry_at,retry_count,retry_reason,retry_status')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .not('retry_at', 'is', null);
    if (error || !data) return items;
    const rows = data as {
      id?: unknown;
      retry_at?: unknown;
      retry_count?: unknown;
      retry_reason?: unknown;
      retry_status?: unknown;
    }[];
    let changed = false;
    const next = items.map((item) => {
      if (!item.supabaseId) return item;
      const row = rows.find((r) => r.id === item.supabaseId);
      if (!row || typeof row.retry_at !== 'string') return item;
      const retryAt = Date.parse(row.retry_at);
      if (Number.isNaN(retryAt)) return item;
      changed = true;
      return {
        ...item,
        retryAt,
        retryCount: typeof row.retry_count === 'number' ? row.retry_count : item.retryCount,
        retryMessage: formatRetryMessage(
          typeof row.retry_reason === 'string' && row.retry_reason ? row.retry_reason : 'transient',
          typeof row.retry_status === 'number' ? row.retry_status : undefined,
          retryAt,
        ),
      };
    });
    return changed ? next : items;
  } catch {
    return items;
  }
}

export interface QueueApi {
  items: QueueItem[];
  enqueue: (url: string) => Promise<QueueItem>;
  /**
   * `retryReason` / `retryStatus` are mirror-only: they ride along when
   * the patch re-queues an item (so mirrorRetry can write them to the
   * server row) but are stripped before the patch hits the stored item.
   * `persist: false` skips the AsyncStorage write (in-memory itemsRef +
   * setItems still update) and skips all mirror traffic — used for
   * progress ticks, which fire every 250ms for up to 45s.
   */
  updateItem: (
    id: string,
    patch: Partial<QueueItem> & { retryReason?: GeminiFailureReason; retryStatus?: number },
    opts?: { persist?: boolean },
  ) => Promise<void>;
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
      // A share can enqueue before this read resolves — merging the
      // loaded snapshot with the live list keeps those items instead of
      // overwriting them with the stale pre-share snapshot. Live items
      // win on id clash (they are newer); the load-time 'failed' filter
      // in loadQueue still applies to the persisted half.
      const merged = [...loaded];
      for (const item of itemsRef.current) {
        const idx = merged.findIndex((m) => m.id === item.id);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
      }
      // Server-re-queued rows (backlog #98) merge their retry state in;
      // rows with no local item stay untouched.
      const withServerRetries = await mergeServerRetries(merged);
      await persist(withServerRetries);
    })();
    return () => { cancelled = true; };
  }, [persist]);

  const updateItem = useCallback(async (
    id: string,
    patch: Partial<QueueItem> & { retryReason?: GeminiFailureReason; retryStatus?: number },
    opts?: { persist?: boolean },
  ): Promise<void> => {
    const { retryReason, retryStatus, ...itemPatch } = patch;
    const next = itemsRef.current.map((item) =>
      item.id === id ? { ...item, ...itemPatch } : item
    );
    if (opts?.persist === false) {
      // Progress ticks only: in-memory update, no AsyncStorage write and
      // no mirror traffic (no status change → no mirror should run).
      itemsRef.current = next;
      setItems(next);
      return;
    }
    await persist(next);
    // Supabase mirror (fire-and-forget, never rejects into the UI).
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.supabaseId) {
      if (itemPatch.retryAt !== undefined && itemPatch.retryAt !== null && itemPatch.retryCount !== undefined) {
        // Automatic re-queue (backlog #98): mirror the retry state.
        void mirrorRetry(item.supabaseId, {
          retryAtISO: new Date(itemPatch.retryAt).toISOString(),
          retryCount: itemPatch.retryCount,
          reason: retryReason ?? 'transient',
          status: retryStatus,
        });
      } else if (patch.status === 'processing') {
        void mirrorClaim(item.supabaseId);
      } else if (patch.status === 'failed') {
        void mirrorFail(item.supabaseId, item.error);
      } else if (patch.supabaseId && item.status === 'processing') {
        // Fresh enqueue path: mirrorInsert lands after the worker already
        // marked the item 'processing' (the status patch fired while
        // supabaseId was still null, so no claim ran). Claiming on the
        // supabaseId patch closes that window — a locally-processing row
        // must read 'processing' in Supabase, or the server can claim it
        // at created_at + 90s and process the same video twice.
        void mirrorClaim(item.supabaseId);
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
      retryAt: null,
      retryCount: 0,
      retryMessage: null,
      progress: null,
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
    // Supabase mirror (fire-and-forget): mark the row done — UNLESS it
    // already failed. A failed item's mirrorFail ran when its status was
    // set to 'failed' (see updateItem); mirroring 'done' here would
    // overwrite that failure and the server row would masquerade as done,
    // so the server could never rescue it. mirrorFail was unreachable
    // before this guard: every failure path ends in removeItem.
    if (item?.supabaseId && item.status !== 'failed') {
      void mirrorDone(item.supabaseId);
    }
  }, [persist]);

  return { items, enqueue, updateItem, removeItem };
}
