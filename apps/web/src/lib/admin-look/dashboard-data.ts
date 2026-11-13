// PR 12 (CN-025, CN-027) — the Dashboard's one data loader. Every design (A now, more after launch) declares the parts it
// draws, and only those parts are read; a part the person may not open (its key) is not read at all, so a design never
// repeats a query and never shows a number to someone who may not see it.
//
// Money goes through @extas/metrics only (Sales = delivered orders, M1, by the delivered day; Ordered value = placed
// orders, by the placed day; never added up here). Everything else is a count or a time. A V12.4 card whose numbers have
// no store yet (ad spend, profit, COD held by couriers, return costs, site health, support) is not a part: the design
// shows its empty state naming the stage that brings it, never a made-up number.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { dayStart, daysPeriod, groupLines, kpi, kpiByDay, lines, sumLines, ymdIn, type Kpi, type LineRow, type Period } from '@extas/metrics';
import { imageSources, type ImageSource } from '@extas/media';
import { profitReport } from '@extas/inventory';
import type { AdminToday } from '@extas/settings';
import type { QueueRow } from '../admin-shell/queues';
import type { ShellViewer } from '../admin-shell/sections';
import { OFF_SITE, offSiteMissing } from '../backup-gate';
import { moneyOverview } from '../money-overview';
import { chartWindow, shiftDay, type DashRange } from './range';

// PR 631 (CN-036): 'feed' (the newest orders, Lumen Today's live feed) and 'goal' (this month's Sales against the
// monthly goal of `admin.today`, read only while the goal is on).
// PR 658 (CN-025/CN-027 follow-up 380, second half; CN-044, ERP lane): 'funnel' (orders placed in the selected
// period and how far each one got, from the four stage timestamps already on Order) and 'hours' (the last
// `admin.dashboardDesigns.courierDays` days of orders by weekday and 2-hour slot, for the Command center design).
// S28 · PR 691 (admin prototype v5, Home Command): 'profit' (net profit, delivered sales and ad spend of the period and the one before,
// from the same report as Finance), 'cod' (the cash the couriers hold) and 'pins' (the library cards pinned to Home).
export const DASH_PARTS = ['money', 'stages', 'delivery', 'top', 'lowStock', 'queues', 'offSite', 'feed', 'goal', 'funnel', 'hours', 'profit', 'cod', 'pins'] as const;
export type DashPart = (typeof DASH_PARTS)[number];

/** The keys a part needs (any one of them); the owner holds every key. */
export const PART_KEYS: Readonly<Record<DashPart, readonly string[]>> = {
  money: ['metrics.read'],
  top: ['metrics.read'],
  stages: ['orders.read'],
  delivery: ['orders.read', 'delivery.read'],
  lowStock: ['inventory.read'],
  queues: [],
  offSite: ['system.read'],
  feed: ['orders.read'],
  goal: ['metrics.read'],
  funnel: ['orders.read'],
  hours: ['orders.read'],
  profit: ['books.read'],
  cod: ['payments.view'],
  pins: ['reports.read'],
};

export const mayRead = (part: DashPart, v: ShellViewer) => v.owner || PART_KEYS[part].length === 0 || PART_KEYS[part].some((k) => v.perms.has(k));

/** `admin.dashboardDesigns`. */
export interface DashDesignSettings {
  targetHours: number;
  chartMinDays: number;
  smoothDays: number;
  topProducts: number;
  lowStockRows: number;
  courierDays: number;
  customMaxDays: number;
  sparkWeeks: number;
}

export interface DashCtx {
  db: PrismaClient;
  /** The settings reader (photos read the media settings through it). */
  settings: { value(key: string, scope?: { storeId?: number | null }): Promise<unknown> };
  storeId: number;
  now: Date;
  timeZone: string;
  viewer: ShellViewer;
  s: DashDesignSettings;
  range: DashRange;
  /** The waiting lists this person may open (the shell's own count). */
  queues: () => Promise<QueueRow[]>;
  /** PR 631: `admin.today` (the live feed's rows, the monthly goal); none = the shipped value. */
  today?: AdminToday;
}

export interface DashMoney {
  cur: Kpi;
  prev: Kpi;
  /** The chart window (at least `chartMinDays`), oldest first. */
  chart: { days: string[]; sales: number[]; ordered: number[]; orders: number[]; prevSales: number[] };
}

export interface DashStages {
  placed: number;
  confirmed: number;
  packed: number;
  withCourier: number;
  open: number;
  oldestNew: string | null;
  toBook: number;
  byCourier: { name: string; n: number }[];
  deliveredToday: number;
  deliveredYesterdayByNow: number;
  o2cHours: number | null;
  o2cPrevHours: number | null;
}

export interface CourierRow {
  id: string;
  name: string;
  finished: number;
  kept: number;
  returned: number;
  rate: number | null;
  prevRate: number | null;
  avgDays: number | null;
  weekly: (number | null)[];
}

export interface DashDelivery {
  days: number;
  finished: number;
  kept: number;
  returned: number;
  rate: number | null;
  prevRate: number | null;
  returnRate: number | null;
  prevReturnRate: number | null;
  weekly: (number | null)[];
  couriers: CourierRow[];
  bestBand: { nameEn: string; nameBn: string | null; courier: string; rate: number } | null;
}

export interface TopRow {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  units: number;
  orders: number;
  valueMinor: number;
  image: ImageSource | null;
}

export interface LowRow {
  variantId: string;
  productId: string;
  nameEn: string;
  nameBn: string | null;
  colourEn: string | null;
  colourBn: string | null;
  size: string | null;
  available: number;
  waiting: number;
  daysLeft: number | null;
  image: ImageSource | null;
}

/** PR 631: one of the newest orders in the live feed (no phone or address: a name, a place, an amount). */
export interface FeedRow {
  id: string;
  number: string;
  name: string | null;
  areaEn: string | null;
  areaBn: string | null;
  totalMinor: number;
  status: string;
  placedAt: string;
}

/** PR 658: orders placed in the selected period and how far each one got (the demo's "order funnel"). */
export interface DashFunnel {
  placed: number;
  confirmed: number;
  packed: number;
  withCourier: number;
  delivered: number;
}

/** PR 658: the last `days` shop days of orders by weekday (0 = Sunday, matching `Fmt.weekday`) and 2-hour slot. */
export interface DashHours {
  days: number;
  cells: readonly (readonly number[])[];
}

/** PR 631: this month's Sales (delivered orders only, M1) against the monthly goal. */
export interface DashGoal {
  goalMinor: number;
  salesMinor: number;
  /** The month so far: its first day and today (shop days). */
  from: string;
  to: string;
  /** Days left in the month after today. */
  daysLeft: number;
}

/** The profit report of one span, as the Home tiles need it. Net profit is null while the ad spend is not known. */
export interface DashProfitSpan {
  salesMinor: number;
  netMinor: number | null;
  /** Null while an ad platform's spend for a day is not known. */
  adsMinor: number | null;
  orders: number;
}
export interface DashProfit {
  cur: DashProfitSpan;
  prev: DashProfitSpan;
}
/** The cash the couriers hold for the shop (COD collected, not yet paid out) and how many parcels it is in. */
export interface DashCod {
  minor: number;
  parcels: number;
}
/** One library card pinned to Home: its figure (and the span before) when Home has it, else a link to the library. */
export interface DashPin {
  id: string;
  kind: 'money' | 'count' | 'link';
  now: number | null;
  prev: number | null;
}

/** Delivered sales per unit of ad spend; null with no spend. */
export const salesPerUnit = (salesMinor: number, adsMinor: number | null): number | null => (adsMinor !== null && adsMinor > 0 ? salesMinor / adsMinor : null);

/** The pinned cards in the order pinned: a figure for sales, profit, orders and average order; the others open the library. */
export function pinTiles(ids: readonly string[], p: DashProfit | null): DashPin[] {
  const known = new Set(['sales', 'profit', 'orders', 'aov', 'discount', 'restock', 'unsold']);
  const aov = (x: DashProfitSpan) => (x.orders > 0 ? Math.round(x.salesMinor / x.orders) : null);
  const out: DashPin[] = [];
  for (const id of ids) {
    if (!known.has(id)) continue;
    if (p && id === 'sales') out.push({ id, kind: 'money', now: p.cur.salesMinor, prev: p.prev.salesMinor });
    else if (p && id === 'profit') out.push({ id, kind: 'money', now: p.cur.netMinor, prev: p.prev.netMinor });
    else if (p && id === 'orders') out.push({ id, kind: 'count', now: p.cur.orders, prev: p.prev.orders });
    else if (p && id === 'aov') out.push({ id, kind: 'money', now: aov(p.cur), prev: aov(p.prev) });
    else out.push({ id, kind: 'link', now: null, prev: null });
  }
  return out;
}

export interface DashboardData {
  parts: ReadonlySet<DashPart>;
  range: DashRange;
  chart: ReturnType<typeof chartWindow>;
  money: DashMoney | null;
  stages: DashStages | null;
  delivery: DashDelivery | null;
  top: TopRow[] | null;
  lowStock: LowRow[] | null;
  queues: QueueRow[] | null;
  /**
   * CN-035 (PR 391): the places away from the server not connected yet (Azure Blob, Google Drive), for the yellow
   * "Off-server backup: not connected" line that is back every day until both are; empty = connected; null = not read.
   */
  offSite: ('blob' | 'drive')[] | null;
  feed: FeedRow[] | null;
  goal: DashGoal | null;
  funnel: DashFunnel | null;
  hours: DashHours | null;
  profit: DashProfit | null;
  cod: DashCod | null;
  pins: DashPin[] | null;
}

const OPEN = {
  placed: ['PLACED', 'AWAITING_ADVANCE'],
  confirmed: ['CONFIRMED', 'ON_HOLD', 'PROCESSING'],
  packed: ['PACKED'],
  withCourier: ['HANDED_OVER', 'IN_TRANSIT'],
} as const;
const KEPT_ST = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;
const KEPT: string[] = [...KEPT_ST];
const FINISHED: string[] = [...KEPT, 'RETURNED'];
/** Shipments that no longer carry the parcel (a PACKED order with only these still needs booking). */
const DEAD_SHIPMENTS = ['CANCELLED', 'BOOKING_FAILED'] as const;

const DAY = 86_400_000;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

const period = (c: DashCtx, from: string, to: string): Period => daysPeriod(from, to, c.timeZone);

async function money(c: DashCtx, chart: DashboardData['chart']): Promise<DashMoney> {
  const [cur, prev, byDay, before] = await Promise.all([
    kpi(c.db, c.storeId, period(c, c.range.from, c.range.to)),
    kpi(c.db, c.storeId, period(c, c.range.prev.from, c.range.prev.to)),
    kpiByDay(c.db, c.storeId, { from: chart.from, to: chart.to }, c.timeZone),
    kpiByDay(c.db, c.storeId, chart.prev, c.timeZone),
  ]);
  return {
    cur,
    prev,
    chart: {
      days: byDay.map((r) => r.key),
      sales: byDay.map((r) => r.sales.itemsMinor),
      ordered: byDay.map((r) => r.ordered.valueMinor),
      orders: byDay.map((r) => r.ordered.orders),
      prevSales: before.map((r) => r.sales.itemsMinor),
    },
  };
}

async function courierNames(db: PrismaClient, storeId: number, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.courierAccount.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function stages(c: DashCtx): Promise<DashStages> {
  const { db, storeId, now } = c;
  const base = { storeId, archivedAt: null };
  const all = [...OPEN.placed, ...OPEN.confirmed, ...OPEN.packed, ...OPEN.withCourier];
  const today = ymdIn(now, c.timeZone);
  const todayStart = dayStart(today, c.timeZone);
  const yStart = dayStart(shiftDay(today, -1), c.timeZone);
  const w = c.s.courierDays * DAY;
  const o2c = (from: Date, to: Date) => Prisma.sql`
    SELECT avg(extract(epoch from (o."handedOverAt" - o."placedAt"))) / 3600 AS h FROM "Order" o
    WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."handedOverAt" IS NOT NULL AND o."placedAt" >= ${from} AND o."placedAt" < ${to}`;
  const [byStatus, oldest, toBook, byCourier, dToday, dYest, a, b] = await Promise.all([
    db.order.groupBy({ by: ['status'], where: { ...base, status: { in: all } }, _count: { _all: true } }),
    db.order.findFirst({ where: { ...base, status: { in: [...OPEN.placed] } }, orderBy: { placedAt: 'asc' }, select: { placedAt: true } }),
    db.order.count({ where: { ...base, status: 'PACKED', shipments: { none: { status: { notIn: [...DEAD_SHIPMENTS] } } } } }),
    db.order.groupBy({ by: ['courierAccountId'], where: { ...base, status: { in: [...OPEN.withCourier] } }, _count: { _all: true } }),
    db.order.count({ where: { ...base, status: { in: [...KEPT_ST] }, deliveredAt: { gte: todayStart } } }),
    db.order.count({ where: { ...base, status: { in: [...KEPT_ST] }, deliveredAt: { gte: yStart, lt: new Date(now.getTime() - DAY) } } }),
    db.$queryRaw<{ h: unknown }[]>(o2c(new Date(now.getTime() - w), now)),
    db.$queryRaw<{ h: unknown }[]>(o2c(new Date(now.getTime() - 2 * w), new Date(now.getTime() - w))),
  ]);
  const n = (list: readonly string[]) => byStatus.filter((r) => list.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
  const names = await courierNames(db, storeId, byCourier.flatMap((r) => (r.courierAccountId ? [r.courierAccountId] : [])));
  const out = { placed: n(OPEN.placed), confirmed: n(OPEN.confirmed), packed: n(OPEN.packed), withCourier: n(OPEN.withCourier) };
  return {
    ...out,
    open: out.placed + out.confirmed + out.packed + out.withCourier,
    oldestNew: iso(oldest?.placedAt),
    toBook,
    byCourier: byCourier
      .filter((r) => r.courierAccountId)
      .map((r) => ({ name: names.get(r.courierAccountId!) ?? '', n: r._count._all }))
      .sort((x, y) => y.n - x.n),
    deliveredToday: dToday,
    deliveredYesterdayByNow: dYest,
    o2cHours: numOrNull(a[0]?.h),
    o2cPrevHours: numOrNull(b[0]?.h),
  };
}

async function delivery(c: DashCtx): Promise<DashDelivery> {
  const { db, storeId, now } = c;
  const cur = new Date(now.getTime() - c.s.courierDays * DAY);
  const prev = new Date(now.getTime() - 2 * c.s.courierDays * DAY);
  const since = new Date(Math.min(prev.getTime(), now.getTime() - c.s.sparkWeeks * 7 * DAY));
  const at = Prisma.sql`coalesce(o."deliveredAt", o."returnedAt")`;
  const where = Prisma.sql`o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."status"::text = ANY(${FINISHED}) AND ${at} >= ${since} AND ${at} < ${now}`;
  const kept = Prisma.sql`o."status"::text = ANY(${KEPT})`;
  const [byCourier, byWeek, bands] = await Promise.all([
    db.$queryRaw<{ c: string | null; kept: unknown; ret: unknown; pkept: unknown; pret: unknown; days: unknown }[]>`
      SELECT o."courierAccountId"::text AS c,
        count(*) FILTER (WHERE ${at} >= ${cur} AND ${kept}) AS kept,
        count(*) FILTER (WHERE ${at} >= ${cur} AND o."status"::text = 'RETURNED') AS ret,
        count(*) FILTER (WHERE ${at} >= ${prev} AND ${at} < ${cur} AND ${kept}) AS pkept,
        count(*) FILTER (WHERE ${at} >= ${prev} AND ${at} < ${cur} AND o."status"::text = 'RETURNED') AS pret,
        avg(extract(epoch from (o."deliveredAt" - coalesce(o."handedOverAt", o."placedAt"))) / 86400) FILTER (WHERE ${at} >= ${cur} AND ${kept}) AS days
      FROM "Order" o WHERE ${where} GROUP BY 1`,
    db.$queryRaw<{ c: string | null; wk: unknown; kept: unknown; fin: unknown }[]>`
      SELECT o."courierAccountId"::text AS c, floor(extract(epoch from (${now}::timestamptz - ${at})) / 604800)::int AS wk,
        count(*) FILTER (WHERE ${kept}) AS kept, count(*) AS fin
      FROM "Order" o WHERE ${where} GROUP BY 1, 2`,
    db.$queryRaw<{ b: string; c: string; kept: unknown; fin: unknown }[]>`
      SELECT o."deliveryBandId"::text AS b, o."courierAccountId"::text AS c, count(*) FILTER (WHERE ${kept}) AS kept, count(*) AS fin
      FROM "Order" o WHERE ${where} AND ${at} >= ${cur} AND o."deliveryBandId" IS NOT NULL AND o."courierAccountId" IS NOT NULL GROUP BY 1, 2`,
  ]);
  const ids = [...new Set([...byCourier.flatMap((r) => (r.c ? [r.c] : [])), ...bands.map((r) => r.c)])];
  const names = await courierNames(db, storeId, ids);
  const weeks = c.s.sparkWeeks;
  const weekRates = (rows: typeof byWeek) => {
    const k = Array<number>(weeks).fill(0);
    const f = Array<number>(weeks).fill(0);
    for (const r of rows) {
      const i = weeks - 1 - num(r.wk);
      if (i < 0 || i >= weeks) continue;
      k[i]! += num(r.kept);
      f[i]! += num(r.fin);
    }
    return k.map((x, i) => ratio(x, f[i]!));
  };
  let tk = 0;
  let tr = 0;
  let pk = 0;
  let pr = 0;
  const couriers: CourierRow[] = [];
  for (const r of byCourier) {
    tk += num(r.kept);
    tr += num(r.ret);
    pk += num(r.pkept);
    pr += num(r.pret);
    if (!r.c) continue;
    const kept = num(r.kept);
    const returned = num(r.ret);
    couriers.push({
      id: r.c,
      name: names.get(r.c) ?? '',
      finished: kept + returned,
      kept,
      returned,
      rate: ratio(kept, kept + returned),
      prevRate: ratio(num(r.pkept), num(r.pkept) + num(r.pret)),
      avgDays: numOrNull(r.days),
      weekly: weekRates(byWeek.filter((w) => w.c === r.c)),
    });
  }
  couriers.sort((x, y) => (y.rate ?? -1) - (x.rate ?? -1) || y.finished - x.finished);
  let best: DashDelivery['bestBand'] = null;
  let bestBandId: string | null = null;
  for (const r of bands) {
    const fin = num(r.fin);
    const rt = ratio(num(r.kept), fin);
    if (fin >= 3 && rt !== null && (!best || rt > best.rate)) {
      best = { nameEn: '', nameBn: null, courier: names.get(r.c) ?? '', rate: rt };
      bestBandId = r.b;
    }
  }
  if (best && bestBandId) {
    const band = await db.deliveryBand.findFirst({ where: { id: bestBandId, storeId }, select: { nameEn: true, nameBn: true } });
    best = band ? { ...best, nameEn: band.nameEn, nameBn: band.nameBn } : null;
  }
  return {
    days: c.s.courierDays,
    finished: tk + tr,
    kept: tk,
    returned: tr,
    rate: ratio(tk, tk + tr),
    prevRate: ratio(pk, pk + pr),
    returnRate: ratio(tr, tk + tr),
    prevReturnRate: ratio(pr, pk + pr),
    weekly: weekRates(byWeek),
    couriers,
    bestBand: best,
  };
}

async function thumbs(c: DashCtx, productIds: string[]): Promise<Map<string, ImageSource>> {
  if (!productIds.length) return new Map();
  const photos = await c.db.productMedia.findMany({
    where: { storeId: c.storeId, productId: { in: productIds }, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { productId: true, assetId: true, role: true, isPrimary: true },
  });
  const pick = new Map<string, string>();
  for (const pass of [(p: (typeof photos)[number]) => p.isPrimary, (p: (typeof photos)[number]) => p.role === 'FRONT', () => true]) {
    for (const p of photos) if (!pick.has(p.productId) && pass(p)) pick.set(p.productId, p.assetId);
  }
  if (!pick.size) return new Map();
  const src = new Map(await imageSources({ db: c.db, settings: c.settings as never }, c.storeId, [...new Set(pick.values())]).catch(() => []));
  const out = new Map<string, ImageSource>();
  for (const [pid, aid] of pick) {
    const s = src.get(aid);
    if (s) out.set(pid, s);
  }
  return out;
}

const byUnits = (rows: readonly LineRow[]) => rows.reduce((s, r) => s + r.quantity, 0);

async function top(c: DashCtx, n: number): Promise<TopRow[]> {
  const to = c.range.to;
  const from = shiftDay(to, -(c.s.courierDays - 1));
  const rows = await lines(c.db, 'sales', c.storeId, period(c, from, to), c.timeZone);
  const groups = groupLines(rows, (r) => r.productId);
  const ranked = [...groups.entries()]
    .map(([productId, g]) => ({ productId, f: sumLines(g) }))
    .sort((a, b) => b.f.valueMinor - a.f.valueMinor || b.f.units - a.f.units)
    .slice(0, n);
  const ids = ranked.map((r) => r.productId);
  if (!ids.length) return [];
  const [products, images] = await Promise.all([
    c.db.product.findMany({ where: { storeId: c.storeId, id: { in: ids } }, select: { id: true, nameEn: true, nameBn: true } }),
    thumbs(c, ids),
  ]);
  const name = new Map(products.map((p) => [p.id, p]));
  return ranked.map(({ productId, f }) => {
    const p = name.get(productId);
    return {
      productId,
      nameEn: p?.nameEn ?? '',
      nameBn: p?.nameBn ?? null,
      units: f.units,
      orders: f.orders,
      valueMinor: f.valueMinor,
      image: images.get(productId) ?? null,
    };
  });
}

async function offSite(c: DashCtx): Promise<('blob' | 'drive')[]> {
  const live = await c.db.integration.findMany({
    where: { storeId: null, archivedAt: null, enabled: true, mode: 'LIVE', provider: { in: [OFF_SITE.blob.provider, OFF_SITE.drive.provider] } },
    select: { kind: true, provider: true },
  });
  return offSiteMissing(live);
}

async function lowStock(c: DashCtx): Promise<LowRow[]> {
  const alerts = await c.db.lowStockAlert.findMany({ where: { resolvedAt: null }, orderBy: [{ available: 'asc' }, { createdAt: 'asc' }], take: 200, select: { variantId: true, available: true } });
  if (!alerts.length) return [];
  const variants = await c.db.productVariant.findMany({
    where: { id: { in: alerts.map((a) => a.variantId) }, storeId: c.storeId, archivedAt: null },
    select: { id: true, productId: true, product: { select: { nameEn: true, nameBn: true } }, colour: { select: { nameEn: true, nameBn: true } }, size: { select: { label: true } } },
  });
  const vmap = new Map(variants.map((v) => [v.id, v]));
  const live = alerts.filter((a) => vmap.has(a.variantId));
  const productIds = [...new Set(live.map((a) => vmap.get(a.variantId)!.productId))];
  const to = c.range.to;
  const from = shiftDay(to, -(c.s.courierDays - 1));
  const [waiting, sold, counts, images] = await Promise.all([
    c.db.backInStockRequest.groupBy({ by: ['variantId'], where: { storeId: c.storeId, notifiedAt: null, archivedAt: null, variantId: { in: live.map((a) => a.variantId) } }, _count: { _all: true } }),
    productIds.length ? lines(c.db, 'sales', c.storeId, period(c, from, to), c.timeZone) : Promise.resolve([] as LineRow[]),
    c.db.productVariant.groupBy({ by: ['productId'], where: { productId: { in: productIds }, archivedAt: null }, _count: { _all: true } }),
    thumbs(c, productIds),
  ]);
  const wait = new Map(waiting.map((w) => [w.variantId, w._count._all]));
  const cells = new Map(counts.map((r) => [r.productId, r._count._all]));
  const units = new Map([...groupLines(sold, (r) => r.productId).entries()].map(([k, g]) => [k, byUnits(g)]));
  const out = live.map((a): LowRow => {
    const v = vmap.get(a.variantId)!;
    const perDay = (units.get(v.productId) ?? 0) / c.s.courierDays / Math.max(1, cells.get(v.productId) ?? 1);
    return {
      variantId: v.id,
      productId: v.productId,
      nameEn: v.product.nameEn,
      nameBn: v.product.nameBn,
      colourEn: v.colour?.nameEn ?? null,
      colourBn: v.colour?.nameBn ?? null,
      size: v.size?.label ?? null,
      available: Math.max(0, a.available),
      waiting: wait.get(v.id) ?? 0,
      daysLeft: a.available <= 0 ? 0 : perDay > 0 ? Math.max(1, Math.round(a.available / perDay)) : null,
      image: images.get(v.productId) ?? null,
    };
  });
  // Sold out first, then the fewest days left; a slow seller (no pace) last.
  out.sort((x, y) => (x.available === 0 ? 0 : 1) - (y.available === 0 ? 0 : 1) || (x.daysLeft ?? 1e9) - (y.daysLeft ?? 1e9) || x.available - y.available);
  return out.slice(0, c.s.lowStockRows);
}

const TODAY_DEFAULT: AdminToday = { liveRows: 6, goal: { on: false, amountMinor: 0 } };

/** The newest orders; null when the owner switched the feed off (0 rows), so the page shows no card at all. */
async function feed(c: DashCtx): Promise<FeedRow[] | null> {
  const take = (c.today ?? TODAY_DEFAULT).liveRows;
  if (take <= 0) return null;
  const rows = await c.db.order.findMany({
    where: { storeId: c.storeId, archivedAt: null },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take,
    select: { id: true, number: true, customerName: true, totalMinor: true, status: true, placedAt: true, area: { select: { nameEn: true, nameBn: true } } },
  });
  return rows.map((r) => ({ id: r.id, number: r.number, name: r.customerName?.trim() || null, areaEn: r.area?.nameEn ?? null, areaBn: r.area?.nameBn ?? null, totalMinor: r.totalMinor, status: r.status, placedAt: r.placedAt.toISOString() }));
}

/** The month of `day` (YYYY-MM-DD): its first day and how many days follow `day` in it. */
export function monthOf(day: string): { from: string; daysLeft: number } {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${day.slice(0, 7)}-01`, daysLeft: last - d! };
}

async function goal(c: DashCtx): Promise<DashGoal | null> {
  const g = (c.today ?? TODAY_DEFAULT).goal;
  if (!g.on) return null;
  const to = ymdIn(c.now, c.timeZone);
  const { from, daysLeft } = monthOf(to);
  const k = await kpi(c.db, c.storeId, period(c, from, to));
  return { goalMinor: g.amountMinor, salesMinor: k.sales.itemsMinor, from, to, daysLeft };
}

/** PR 658: every order placed in the selected period, and how many of them ever reached each later stage — a
 * timestamp set by the order's own flow and kept even if the order was later cancelled or returned, so this counts
 * "ever got this far", not "is currently at this stage" (that is `stages()`, a live snapshot of open orders only). */
async function funnel(c: DashCtx): Promise<DashFunnel> {
  const { db, storeId } = c;
  const { from, to } = period(c, c.range.from, c.range.to);
  const base = { storeId, archivedAt: null, placedAt: { gte: from, lt: to } };
  const [placed, confirmed, packed, withCourier, delivered] = await Promise.all([
    db.order.count({ where: base }),
    db.order.count({ where: { ...base, confirmedAt: { not: null } } }),
    db.order.count({ where: { ...base, packedAt: { not: null } } }),
    db.order.count({ where: { ...base, handedOverAt: { not: null } } }),
    db.order.count({ where: { ...base, status: { in: [...KEPT_ST] } } }),
  ]);
  return { placed, confirmed, packed, withCourier, delivered };
}

/** PR 658: when customers order, over the last `admin.dashboardDesigns.courierDays` shop days (a fixed, settings-
 * driven window of its own — this pattern is about habits, not the date-range picker). */
async function hours(c: DashCtx): Promise<DashHours> {
  const { db, storeId, timeZone, now } = c;
  const days = c.s.courierDays;
  const since = new Date(now.getTime() - days * DAY);
  const rows = await db.$queryRaw<{ wd: number; slot: number; n: number }[]>(Prisma.sql`
    SELECT extract(dow from o."placedAt" AT TIME ZONE ${timeZone})::int AS wd,
           (extract(hour from o."placedAt" AT TIME ZONE ${timeZone})::int / 2)::int AS slot,
           count(*)::int AS n
    FROM "Order" o
    WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."placedAt" >= ${since}
    GROUP BY 1, 2`);
  const cells: number[][] = Array.from({ length: 7 }, () => Array<number>(12).fill(0));
  for (const r of rows) {
    const wd = Number(r.wd);
    const slot = Number(r.slot);
    if (cells[wd] && slot >= 0 && slot < 12) cells[wd]![slot] = Number(r.n);
  }
  return { days, cells };
}

/** S28 · PR 691: the profit report for the selected period and the one before (the same report as Finance). */
async function profit(c: DashCtx): Promise<DashProfit> {
  const span = async (from: string, to: string): Promise<DashProfitSpan> => {
    const r = await profitReport({ db: c.db, settings: c.settings as Parameters<typeof profitReport>[0]['settings'] }, c.storeId, from, to);
    return { salesMinor: r.salesMinor, netMinor: r.netProfitMinor, adsMinor: r.adsMinor, orders: r.orders };
  };
  const [cur, prev] = await Promise.all([span(c.range.from, c.range.to), span(c.range.prev.from, c.range.prev.to)]);
  return { cur, prev };
}

/** S28 · PR 691: the cash the couriers hold for the shop. */
async function cod(c: DashCtx): Promise<DashCod> {
  const o = await moneyOverview(c.db, c.storeId, c.now, c.timeZone);
  return { minor: o.cod.minor, parcels: o.cod.parcels };
}

export async function loadDashboard(c: DashCtx, wanted: readonly DashPart[]): Promise<DashboardData> {
  const parts = new Set(wanted.filter((p) => mayRead(p, c.viewer)));
  const chart = chartWindow(c.range, c.s.chartMinDays);
  const on = <T>(p: DashPart, f: () => Promise<T>): Promise<T | null> => (parts.has(p) ? f() : Promise.resolve(null));
  const needProfit = parts.has('profit') || parts.has('pins');
  const [m, st, dl, tp, ls, qs, off, fd, gl, fn, hr, pf, cd, pinRows] = await Promise.all([
    on('money', () => money(c, chart)),
    on('stages', () => stages(c)),
    on('delivery', () => delivery(c)),
    on('top', () => top(c, c.s.topProducts)),
    on('lowStock', () => lowStock(c)),
    on('queues', () => c.queues()),
    on('offSite', () => offSite(c)),
    on('feed', () => feed(c)),
    on('goal', () => goal(c)),
    on('funnel', () => funnel(c)),
    on('hours', () => hours(c)),
    needProfit ? profit(c) : Promise.resolve(null),
    on('cod', () => cod(c)),
    on('pins', () => c.db.reportView.findMany({ where: { storeId: c.storeId, reportKey: 'pin', archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { name: true } })),
  ]);
  return { parts, range: c.range, chart, money: m, stages: st, delivery: dl, top: tp, lowStock: ls, queues: qs, offSite: off, feed: fd, goal: gl, funnel: fn, hours: hr, profit: parts.has('profit') ? pf : null, cod: cd, pins: pinRows ? pinTiles(pinRows.map((r) => r.name), pf) : null };
}
