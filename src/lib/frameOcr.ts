/**
 * Frame-OCR fallback for reel import (backlog item 35).
 *
 * Waterfall: caption → TMDB, and ONLY when that yields zero matches, pull a
 * few thumbnails from the reel's og:video mp4 and run on-device text
 * recognition on them. This file returns raw OCR text only — no TMDB logic.
 *
 * Everything is guarded: when the `frame-ocr` native module or
 * expo-video-thumbnails is unavailable (e.g. Expo Go), every entry point
 * returns null/false without throwing.
 */

declare const require: any;

/** Guarded require — null instead of throwing when the module is absent. */
function tryRequire(id: string): any | null {
  try {
    const mod = require(id);
    return mod ?? null;
  } catch {
    return null;
  }
}

interface FrameOcrModules {
  recognizeTextAsync: ((uri: string) => Promise<unknown>) | null;
  getThumbnailAsync:
    | ((sourceFilename: string, options?: { time?: number; quality?: number }) => Promise<{ uri: string }>)
    | null;
}

function loadModules(): FrameOcrModules {
  const frameOcr = tryRequire('frame-ocr');
  const thumbs = tryRequire('expo-video-thumbnails');
  const recognizeTextAsync =
    frameOcr && typeof frameOcr.recognizeTextAsync === 'function'
      ? (frameOcr.recognizeTextAsync as (uri: string) => Promise<unknown>)
      : null;
  const getThumbnailAsync =
    thumbs && typeof thumbs.getThumbnailAsync === 'function'
      ? (thumbs.getThumbnailAsync as FrameOcrModules['getThumbnailAsync'])
      : null;
  return { recognizeTextAsync, getThumbnailAsync };
}

/** True iff on-device frame OCR can actually run. */
export function isFrameOcrAvailable(): boolean {
  try {
    const { recognizeTextAsync, getThumbnailAsync } = loadModules();
    return recognizeTextAsync !== null && getThumbnailAsync !== null;
  } catch {
    return false;
  }
}

// Same iPhone Safari User-Agent pattern as fetchReelText in tmdb.ts.
const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * Reel page → direct mp4 URL. Tries og:video:secure_url, then og:video,
 * using the same <meta property=...> regex style as fetchReelText.
 */
async function fetchMp4Url(reelUrl: string): Promise<string | null> {
  try {
    const res = await fetch(reelUrl, { headers: { 'User-Agent': IPHONE_SAFARI_UA } });
    if (!res.ok) return null;
    const html = await res.text();
    const meta = (prop: string): string => {
      const re = new RegExp(
        `<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`,
        'i'
      );
      const match = html.match(re);
      return match ? match[1] : '';
    };
    return meta('video:secure_url') || meta('video') || null;
  } catch {
    return null;
  }
}

/** Normalize whatever recognizeTextAsync resolves to into a string array. */
function toLines(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') return raw.split('\n');
  if (raw && typeof raw === 'object' && Array.isArray((raw as { lines?: unknown }).lines)) {
    return ((raw as { lines: unknown[] }).lines).filter(
      (x): x is string => typeof x === 'string'
    );
  }
  return [];
}

const FRAME_OFFSETS_S = [2, 6, 12, 20, 30, 45, 60, 90];
const OVERALL_TIMEOUT_MS = 60_000;

/**
 * Sample video frames from the reel and OCR on-screen text.
 * Returns the deduped text (or null when unavailable / nothing found /
 * aborted / timed out). Never throws.
 */
export async function fetchFrameOcrText(
  reelUrl: string,
  shouldAbort?: () => boolean
): Promise<string | null> {
  const run = async (): Promise<string | null> => {
    const { recognizeTextAsync, getThumbnailAsync } = loadModules();
    if (!recognizeTextAsync || !getThumbnailAsync) return null;

    const mp4 = await fetchMp4Url(reelUrl);
    if (!mp4) return null;
    if (shouldAbort?.()) return null;

    const seen = new Set<string>();
    const lines: string[] = [];
    for (const offsetS of FRAME_OFFSETS_S.slice(0, 8)) {
      if (shouldAbort?.()) return null;
      let thumbUri: string | null = null;
      try {
        const thumb = await getThumbnailAsync(mp4, { time: offsetS * 1000, quality: 0.8 });
        thumbUri = thumb?.uri ?? null;
      } catch {
        continue; // e.g. offset past the end of the video
      }
      if (!thumbUri) continue;
      try {
        const raw = await recognizeTextAsync(thumbUri);
        for (const line of toLines(raw)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const key = trimmed.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          lines.push(trimmed);
        }
      } catch {
        // Frame-level failure — keep going with the next frame.
      }
    }
    const kept = lines.filter((l) => (l.match(/[a-z0-9]/gi) ?? []).length >= 3);
    return kept.length ? kept.join('\n') : null;
  };
  try {
    return await Promise.race([
      run(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), OVERALL_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}
