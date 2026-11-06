// S12 · PR 250 — the content performance report's pure rules (no database, no React; tested in
// performance-model.test.ts): the shop's own read cookie (which articles this browser read, and when — ids and times
// only), where a reader came from, which reads an order credits, and the report's rows. The database side is
// performance.ts; the money of the rows always comes from @extas/metrics (Sales = delivered, Ordered value beside it).
import { hostOf, sourceNamed, ymdIn, type OrganicSource } from '@extas/metrics/pure';
import type { BlogPerformanceSettings } from '@extas/settings';

/** The read cookie: `__Host-` (this site only, path /), HttpOnly; its days are `blog.performance.windowDays`. */
export const READ_COOKIE = '__Host-extas_read';
/** The most reads the cookie keeps (the newest ones). */
export const READS_MAX = 10; // hardcode-ok: a cookie size limit (ten ids fit well under 4 KB), not a business number
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEC = /^\d{1,11}$/;
const DAY_MS = 86_400_000; // hardcode-ok: the length of a day

/** One article this browser read, and when (ms). */
export interface Read {
  postId: string;
  at: number;
}

/** The cookie's reads (anything that does not look like one is dropped; the newest READS_MAX are kept). */
export function parseReads(raw: string | null | undefined): Read[] {
  if (!raw) return [];
  const out: Read[] = [];
  for (const part of raw.split('_')) {
    const [postId, sec] = part.split('.');
    if (!postId || !sec || !UUID.test(postId) || !SEC.test(sec)) continue;
    out.push({ postId, at: Number(sec) * 1000 });
  }
  return out.slice(-READS_MAX);
}

export const serializeReads = (reads: readonly Read[]): string => reads.map((r) => `${r.postId}.${Math.floor(r.at / 1000)}`).join('_');

/** The reads with this one as the newest (an earlier read of the same article is moved, not repeated). */
export function addRead(reads: readonly Read[], postId: string, at: number): Read[] {
  return [...reads.filter((r) => r.postId !== postId), { postId, at }].slice(-READS_MAX);
}

/** This browser already read the article on this shop day (it is counted once a day). */
export function readToday(reads: readonly Read[], postId: string, now: Date, timeZone: string): boolean {
  const today = ymdIn(now, timeZone);
  return reads.some((r) => r.postId === postId && ymdIn(new Date(r.at), timeZone) === today);
}

export type ReadOrigin = 'search' | 'shop' | 'other';

/**
 * Where a reader came from: `shop` (the page says it came from the shop's own pages), `search` (the other site is one of
 * the SEO organic list's search engines, video sites or AI assistants), otherwise `other` (another site, or nothing).
 */
export function readOrigin(from: unknown, sources: readonly OrganicSource[]): ReadOrigin {
  if (from === 'shop') return 'shop';
  const host = typeof from === 'string' ? hostOf(from) : null;
  return host && sourceNamed(host, sources) !== null ? 'search' : 'other';
}

/**
 * The reads an order credits: read at or before the order and within `windowDays` of it; `last` keeps only the newest
 * (an order is never counted twice), `every` keeps each article read in the window.
 */
export function creditedReads(reads: readonly Read[], placedAt: Date, s: Pick<BlogPerformanceSettings, 'windowDays' | 'credit'>): Read[] {
  const to = placedAt.getTime();
  const from = to - s.windowDays * DAY_MS;
  const inWindow = reads.filter((r) => r.at <= to && r.at >= from);
  if (s.credit === 'every' || inWindow.length <= 1) return inWindow;
  return [inWindow.reduce((a, b) => (b.at > a.at ? b : a))];
}

/** One order figure as the report shows it (from @extas/metrics). */
export interface Figure {
  orders: number;
  valueMinor: number;
}
export interface ArticleTraffic {
  readers: number;
  fromSearch: number;
  fromShop: number;
  fromOther: number;
}
export interface ArticleRow extends ArticleTraffic {
  id: string;
  title: string;
  locale: string;
  live: boolean;
  /** Ordered value: the orders placed in the period that read it. */
  ordered: Figure;
  /** Sales: the orders delivered in the period that read it. */
  sales: Figure;
  /** Orders placed per 100 readers (one decimal); null with no readers. */
  perHundred: number | null;
}

const none = (): Figure => ({ orders: 0, valueMinor: 0 });
export const NO_TRAFFIC: ArticleTraffic = Object.freeze({ readers: 0, fromSearch: 0, fromShop: 0, fromOther: 0 });

/**
 * The report's rows: every article that is live or had readers or orders in the period, Sales first, then Ordered value,
 * then readers. Articles that the period never touched and are not live are left out.
 */
export function articleRows(
  posts: readonly { id: string; title: string; locale: string; live: boolean }[],
  traffic: ReadonlyMap<string, ArticleTraffic>,
  money: ReadonlyMap<string, { ordered: Figure; sales: Figure }>,
): ArticleRow[] {
  const rows: ArticleRow[] = [];
  for (const p of posts) {
    const tr = traffic.get(p.id) ?? NO_TRAFFIC;
    const m = money.get(p.id);
    const ordered = m ? { orders: m.ordered.orders, valueMinor: m.ordered.valueMinor } : none();
    const sales = m ? { orders: m.sales.orders, valueMinor: m.sales.valueMinor } : none();
    if (!p.live && !tr.readers && !ordered.orders && !sales.orders) continue;
    const perHundred = tr.readers > 0 ? Math.round((ordered.orders * 1000) / tr.readers) / 10 : null;
    rows.push({ id: p.id, title: p.title, locale: p.locale, live: p.live, ...tr, ordered, sales, perHundred });
  }
  return rows.sort(
    (a, b) => b.sales.valueMinor - a.sales.valueMinor || b.ordered.valueMinor - a.ordered.valueMinor || b.ordered.orders - a.ordered.orders || b.readers - a.readers || a.title.localeCompare(b.title),
  );
}

/** The report's period: the last `days` shop days to today, or the owner's own pick (1–365 days). */
export const PERIOD_CHOICES = [7, 30, 90] as const; // hardcode-ok: the period buttons offered beside the owner's own default
