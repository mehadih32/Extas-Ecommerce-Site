// S11 · PR 234 — Core Web Vitals, pure: the readings a shop page reports, the buckets they are counted in, the 75th
// percentile read back from the counts, the kind of page an address is, and the targets each is judged against
// (`seo.vitals.targets`, PR 10). Browser-safe (the reporter uses `VITAL_METRICS` and `deviceOf`).

export const VITAL_METRICS = ['LCP', 'CLS', 'INP', 'TTFB', 'FCP'] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];
export const isVitalMetric = (x: unknown): x is VitalMetric => typeof x === 'string' && (VITAL_METRICS as readonly string[]).includes(x);

/** Times in milliseconds. */
const TIME_BUCKETS = [100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000, 15000, 20000];
/** Layout shift × 1000 (0.1 = 100). */
const SHIFT_BUCKETS = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
/**
 * The upper limit of each bucket (technical: how finely the percentile is read, not a target); one more bucket counts
 * everything above the last limit. Changing a list makes old rows unreadable, so a new list needs a new metric name.
 */
export const BUCKETS: Record<VitalMetric, readonly number[]> = { LCP: TIME_BUCKETS, INP: TIME_BUCKETS, TTFB: TIME_BUCKETS, FCP: TIME_BUCKETS, CLS: SHIFT_BUCKETS };
/** The longest reading kept (a minute; anything longer is a tab left in the background). */
const MAX_TIME_MS = 60_000;
/** The largest layout shift kept (a page that moves more than ten screens is a broken reading). */
const MAX_SHIFT = 10;

/** A reading in the unit its buckets count: milliseconds, or layout shift × 1000. Null when it is no real reading. */
export function vitalUnits(metric: VitalMetric, value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  if (metric === 'CLS') return value > MAX_SHIFT ? null : Math.round(value * 1000);
  return value > MAX_TIME_MS ? null : Math.round(value);
}

/** The bucket a reading (in its units) falls in. */
export function bucketOf(metric: VitalMetric, units: number): number {
  const limits = BUCKETS[metric];
  const i = limits.findIndex((l) => units <= l);
  return i === -1 ? limits.length : i;
}

/** Adds counts bucket by bucket (rows of one metric). */
export function addBuckets(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

/**
 * The 75th percentile from the counts, in the metric's units, read inside its bucket as if the readings were spread
 * evenly (`over`: it lies above the last limit, the value is that limit). Null with no reading.
 */
export function p75(metric: VitalMetric, counts: readonly number[]): { value: number; over: boolean } | null {
  const total = counts.reduce((x, y) => x + y, 0);
  if (!total) return null;
  const limits = BUCKETS[metric];
  const want = total * 0.75;
  let seen = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const n = counts[i] ?? 0;
    if (n && seen + n >= want) {
      if (i >= limits.length) return { value: limits[limits.length - 1]!, over: true };
      const low = i === 0 ? 0 : limits[i - 1]!;
      return { value: Math.round(low + (limits[i]! - low) * ((want - seen) / n)), over: false };
    }
    seen += n;
  }
  return { value: limits[limits.length - 1]!, over: true };
}

export const PAGE_KINDS = ['home', 'category', 'product', 'combo', 'help', 'search', 'checkout', 'account', 'other'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** The kind of shop page an address is (either language); `productPrefix` is `naming.productPathPrefix`. */
export function pageKindOf(path: string, productPrefix: string): PageKind {
  const p = (path.split(/[?#]/)[0] ?? '/').replace(/^\/bn(?=\/|$)/, '') || '/';
  const first = p.split('/')[1] ?? '';
  if (p === '/') return 'home';
  if (first === 'collections') return 'category';
  if (first === productPrefix.replace(/^\/+|\/+$/g, '')) return 'product';
  if (first === 'combo' || first === 'combos') return 'combo';
  if (first === 'help') return 'help';
  if (first === 'search') return 'search';
  if (first === 'bag' || first === 'checkout') return 'checkout';
  if (first === 'account') return 'account';
  return 'other';
}

export const DEVICES = ['phone', 'desktop'] as const;
export type Device = (typeof DEVICES)[number];
/** Phone below the admin's and the shop's tablet width. */
export const deviceOf = (viewportWidth: number): Device => (viewportWidth < 768 ? 'phone' : 'desktop');

export interface VitalTargets {
  lcpMs: number;
  clsThousandths: number;
  inpMs: number;
  ttfbMs: number;
  categoryKb: number;
  adminMs: number;
}

/** The target a metric is judged against (FCP has none: shown for reading only). */
export function targetOf(metric: VitalMetric, t: VitalTargets): number | null {
  return metric === 'LCP' ? t.lcpMs : metric === 'CLS' ? t.clsThousandths : metric === 'INP' ? t.inpMs : metric === 'TTFB' ? t.ttfbMs : null;
}

/** A value as the admin shows it: layout shift as 0.08, a time under a second in ms, longer in seconds (one decimal). */
export function formatVital(metric: VitalMetric, units: number, locale: string): string {
  const n = (x: number, digits: number) => new Intl.NumberFormat(locale, { numberingSystem: 'latn', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
  if (metric === 'CLS') return n(units / 1000, 2);
  return units < 1000 ? `${n(units, 0)} ms` : `${n(units / 1000, 1)} s`;
}

/** One page of the monthly lab run, as the run writes it (vitals-lab.json). */
export interface LabPage {
  path: string;
  kind: PageKind | 'admin';
  lcpMs?: number | null;
  cls?: number | null;
  ttfbMs?: number | null;
  kb?: number | null;
  loadMs?: number | null;
}

/** Which targets a lab page misses (empty = it passes). Weight is judged on category pages, load time on the admin. */
export function labMisses(p: LabPage, t: VitalTargets): string[] {
  const miss: string[] = [];
  if (p.lcpMs != null && p.lcpMs > t.lcpMs) miss.push('LCP');
  if (p.cls != null && Math.round(p.cls * 1000) > t.clsThousandths) miss.push('CLS');
  if (p.ttfbMs != null && p.ttfbMs > t.ttfbMs) miss.push('TTFB');
  if (p.kind === 'category' && p.kb != null && p.kb > t.categoryKb) miss.push('weight');
  if (p.kind === 'admin' && p.loadMs != null && p.loadMs > t.adminMs) miss.push('admin');
  return miss;
}
