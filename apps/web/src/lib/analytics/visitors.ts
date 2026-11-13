// S28 · PR 700 (admin prototype v5, GAP-MAP part 3 W6 / N8) — Website → Analytics → Overview: visitors, sessions, live now,
// sources, top pages, devices, regions, visit-to-order and the daily chart, from the shop's own page views
// (AnalyticsEvent `page_view`, the layer PR 338 built) folded into a daily roll-up (`PageViewDay`).
//   - The page view carries only its page type unless the owner turned `analytics.visitors` collect on; then it also carries
//     the referrer's host, UTM tags, device size, the path without its query and the CDN's coarse region (visitors-pure.ts).
//     Never an IP, a name or a phone.
//   - The roll-up for a day is rebuilt from the events when the Overview is read: today every time, a past day once.
//     Rows older than `keepDays` are removed (the roll-up only: the shop's events are never touched).
//   - "Live now" is the distinct visitors with any event in the last `liveWindowMinutes`.
//   - Visit-to-order is the orders placed (not cancelled) over the distinct visitors of the same days.
// Needs `reports.read`.
import { z } from 'zod';
import { requirePermission, type Actor } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { dayStart, nextDay, ymdIn } from '@extas/metrics';
import { storeTarget, type AnalyticsVisitorsSettings } from '@extas/settings';
import { audit, type RequestContext } from '@extas/auth';
import { errorResponse, fail, guardAdmin, json, body, type AdminDeps } from '../admin-auth';
import { requireOwnerPin } from '../owner-pin';
import { foldDay, sumDim, type DayRow, type ViewFact } from './visitors-pure';

export * from './visitors-pure';

type Db = PrismaClient;
const PAGE = 5000; // hardcode-ok: a read batch size, not a business number

const addDays = (ymd: string, n: number): string => {
  let d = ymd;
  for (let i = 0; i < Math.abs(n); i++) d = n > 0 ? nextDay(d) : new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return d;
};

/** Rebuilds one shop day's roll-up rows from its page views (in one transaction: the day's old rows go, the new come). */
export async function rollUpDay(db: Db, storeId: number, ymd: string, tz: string): Promise<number> {
  const from = dayStart(ymd, tz);
  const to = dayStart(nextDay(ymd), tz);
  const facts: ViewFact[] = [];
  let cursor: string | null = null;
  for (;;) {
    const rows: { id: string; visitorId: string; pageType: string | null; props: unknown }[] = await db.analyticsEvent.findMany({
      where: { storeId, name: 'page_view', occurredAt: { gte: from, lt: to } },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, visitorId: true, pageType: true, props: true },
    });
    for (const r of rows) facts.push({ visitorId: r.visitorId, pageType: r.pageType, props: (r.props as Record<string, unknown> | null) ?? null });
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1]!.id;
  }
  const rows = foldDay(facts);
  const day = new Date(`${ymd}T00:00:00.000Z`);
  await db.$transaction([
    db.pageViewDay.deleteMany({ where: { storeId, day } }),
    // a day with no views still gets its totals row, so it counts as rolled up
    db.pageViewDay.createMany({ data: (rows.length ? rows : ([{ dim: 'all', key: '', views: 0, visitors: 0, sessions: 0 }] as DayRow[])).map((r) => ({ storeId, day, dim: r.dim, key: r.key, views: r.views, visitors: r.visitors, sessions: r.sessions })) }),
  ]);
  return facts.length;
}

/** Rolls up the days of [from, to] that are missing (and today, always), and removes the days older than `keepDays`. */
export async function ensureRollups(db: Db, storeId: number, from: string, to: string, tz: string, today: string, keepDays: number): Promise<void> {
  const have = new Set((await db.pageViewDay.findMany({ where: { storeId, dim: 'all', day: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } }, select: { day: true } })).map((r) => r.day.toISOString().slice(0, 10)));
  for (let d = from; d <= to; d = nextDay(d)) if (d === today || !have.has(d)) await rollUpDay(db, storeId, d, tz);
  await db.pageViewDay.deleteMany({ where: { storeId, day: { lt: new Date(`${addDays(today, -keepDays)}T00:00:00.000Z`) } } });
}

export interface VisitorsView {
  cfg: AnalyticsVisitorsSettings;
  from: string;
  to: string;
  days: { day: string; views: number; visitors: number }[];
  totals: { views: number; visitors: number; sessions: number; orders: number; conversionPct: number | null };
  live: { now: number; windowMinutes: number };
  sources: { key: string; views: number; visitors: number }[];
  pages: { key: string; views: number; visitors: number }[];
  paths: { key: string; views: number; visitors: number }[];
  devices: { key: string; views: number; visitors: number }[];
  regions: { key: string; views: number; visitors: number }[];
}

export async function visitorsView(deps: Pick<AdminDeps, 'db' | 'resolver' | 'now'>, storeId: number, span = 30): Promise<VisitorsView> {
  const cfg = await deps.resolver.value('analytics.visitors', { storeId });
  const tz = await deps.resolver.value('store.timeZone', { storeId });
  const now = deps.now ? deps.now() : new Date();
  const today = ymdIn(now, tz);
  const days = Math.max(1, Math.min(span, cfg.keepDays));
  const from = addDays(today, -(days - 1));
  await ensureRollups(deps.db, storeId, from, today, tz, today, cfg.keepDays);
  const rows = await deps.db.pageViewDay.findMany({ where: { storeId, day: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${today}T00:00:00.000Z`) } } });
  const byDay = new Map<string, { views: number; visitors: number }>();
  let sessions = 0;
  for (const r of rows) if (r.dim === 'all') {
    byDay.set(r.day.toISOString().slice(0, 10), { views: r.views, visitors: r.visitors });
    sessions += r.sessions;
  }
  const series: VisitorsView['days'] = [];
  for (let d = from; d <= today; d = nextDay(d)) series.push({ day: d, views: byDay.get(d)?.views ?? 0, visitors: byDay.get(d)?.visitors ?? 0 });
  const start = dayStart(from, tz);
  const end = dayStart(nextDay(today), tz);
  const [distinct, orders, live] = await Promise.all([
    deps.db.$queryRaw<{ n: bigint }[]>`SELECT count(DISTINCT "visitorId") AS n FROM "AnalyticsEvent" WHERE "storeId" = ${storeId} AND "name" = 'page_view' AND "occurredAt" >= ${start} AND "occurredAt" < ${end}`,
    deps.db.order.count({ where: { storeId, createdAt: { gte: start, lt: end }, status: { notIn: ['CANCELLED', 'DRAFT'] } } }),
    deps.db.$queryRaw<{ n: bigint }[]>`SELECT count(DISTINCT "visitorId") AS n FROM "AnalyticsEvent" WHERE "storeId" = ${storeId} AND "occurredAt" >= ${new Date(now.getTime() - cfg.liveWindowMinutes * 60_000)}`,
  ]);
  const visitors = Number(distinct[0]?.n ?? 0);
  return {
    cfg,
    from,
    to: today,
    days: series,
    totals: { views: series.reduce((n, d) => n + d.views, 0), visitors, sessions, orders, conversionPct: visitors > 0 ? Math.round((orders / visitors) * 10000) / 100 : null },
    live: { now: Number(live[0]?.n ?? 0), windowMinutes: cfg.liveWindowMinutes },
    sources: sumDim(rows, 'source', cfg.topCount),
    pages: sumDim(rows, 'page', cfg.topCount),
    paths: sumDim(rows, 'path', cfg.topCount),
    devices: sumDim(rows, 'device', cfg.topCount),
    regions: sumDim(rows, 'region', cfg.topCount),
  };
}

const settingsInput = z.object({ collect: z.boolean(), keepDays: z.number().int().min(7).max(730), liveWindowMinutes: z.number().int().min(1).max(60), topCount: z.number().int().min(3).max(50), pin: z.string() }).strict();

/** Turning collection on or off, and the numbers: `settings.write` and the owner's PIN (it decides what is gathered). */
export async function saveVisitorSettings(deps: AdminDeps, actor: Actor, ctx: RequestContext, storeId: number, raw: unknown): Promise<{ ok: true } | { ok: false; error: string; details?: string[] }> {
  await requirePermission(deps.db, actor, 'settings.write', { storeId });
  const p = settingsInput.safeParse(raw);
  if (!p.success) return { ok: false, error: 'INVALID_INPUT', details: p.error.issues.map((i) => i.path.join('.')) };
  await requireOwnerPin(deps, actor, ctx, p.data.pin, 'analytics.visitors.settings', storeId);
  const before = await deps.resolver.value('analytics.visitors', { storeId });
  const { pin: _pin, ...next } = p.data;
  void _pin;
  await deps.resolver.set('analytics.visitors', next, storeTarget(storeId), { actorId: actor.staffUserId ?? null, reason: 'Website › Analytics' });
  await audit(deps.db, actor, { action: 'analytics.visitors.settings', entityType: 'Setting', entityId: 'analytics.visitors', before, after: next, storeId }, ctx);
  return { ok: true };
}

/** GET /api/admin/analytics-visitors?days= (reports.read) · POST settings (settings.write + PIN). */
export async function visitorsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  try {
    if (!path.length && m === 'GET') {
      const g = await guardAdmin(request, deps, { permission: 'reports.read', storeId });
      if (g instanceof Response) return g;
      const days = /^\d{1,3}$/.test(url.searchParams.get('days') ?? '') ? Number(url.searchParams.get('days')) : 30; // hardcode-ok: the default window the screen opens on
      return json({ ok: true, ...(await visitorsView(deps!, storeId, days)) });
    }
    if (path[0] === 'settings' && path.length === 1 && m === 'POST') {
      const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId });
      if (g instanceof Response) return g;
      const r = await saveVisitorSettings(deps!, g.actor, g.ctx, storeId, await body(request));
      return r.ok ? json({ ok: true }) : fail(422, r.error, r.details);
    }
    return fail(path.length ? 404 : 405, path.length ? 'not-found' : 'method-not-allowed');
  } catch (e) {
    return errorResponse(e);
  }
}
