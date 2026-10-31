'use client';
// S13 · PR 257 (Blueprint C6.2) — the shop's tracking beacon, drawn by the shop layout only while `ads.tracking` is on
// and a product view or the checkout is ticked. When a product page or the checkout opens it sends the page's path and
// a fresh event id (the id a browser pixel would share) to /api/shop/track; the server reads the product or the bag
// itself and sends the event to the ad platforms. It reads nothing typed, draws nothing and never holds the page up.
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { beacon } from '@/lib/shop/beacon';

export const TRACKING_BEACON_URL = '/api/shop/track';

export interface TrackingBeaconConfig {
  /** The product address prefix (`naming.productPathPrefix`, e.g. `/p/`). */
  productPrefix: string;
  checkoutPath: string;
  view: boolean;
  checkout: boolean;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/**
 * The page's event key, or null when the server would not count it (the server decides again; this only spares the
 * call): one view per product, whichever colour is open (`/p/<slug>/<colour>` is the same product), and the checkout.
 */
export function pageKey(path: string, c: TrackingBeaconConfig): string | null {
  const p = path.replace(/^\/bn(?=\/|$)/, '') || '/';
  const prefix = `/${c.productPrefix.split('/').filter(Boolean).join('/')}/`;
  if (c.view && prefix !== '//' && p.startsWith(prefix) && p.length > prefix.length) return `view:${p.slice(prefix.length).split('/')[0]}`;
  return c.checkout && p.replace(/\/+$/, '') === c.checkoutPath.replace(/\/+$/, '') ? 'checkout' : null;
}

export const counts = (path: string, c: TrackingBeaconConfig): boolean => pageKey(path, c) !== null;

export function TrackingBeacon({ cfg }: { cfg: TrackingBeaconConfig }) {
  const path = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const key = path ? pageKey(path, cfg) : null;
    if (key === last.current) return;
    last.current = key;
    if (!key || !path) return;
    beacon(TRACKING_BEACON_URL, { method: 'POST', body: JSON.stringify({ path, id: `pv-${newId()}` }), credentials: 'same-origin', headers: { 'content-type': 'text/plain' } });
  }, [path, cfg]);
  return null;
}
