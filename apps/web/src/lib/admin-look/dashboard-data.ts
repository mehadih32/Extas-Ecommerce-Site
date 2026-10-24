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
import type { QueueRow } from '../admin-shell/queues';
import type { ShellViewer } from '../admin-shell/sections';
import { chartWindow, shiftDay, type DashRange } from './range';

export const DASH_PARTS = ['money', 'stages', 'delivery', 'top', 'lowStock', 'queues'] as const;
export type DashPart = (typeof DASH_PARTS)[number];

/** The keys a part needs (any one of them); the owner holds every key. */
export const PART_KEYS: Readonly<Record<DashPart, readonly string[]>> = {
  money: ['metrics.read'],
  top: ['metrics.read'],
  stages: ['orders.read'],
  delivery: ['orders.read', 'delivery.read'],
  lowStock: ['inventory.read'],
  queues: [],
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

export async function loadDashboard(c: DashCtx, wanted: readonly DashPart[]): Promise<DashboardData> {
  const parts = new Set(wanted.filter((p) => mayRead(p, c.viewer)));
  const chart = chartWindow(c.range, c.s.chartMinDays);
  const on = <T>(p: DashPart, f: () => Promise<T>): Promise<T | null> => (parts.has(p) ? f() : Promise.resolve(null));
  const [m, st, dl, tp, ls, qs] = await Promise.all([
    on('money', () => money(c, chart)),
    on('stages', () => stages(c)),
    on('delivery', () => delivery(c)),
    on('top', () => top(c, c.s.topProducts)),
    on('lowStock', () => lowStock(c)),
    on('queues', () => c.queues()),
  ]);
  return { parts, range: c.range, chart, money: m, stages: st, delivery: dl, top: tp, lowStock: ls, queues: qs };
}
