/**
 * TikTok link support for the Add screen: validate the link, resolve share
 * short links (vm.tiktok.com / vt.tiktok.com) to the canonical video URL,
 * and read the caption + author from TikTok's public oEmbed endpoint —
 * the caption-first step of the import cascade (same shape as YouTube).
 */

const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]);

/** True when the pasted text is a TikTok link we can try to read. */
export function isTikTokUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return TIKTOK_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface TikTokVideoInfo {
  caption: string;
  author: string;
}

/**
 * Keyless caption/author via TikTok's public oEmbed endpoint.
 * Share links (vm./vt.tiktok.com) redirect to the canonical video URL;
 * fetch follows redirects and response.url carries the final address,
 * which is what oEmbed wants. Returns null when the video can't be read
 * (private, removed, or region-blocked).
 */
export async function fetchTikTokInfo(
  url: string
): Promise<TikTokVideoInfo | null> {
  const link = url.trim();
  if (!isTikTokUrl(link)) return null;
  let canonical = link;
  try {
    const page = await fetch(link);
    if (page.url && isTikTokUrl(page.url)) canonical = page.url;
  } catch {
    /* keep the pasted link; oEmbed may still resolve it */
  }
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const caption = (data?.title ?? '').trim();
    if (!caption) return null;
    return { caption, author: (data?.author_name ?? '').trim() };
  } catch {
    return null;
  }
}
