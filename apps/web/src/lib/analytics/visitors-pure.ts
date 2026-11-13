// S28 · PR 700 — the pure side of the visitors view (no database, no server imports, so the beacon, the ingest and the
// tests all use it): what a page view may carry, how a source, a device and a region are named, and how the counts of a
// day's page views fold into the roll-up rows.

/** The props a page view may carry beyond its page type, and only while `analytics.visitors.collect` is on. */
export const VISITOR_PROP_KEYS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'device', 'path', 'sid'] as const;
export const DEVICES = ['mobile', 'tablet', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];

/** How wide the page is: the usual phone / tablet / laptop break points (what the shop's own layout uses). */
export function deviceOf(width: number): Device {
  if (!Number.isFinite(width) || width < 768) return 'mobile';
  return width < 1100 ? 'tablet' : 'desktop';
}

/** A referrer address as its host only ("google.com"): no path, no query, no `www.`; empty for none or for the shop's own host. */
export function refHost(referrer: unknown, ownHost: string | null): string {
  if (typeof referrer !== 'string' || !referrer.trim()) return '';
  let host = '';
  try {
    host = new URL(referrer.trim()).hostname.toLowerCase();
  } catch {
    host = referrer.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0] ?? '';
  }
  host = host.replace(/^www\./, '').slice(0, 80);
  const own = (ownHost ?? '').toLowerCase().replace(/^www\./, '');
  return host && host !== own ? host : '';
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * The visitor props that may be stored for one page view. With collect off: none (the event keeps only its page type, as
 * before). On: the whitelisted keys, each shaped (a referrer is a host, a path has no query, a device is one of three),
 * plus the coarse region the CDN reports. Anything else the browser sent is dropped; an IP, a name or a phone never is a key.
 */
export function visitorProps(raw: unknown, o: { collect: boolean; region: string | null; ownHost: string | null }): Record<string, string> {
  if (!o.collect) return {};
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  const ref = refHost(r.ref, o.ownHost);
  if (ref) out.ref = ref;
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const v = text(r[k], 60).toLowerCase();
    if (v) out[k] = v;
  }
  const device = text(r.device, 10);
  if ((DEVICES as readonly string[]).includes(device)) out.device = device;
  const path = text(r.path, 200).split(/[?#]/)[0] ?? '';
  if (path.startsWith('/') && !path.startsWith('//')) out.path = path.slice(0, 120);
  const sid = text(r.sid, 40);
  if (/^[A-Za-z0-9_-]{6,40}$/.test(sid)) out.sid = sid;
  const region = text(o.region, 60);
  if (region) out.region = region;
  return out;
}

/** The source name of one page view: the UTM source, else the referrer host, else "direct". */
export function sourceOf(props: Record<string, unknown> | null): string {
  const p = props ?? {};
  const utm = typeof p.utm_source === 'string' ? p.utm_source.trim().toLowerCase() : '';
  if (utm) return utm;
  const ref = typeof p.ref === 'string' ? p.ref.trim().toLowerCase() : '';
  return ref || 'direct';
}

export interface ViewFact {
  visitorId: string;
  props: Record<string, unknown> | null;
  pageType: string | null;
}

export interface DayRow {
  dim: 'all' | 'source' | 'page' | 'device' | 'region' | 'path';
  key: string;
  views: number;
  visitors: number;
  sessions: number;
}

/** Folds one day's page views into the roll-up rows (the totals, then each dimension's values). */
export function foldDay(facts: readonly ViewFact[]): DayRow[] {
  type Acc = { views: number; visitors: Set<string>; sessions: Set<string> };
  const map = new Map<string, Acc>();
  const add = (dim: DayRow['dim'], key: string, f: ViewFact) => {
    const id = `${dim}\u0000${key}`;
    const a = map.get(id) ?? { views: 0, visitors: new Set<string>(), sessions: new Set<string>() };
    a.views += 1;
    a.visitors.add(f.visitorId);
    const sid = typeof f.props?.sid === 'string' ? f.props.sid : f.visitorId;
    a.sessions.add(sid);
    map.set(id, a);
  };
  for (const f of facts) {
    const p = f.props ?? {};
    add('all', '', f);
    add('source', sourceOf(f.props), f);
    add('page', f.pageType ?? 'other', f);
    if (typeof p.device === 'string' && p.device) add('device', p.device, f);
    if (typeof p.region === 'string' && p.region) add('region', p.region, f);
    if (typeof p.path === 'string' && p.path) add('path', p.path, f);
  }
  return [...map.entries()].map(([id, a]) => {
    const [dim, key] = id.split('\u0000') as [DayRow['dim'], string];
    return { dim, key, views: a.views, visitors: a.visitors.size, sessions: a.sessions.size };
  });
}

/** Sums rows of one dimension over days: views and the daily visitors added up, biggest first, cut to `top`. */
export function sumDim(rows: readonly { dim: string; key: string; views: number; visitors: number }[], dim: string, top: number): { key: string; views: number; visitors: number }[] {
  const m = new Map<string, { views: number; visitors: number }>();
  for (const r of rows) if (r.dim === dim) {
    const a = m.get(r.key) ?? { views: 0, visitors: 0 };
    a.views += r.views;
    a.visitors += r.visitors;
    m.set(r.key, a);
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.views - a.views || (a.key < b.key ? -1 : 1)).slice(0, top);
}
