// S11 · PR 234 — Core Web Vitals on the database and the server's state folder:
// - POST /api/shop/vitals (public): one reading from a real visitor's page, counted in its day's bucket (WebVitalDay),
//   never who sent it. Only while `seo.vitals.collect` is on; a reading that is not real, or comes from the shop's own
//   test browsers (they would skew the real visitors' figures), is dropped quietly (204).
// - `vitalsReport`: the 75th percentile of the last `seo.vitals.days` days, per metric, on a phone and on a desktop, and
//   per kind of page, against the targets.
// - `labReport`: the monthly lab run (infra/deploy/vitals-lab.sh writes state/vitals-lab.json); each new run is kept in
//   SpeedMeasurement (source "lab", one row per page) the first time the admin reads it.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dayIn } from '@extas/cache';
import { getPrisma, type PrismaClient } from '@extas/db/client';
import type { SeoVitals } from '@extas/settings';
import { readPageSettings } from '../shop/context';
import { shopStoreId } from '../shop/store-id';
import { addBuckets, BUCKETS, bucketOf, DEVICES, isVitalMetric, labMisses, p75, PAGE_KINDS, pageKindOf, targetOf, VITAL_METRICS, vitalUnits, type Device, type LabPage, type PageKind, type VitalMetric } from './vitals';

/** The store's time zone for the day a reading counts in (as the cache and the reports use). */
const timeZone = () => process.env.EXTAS_TIMEZONE || process.env.TZ || 'UTC';
/** The largest reading body accepted (one metric, one address). */
const MAX_BODY = 1024;
/** The longest page address kept for its kind (the address itself is never stored). */
const MAX_PATH = 512;
/** The shop's own test browsers (the smoke test, the saved journeys, the monthly lab run) are not real visitors. */
const TEST_BROWSER = /HeadlessChrome|Playwright/i;

export interface VitalReading {
  metric: VitalMetric;
  value: number;
  path: string;
  device: Device;
}

/** A reading as the page sends it (`{m, v, p, d}`), or null. */
export function readingOf(body: unknown): VitalReading | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!isVitalMetric(b.m) || typeof b.v !== 'number' || typeof b.p !== 'string' || !b.p.startsWith('/') || b.p.length > MAX_PATH) return null;
  if (b.d !== 'phone' && b.d !== 'desktop') return null;
  return { metric: b.m, value: b.v, path: b.p, device: b.d };
}

/** Counts one reading in its day's bucket (one statement: two readings at once both count). */
export async function recordVital(db: PrismaClient, storeId: number, r: VitalReading, productPrefix: string, day = dayIn(timeZone())): Promise<boolean> {
  const units = vitalUnits(r.metric, r.value);
  if (units == null) return false;
  const i = bucketOf(r.metric, units);
  // A new row holds every bucket (Postgres would fill a gap with nulls), so the update stays inside it
  const fresh = new Array<number>(BUCKETS[r.metric].length + 1).fill(0);
  fresh[i] = 1;
  const kind = pageKindOf(r.path, productPrefix);
  // Postgres arrays count from 1
  await db.$executeRaw`INSERT INTO "WebVitalDay" ("id","storeId","day","metric","pageKind","device","buckets","count","updatedAt") VALUES (${randomUUID()}::uuid, ${storeId}, ${day}::date, ${r.metric}, ${kind}, ${r.device}, ${fresh}::int[], 1, now()) ON CONFLICT ("storeId","day","metric","pageKind","device") DO UPDATE SET "buckets"[${i + 1}::int] = COALESCE("WebVitalDay"."buckets"[${i + 1}::int], 0) + 1, "count" = "WebVitalDay"."count" + 1, "updatedAt" = now()`;
  return true;
}

/** POST /api/shop/vitals — one reading from a shop page. Always 204: a page never waits on it or learns anything. */
export async function vitalsHandler(request: Request): Promise<Response> {
  const none = () => new Response(null, { status: 204 });
  if (!process.env.DATABASE_URL) return none();
  if (TEST_BROWSER.test(request.headers.get('user-agent') ?? '')) return none();
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return none();
    const r = readingOf(JSON.parse(text));
    if (!r) return none();
    const storeId = shopStoreId();
    const { 'seo.vitals': set, 'naming.productPathPrefix': prefix } = await readPageSettings(['seo.vitals', 'naming.productPathPrefix'] as const, storeId);
    if (!set.collect) return none();
    await recordVital(getPrisma(), storeId, r, prefix);
  } catch {
    /* a lost reading changes nothing */
  }
  return none();
}

export interface VitalCell {
  /** The 75th percentile in the metric's units (ms, or layout shift × 1000), null with no reading. */
  p75: number | null;
  over: boolean;
  count: number;
  /** Under the target (null: no target, or no reading). */
  ok: boolean | null;
}
export interface VitalsReport {
  days: number;
  from: string;
  to: string;
  /** Per metric, per device. */
  overall: Record<VitalMetric, Record<Device, VitalCell>>;
  /** LCP on a phone per kind of page (the kinds with readings). */
  lcpByKind: { kind: PageKind; cell: VitalCell }[];
  total: number;
}

const cellOf = (metric: VitalMetric, counts: number[], target: number | null): VitalCell => {
  const p = p75(metric, counts);
  const count = counts.reduce((a, b) => a + b, 0);
  return { p75: p?.value ?? null, over: p?.over ?? false, count, ok: p && target != null ? !p.over && p.value <= target : null };
};

/** The last `days` days (today included) as the admin reads them. */
export async function vitalsReport(db: PrismaClient, storeId: number, set: SeoVitals, today = dayIn(timeZone())): Promise<VitalsReport> {
  const to = new Date(`${today}T00:00:00Z`);
  const from = new Date(to.getTime() - (set.days - 1) * 86_400_000);
  const rows = await db.webVitalDay.findMany({ where: { storeId, day: { gte: from, lte: to } }, select: { metric: true, pageKind: true, device: true, buckets: true } });
  const sum = (pick: (r: (typeof rows)[number]) => boolean) => rows.filter(pick).reduce<number[]>((acc, r) => addBuckets(acc, r.buckets), []);
  const overall = Object.fromEntries(
    VITAL_METRICS.map((m) => [m, Object.fromEntries(DEVICES.map((d) => [d, cellOf(m, sum((r) => r.metric === m && r.device === d), targetOf(m, set.targets))]))]),
  ) as VitalsReport['overall'];
  const lcpByKind = PAGE_KINDS.map((kind) => ({ kind, cell: cellOf('LCP', sum((r) => r.metric === 'LCP' && r.device === 'phone' && r.pageKind === kind), set.targets.lcpMs) })).filter((x) => x.cell.count > 0);
  const total = rows.filter((r) => r.metric === 'LCP').reduce((a, r) => a + r.buckets.reduce((x, y) => x + (y ?? 0), 0), 0);
  return { days: set.days, from: from.toISOString().slice(0, 10), to: today, overall, lcpByKind, total };
}

/** state/vitals-lab.json as the monthly run writes it. */
export interface LabFile {
  at: string;
  sha?: string;
  profile?: string;
  pages: LabPage[];
}
export interface LabReport {
  at: string;
  profile: string | null;
  pages: (LabPage & { misses: string[] })[];
  ok: boolean;
}

const isLab = (x: unknown): x is LabFile => !!x && typeof x === 'object' && typeof (x as LabFile).at === 'string' && Array.isArray((x as LabFile).pages);

/** The newest monthly run (null before the first), kept in SpeedMeasurement the first time it is read. */
export async function labReport(db: PrismaClient, storeId: number, set: SeoVitals, dir = process.env.EXTAS_STATE_DIR || null): Promise<LabReport | null> {
  if (!dir) return null;
  let file: LabFile;
  try {
    const parsed = JSON.parse(await readFile(join(dir, 'vitals-lab.json'), 'utf8')) as unknown;
    if (!isLab(parsed) || Number.isNaN(Date.parse(parsed.at))) return null;
    file = parsed;
  } catch {
    return null;
  }
  const at = new Date(file.at);
  const pages = file.pages.filter((p) => p && typeof p.path === 'string').map((p) => ({ ...p, misses: labMisses(p, set.targets) }));
  if (!(await db.speedMeasurement.findFirst({ where: { storeId, source: 'lab', measuredAt: at }, select: { id: true } }))) {
    await db.speedMeasurement.createMany({
      data: pages.map((p) => ({
        storeId,
        source: 'lab',
        pageType: p.kind,
        url: p.path,
        lcpMs: p.lcpMs ?? null,
        cls: p.cls ?? null,
        ttfbMs: p.ttfbMs ?? null,
        pageBytes: p.kb != null ? Math.round(p.kb * 1024) : null,
        passed: p.misses.length === 0,
        measuredAt: at,
      })),
    });
  }
  return { at: file.at, profile: file.profile ?? null, pages, ok: pages.every((p) => p.misses.length === 0) };
}
