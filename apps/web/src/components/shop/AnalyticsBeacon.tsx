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
import { deviceOf } from '@/lib/analytics/visitors-pure';
import { pageKindOf } from '@/lib/website/page-kind';

export const ANALYTICS_BEACON_URL = '/api/shop/analytics';

export interface AnalyticsBeaconConfig {
  productPrefix: string;
  /** S28 · PR 700: the owner has the visitors view on, so a page view also says where it came from and on what device. */
  collect?: boolean;
}

const SESSION_KEY = 'extas_sid';
const newSid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

/** The visitor props of one page view (only sent while `collect`): the referrer, UTM tags, device size, path, session. */
function visitorFields(): Record<string, string> {
  const q = new URLSearchParams(window.location.search);
  let sid = '';
  try {
    sid = window.sessionStorage.getItem(SESSION_KEY) ?? '';
    if (!sid) {
      sid = newSid();
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
  } catch {
    sid = '';
  }
  const out: Record<string, string> = { ref: document.referrer, device: deviceOf(window.innerWidth), path: window.location.pathname };
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = q.get(k);
    if (v) out[k] = v;
  }
  if (sid) out.sid = sid;
  return out;
}

export function AnalyticsBeacon({ cfg }: { cfg: AnalyticsBeaconConfig }) {
  const path = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!path || path === last.current) return;
    last.current = path;
    beacon(ANALYTICS_BEACON_URL, {
      method: 'POST',
      body: JSON.stringify({ name: 'page_view', pageType: pageKindOf(path, cfg.productPrefix), ...(cfg.collect ? { props: visitorFields() } : {}) }),
      credentials: 'same-origin',
      headers: { 'content-type': 'text/plain' },
    });
  }, [path, cfg]);
  return null;
}
