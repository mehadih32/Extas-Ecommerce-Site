'use client';
// S12 · PR 250 — an article page tells the shop it was opened (rendered only while `blog.performance.count` is on): the
// article's id and where the reader came from — `shop` for the shop's own pages, otherwise only the other site's
// origin (never its path or query), or nothing. Once per page view, after the first paint; never holds the reader up.
import { useEffect } from 'react';
import { beacon } from '@/lib/shop/beacon';

/** Where this page was opened from, as the read beacon sends it. */
export function fromOf(referrer: string, host: string): string {
  if (!referrer) return '';
  try {
    const u = new URL(referrer);
    return u.host === host ? 'shop' : u.origin;
  } catch {
    return '';
  }
}

export function ArticleRead({ postId }: { postId: string }) {
  useEffect(() => {
    beacon('/api/shop/journal-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postId, from: fromOf(document.referrer, location.host) }),
      credentials: 'same-origin',
    });
  }, [postId]);
  return null;
}
