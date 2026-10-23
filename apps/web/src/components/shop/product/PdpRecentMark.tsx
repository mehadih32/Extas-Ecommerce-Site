'use client';
// PR 67 — remembers that this phone opened the product, for "Recently viewed" (demo ST.recent): the product's id goes
// first in a small cookie of ids (nothing else), the oldest fall off after `keep`, and it is forgotten after `days`.
import { useEffect } from 'react';
import { pushRecent, RECENT_COOKIE } from '@/lib/shop/pdp-rows';

export function PdpRecentMark({ id, keep, days }: { id: string; keep: number; days: number }) {
  useEffect(() => {
    try {
      const now = document.cookie.split('; ').find((p) => p.startsWith(`${RECENT_COOKIE}=`));
      const next = pushRecent(now?.slice(RECENT_COOKIE.length + 1), id, keep);
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${RECENT_COOKIE}=${next}; Path=/; Max-Age=${days * 86400}; SameSite=Lax${secure}`;
    } catch {
      // a browser that refuses cookies simply has no "Recently viewed"
    }
  }, [id, keep, days]);
  return null;
}
