// S21 · PR 417 (§5 REP-07c) — Reports › Site health › Speed: how fast the shop is, month by month, against the targets
// of Website › SEO (`seo.vitals.targets`, PR 10 / 234). Three parts, all read-only:
// - the newest monthly lab run (a phone over slow 4G from the server, and an admin page on a desktop; PR 234
//   `labReport`), page by page with the targets it misses;
// - real visitors' 75th percentile over the last `seo.vitals.days` days (PR 234 `vitalsReport`), phone and desktop;
// - month by month for `health.speed.months` months: real visitors' LCP, CLS, INP and TTFB on a phone (WebVitalDay,
//   summed per month) and that month's lab run (SpeedMeasurement, source "lab": pages, pass, category weight).
// Seeing needs `health.read`. "Measure now" (`settings.write`, audited health.speed.run) only records the press in
// `health.speed.runRequestedAt`; the server's hourly check (vitals-monthly.yml → vitals-lab.sh asked) measures once.
// The months shown are a setting (`health.speed`, `settings.write`, audited health.speed.save). No visitor is ever
// named: the counts are per day and kind of page only.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { dayIn } from '@extas/cache';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { healthSpeedSchema, INSTALLATION, type HealthSpeedSettings, type SeoVitals } from '@extas/settings';
import type { AppResolver } from '../settings';
import { addBuckets, p75, targetOf, type VitalMetric, type VitalTargets } from '../seo/vitals';
import { labReport, vitalsReport, type LabReport, type VitalCell, type VitalsReport } from '../seo/vitals-data';

/** The metrics of the monthly table (FCP is kept but not judged; it has no target). */
export const MONTH_METRICS = ['LCP', 'CLS', 'INP', 'TTFB'] as const satisfies readonly VitalMetric[];
export type MonthMetric = (typeof MONTH_METRICS)[number];

export interface SpeedDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
  /** The server's state folder; default EXTAS_STATE_DIR. */
  stateDir?: string | null;
}
export interface SpeedWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface MonthLab {
  at: string;
  pages: number;
  ok: boolean;
  /** The heaviest category page of the run (KB), against `categoryKb`. */
  categoryKb: number | null;
  /** The slowest shop page's LCP in the run (ms; the admin page is not a shop page). */
  worstLcpMs: number | null;
}
export interface MonthRow {
  /** YYYY-MM in the shop's time zone. */
  month: string;
  /** Real visitors on a phone that month. */
  real: Record<MonthMetric, VitalCell>;
  readings: number;
  lab: MonthLab | null;
}

export interface SpeedCard {
  key: 'speed';
  value: { months: number };
  version: string;
}

export interface SpeedView {
  targets: VitalTargets;
  lab: LabReport | null;
  real: VitalsReport;
  months: MonthRow[];
  /** "Measure now" was pressed and the server has not measured since. */
  runAsked: boolean;
  cards: { speed: SpeedCard };
}

export class SpeedPageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isSpeedPageError = (e: unknown): e is SpeedPageError => e instanceof SpeedPageError;

const S = MOTHER_STORE_ID;
/** The time zone the day counts are kept in (as PR 234 keeps them). */
const timeZone = () => process.env.EXTAS_TIMEZONE || process.env.TZ || 'UTC';
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cardOf = (s: HealthSpeedSettings): SpeedCard => {
  const value = { months: s.months };
  return { key: 'speed', value, version: versionOf(value) };
};

/** YYYY-MM of `ym` moved by `n` months. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** The month (YYYY-MM) a moment falls in, in the time zone. */
export const monthOf = (at: Date, tz: string): string => dayIn(tz, at).slice(0, 7);

/** One cell from a month's buckets against its target. */
export function cellFrom(metric: VitalMetric, counts: number[], target: number | null): VitalCell {
  const p = p75(metric, counts);
  return { p75: p?.value ?? null, over: p?.over ?? false, count: counts.reduce((a, b) => a + b, 0), ok: p && target != null ? !p.over && p.value <= target : null };
}

/** "Measure now" waits while the press is newer than the newest lab run. */
export const speedAsked = (s: HealthSpeedSettings, lab: { at: string } | null): boolean =>
  !!s.runRequestedAt && (!lab || Date.parse(s.runRequestedAt) > Date.parse(lab.at));

async function monthRows(db: PrismaClient, set: SeoVitals, months: number, now: Date): Promise<MonthRow[]> {
  const tz = timeZone();
  const last = monthOf(now, tz);
  const first = addMonths(last, 1 - months);
  const list = Array.from({ length: months }, (_, i) => addMonths(last, -i));
  const from = new Date(`${first}-01T00:00:00Z`);
  const [vitals, labRows] = await Promise.all([
    db.webVitalDay.findMany({ where: { storeId: S, device: 'phone', day: { gte: from }, metric: { in: [...MONTH_METRICS] } }, select: { day: true, metric: true, buckets: true } }),
    // a day early, so a run just after midnight in the shop's zone is not lost
    db.speedMeasurement.findMany({ where: { storeId: S, source: 'lab', measuredAt: { gte: new Date(from.getTime() - 86_400_000) } }, select: { measuredAt: true, pageType: true, lcpMs: true, pageBytes: true, passed: true } }),
  ]);
  const runs = new Map<string, typeof labRows>();
  for (const r of labRows) {
    const key = r.measuredAt.toISOString();
    runs.set(key, [...(runs.get(key) ?? []), r]);
  }
  const labOf = new Map<string, MonthLab>();
  for (const [at, rows] of [...runs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const kb = rows.filter((r) => r.pageType === 'category' && r.pageBytes != null).map((r) => Math.round(r.pageBytes! / 1024));
    const lcp = rows.filter((r) => r.pageType !== 'admin' && r.lcpMs != null).map((r) => r.lcpMs!);
    // the newest run of a month wins
    labOf.set(monthOf(new Date(at), tz), { at, pages: rows.length, ok: rows.every((r) => r.passed !== false), categoryKb: kb.length ? Math.max(...kb) : null, worstLcpMs: lcp.length ? Math.max(...lcp) : null });
  }
  return list.map((month) => {
    const mine = vitals.filter((v) => v.day.toISOString().slice(0, 7) === month);
    const sum = (m: MonthMetric) => mine.filter((v) => v.metric === m).reduce<number[]>((acc, v) => addBuckets(acc, v.buckets), []);
    const real = Object.fromEntries(MONTH_METRICS.map((m) => [m, cellFrom(m, sum(m), targetOf(m, set.targets))])) as Record<MonthMetric, VitalCell>;
    return { month, real, readings: real.LCP.count, lab: labOf.get(month) ?? null };
  });
}

/** The page's data (`health.read`). */
export async function speedView(deps: SpeedDeps, who: SpeedWho): Promise<SpeedView> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [set, speed] = await Promise.all([deps.resolver.value('seo.vitals', { storeId: S }), deps.resolver.value('health.speed')]);
  // the lab run first: reading it keeps a new run in SpeedMeasurement, which the monthly table then reads
  const lab = await labReport(deps.db, S, set, dir);
  const [real, months] = await Promise.all([vitalsReport(deps.db, S, set, dayIn(timeZone(), now)), monthRows(deps.db, set, speed.months, now)]);
  return { targets: set.targets, lab, real, months, runAsked: speedAsked(speed, lab), cards: { speed: cardOf(speed) } };
}

/** The months shown (`settings.write`, audited); the last "Measure now" press is kept as it was. */
export async function saveSpeedCard(deps: SpeedDeps, who: SpeedWho, input: unknown): Promise<SpeedView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'speed') throw new SpeedPageError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('health.speed');
  if (input.version !== cardOf(before).version) throw new SpeedPageError('STALE', 409);
  const value = isObj(input.value) ? input.value : null;
  if (value && 'runRequestedAt' in value) throw new SpeedPageError('INVALID_INPUT', 400, ['runRequestedAt']);
  const ok = healthSpeedSchema.safeParse({ ...value, runRequestedAt: before.runRequestedAt });
  if (!ok.success) throw new SpeedPageError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (ok.data.months !== before.months) {
    await deps.resolver.set('health.speed', ok.data, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health › Speed' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.speed.save', entityType: 'Setting', entityId: 'health.speed', before: { months: before.months }, after: { months: ok.data.months } }, who.ctx);
  }
  return speedView(deps, who);
}

/**
 * "Measure now" (`settings.write`, audited). Records the press; the server's hourly check measures once when the press
 * is newer than its last run. A press while one is still waiting changes nothing.
 */
export async function askSpeedRun(deps: SpeedDeps, who: SpeedWho, input: unknown): Promise<SpeedView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.action !== 'run') throw new SpeedPageError('INVALID_INPUT', 400, ['action']);
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [set, speed] = await Promise.all([deps.resolver.value('seo.vitals', { storeId: S }), deps.resolver.value('health.speed')]);
  const lab = await labReport(deps.db, S, set, dir);
  if (!speedAsked(speed, lab)) {
    const at = (deps.now?.() ?? new Date()).toISOString();
    await deps.resolver.set('health.speed', { ...speed, runRequestedAt: at }, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health › Speed · Measure now' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.speed.run', entityType: 'Setting', entityId: 'health.speed', before: { runRequestedAt: speed.runRequestedAt }, after: { runRequestedAt: at } }, who.ctx);
  }
  return speedView(deps, who);
}
