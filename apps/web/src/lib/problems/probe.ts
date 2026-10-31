// S21 · PR 423 (CN-015) — the browser half of the customer problem recorder, without the page: the parts that decide
// (rage clicks, a form field refused again and again, which call is the shop's own and failed or slow, what one page
// view may send) and the sending itself. components/shop/ProblemProbe.tsx wires them to the page; app/global-error.tsx
// reports the error screen through `reportErrorScreen`. It never reads what anyone typed: a form field is named by its
// `name` or `id`, a click by its tag and test id or id; no text of the page is sent.
import { PROBLEMS_REPORT_PATH } from '../security/edge-gate';
import { beacon } from '../shop/beacon';

export type ProbeKind = 'script_error' | 'request_failed' | 'slow_request' | 'page_failed' | 'error_screen' | 'form_stuck' | 'rage_click' | 'broken_image' | 'slow_load';

export interface ProbeConfig {
  storeId: number;
  slowRequestMs: number;
  slowLoadMs: number;
  rageClicks: number;
  formErrorRepeats: number;
  maxPerPage: number;
}

export interface ProbeItem {
  k: ProbeKind;
  d: string;
  ms?: number;
}

/** A rage click: this many clicks within RAGE_WINDOW_MS, each within RAGE_RADIUS_PX of the first. */
export const RAGE_WINDOW_MS = 1_000; // hardcode-ok: what "rapid clicks on one spot" means; the count is the setting
export const RAGE_RADIUS_PX = 30; // hardcode-ok: one spot on a phone screen (a finger's width)

/** Counts clicks on one spot; says once when they reach the setting's count. */
export class RageClicks {
  private start = 0;
  private x = 0;
  private y = 0;
  private count = 0;
  private told = false;

  constructor(private readonly needed: number) {}

  /** True exactly when this click makes it a rage click. */
  click(t: number, x: number, y: number): boolean {
    if (t - this.start > RAGE_WINDOW_MS || Math.hypot(x - this.x, y - this.y) > RAGE_RADIUS_PX) {
      this.start = t;
      this.x = x;
      this.y = y;
      this.count = 0;
      this.told = false;
    }
    this.count += 1;
    if (this.count >= this.needed && !this.told) {
      this.told = true;
      return true;
    }
    return false;
  }
}

/** Counts each form field's refusals in a page view; says once when one reaches the setting's count. */
export class StuckFields {
  private readonly seen = new Map<string, number>();

  constructor(private readonly needed: number) {}

  refused(field: string): boolean {
    const n = (this.seen.get(field) ?? 0) + 1;
    this.seen.set(field, n);
    return n === this.needed;
  }

  reset(): void {
    this.seen.clear();
  }
}

/** One page view's reports: each cause once, at most `max`; a new page starts afresh. */
export class PageReports {
  private keys = new Set<string>();
  private path = '';

  constructor(private readonly max: number) {}

  /** True when this item may be sent for `path`. */
  take(path: string, item: ProbeItem): boolean {
    if (path !== this.path) {
      this.path = path;
      this.keys = new Set();
    }
    const key = `${item.k}|${item.d}`;
    if (this.keys.has(key) || this.keys.size >= this.max) return false;
    this.keys.add(key);
    return true;
  }
}

/** What a resource timing entry says, or null when it is not the shop's own call or is fine. */
export function judgeCall(
  e: {
    name: string;
    initiatorType: string;
    duration: number;
    responseStatus?: number;
  },
  origin: string,
  slowMs: number,
): ProbeItem | null {
  let u: URL;
  try {
    u = new URL(e.name);
  } catch {
    return null;
  }
  if (u.origin !== origin || u.pathname === PROBLEMS_REPORT_PATH) return null;
  if (!['fetch', 'xmlhttprequest'].includes(e.initiatorType)) return null;
  const status = e.responseStatus ?? 0;
  if (status >= 500) return { k: 'request_failed', d: `${u.pathname} ${status}` };
  if (e.duration > slowMs) return { k: 'slow_request', d: u.pathname, ms: Math.round(e.duration) };
  return null;
}

/** What names an element for a report: its tag, and its test id or id (never its text). */
export function nameOf(el: Element | null): string {
  if (!el) return '?';
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('data-testid') ?? el.id;
  return id ? `${tag}#${id.slice(0, 60)}` : tag;
}

const VISITOR_KEY = 'extas.pv';

/** A random id for this browser tab (never linked to anyone); a new one when storage is refused. */
export function visitorId(): string {
  const fresh = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  try {
    const had = window.sessionStorage.getItem(VISITOR_KEY);
    if (had && /^[A-Za-z0-9-]{8,64}$/.test(had)) return had;
    const v = fresh();
    window.sessionStorage.setItem(VISITOR_KEY, v);
    return v;
  } catch {
    return fresh();
  }
}

/** The network type the browser says it is on, when it says. */
export function networkOf(): string | null {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  const t = c?.effectiveType;
  return t && ['slow-2g', '2g', '3g', '4g'].includes(t) ? t : null;
}

/** Sends one page's reports without holding the page (a beacon; a quiet fetch when beacons are not there). */
export function send(items: ProbeItem[], storeId: number | null): void {
  if (!items.length) return;
  const body = JSON.stringify({
    ...(storeId ? { s: storeId } : {}),
    v: visitorId(),
    p: window.location.pathname,
    n: networkOf(),
    r: items,
  });
  try {
    if (navigator.sendBeacon?.(PROBLEMS_REPORT_PATH, new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    /* fall through to fetch */
  }
  beacon(PROBLEMS_REPORT_PATH, { method: 'POST', body, credentials: 'same-origin', headers: { 'content-type': 'text/plain' } });
}

/** PR 423 + CN-032: the error screen reports itself (the server keeps it only while the recorder is on). */
export function reportErrorScreen(detail: string | undefined): void {
  try {
    send([{ k: 'error_screen', d: (detail ?? '').slice(0, 300) }], null);
  } catch {
    /* the error screen must never fail because of its report */
  }
}
