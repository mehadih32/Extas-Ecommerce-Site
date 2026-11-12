'use client';
// S15 · PR 338 (Blueprint D5, "Analytics — Locked") — the shop's own analytics beacon, drawn by the shop layout while
// `analytics.events` is on. Fires one `page_view` on every page the shopper lands on, with the page's kind (home,
// category, bag, checkout, product, other — the same classifier the on-page edit bar already uses, PR 600's own
// `pageKindOf`). This runs beside, never instead of, PR 257's own TrackingBeacon: that one feeds the ad platforms and
// is gated by `ads.tracking`'s own ticked events; this one feeds the owner's own Analytics section (PR 339–341) and
// has no outside dependency, so it is on by default. Reads nothing typed, draws nothing, never holds the page up
// (lib/shop/beacon.ts's fire-and-forget fetch; a failed send is simply one event missed, D5.3's own "tracking can
// fail, the shop cannot").
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { beacon } from '@/lib/shop/beacon';
import { pageKindOf } from '@/lib/website/page-edit-model';

export const ANALYTICS_BEACON_URL = '/api/shop/analytics';

export interface AnalyticsBeaconConfig {
  productPrefix: string;
}

export function AnalyticsBeacon({ cfg }: { cfg: AnalyticsBeaconConfig }) {
  const path = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!path || path === last.current) return;
    last.current = path;
    beacon(ANALYTICS_BEACON_URL, {
      method: 'POST',
      body: JSON.stringify({ name: 'page_view', pageType: pageKindOf(path, cfg.productPrefix) }),
      credentials: 'same-origin',
      headers: { 'content-type': 'text/plain' },
    });
  }, [path, cfg]);
  return null;
}
