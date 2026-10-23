// The metric functions on the database (PR 155, CN-022). Every report view and the dashboard read their money numbers
// here; nothing else adds up order totals or line totals (src/guard.test.ts fails the build if a view does). The rule
// itself — which orders are Sales, which are Ordered value, on which day — is in pure.ts and applied in one SQL
// fragment (`basisWhere`), so the two figures can never drift apart between screens.
//
// All queries are store-scoped (A4.1), skip archived orders, and run through PgBouncer (plain parameters, no prepared
// statements). Money comes back as whole minor units (poisha).
import { Prisma, type PrismaClient } from '@extas/db/client';
import { BASES, BASIS_RULE, COUNTED_LINE_STATUS, NO_ORDERS, daysBetween, daysPeriod, type Basis, type LineRow, type OrderFigure, type Period } from './pure';

export type Db = PrismaClient | Prisma.TransactionClient;

/** The KPI pair every screen shows side by side: Sales (delivered) and Ordered value (placed), never one for the other. */
export interface Kpi {
  sales: OrderFigure;
  ordered: OrderFigure;
}

/** One row of a breakdown (a day, a delivery zone, a payment method) with both figures. */
export interface KpiRow extends Kpi {
  key: string;
}

/** What the order lines are narrowed to: one product, or the lines sold as part of a combo set. */
export interface LineFilter {
  productId?: string;
  /** Only lines that belong to a combo set (comboId and its set key present). */
  combos?: boolean;
}

function checkPeriod(p: Period): void {
  if (!(p.from instanceof Date) || !(p.to instanceof Date) || Number.isNaN(p.from.getTime()) || Number.isNaN(p.to.getTime()) || p.to < p.from) {
    throw new RangeError('a period needs two dates, from before to');
  }
}

/** The WHERE part that decides which orders count in a figure, and on which moment (alias `o` = "Order"). */
export function basisWhere(basis: Basis, storeId: number, period: Period): Prisma.Sql {
  checkPeriod(period);
  const r = BASIS_RULE[basis];
  const at = Prisma.raw(`o."${r.at}"`);
  const statuses = [...r.statuses];
  const status = r.include ? Prisma.sql`o."status"::text = ANY(${statuses})` : Prisma.sql`NOT (o."status"::text = ANY(${statuses}))`;
  return Prisma.sql`o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${status} AND ${at} >= ${period.from} AND ${at} < ${period.to}`;
}

const dayExpr = (basis: Basis, timeZone: string) => Prisma.sql`to_char((${Prisma.raw(`o."${BASIS_RULE[basis].at}"`)} AT TIME ZONE ${timeZone}), 'YYYY-MM-DD')`;

interface FigureRow {
  key: string;
  orders: bigint | number;
  value: bigint | number;
  items: bigint | number;
  delivery: bigint | number;
}

const figure = (r: FigureRow | undefined): OrderFigure =>
  r ? { orders: Number(r.orders), valueMinor: Number(r.value), itemsMinor: Number(r.items), deliveryMinor: Number(r.delivery) } : { ...NO_ORDERS };

async function figures(db: Db, basis: Basis, storeId: number, period: Period, key: Prisma.Sql, join: Prisma.Sql = Prisma.empty): Promise<Map<string, OrderFigure>> {
  const rows = await db.$queryRaw<FigureRow[]>`
    SELECT ${key} AS "key",
           count(*)                                                          AS "orders",
           COALESCE(sum(o."totalMinor"), 0)::bigint                          AS "value",
           COALESCE(sum(o."subtotalMinor" - o."discountMinor"), 0)::bigint   AS "items",
           COALESCE(sum(o."deliveryChargeMinor"), 0)::bigint                 AS "delivery"
    FROM "Order" o ${join}
    WHERE ${basisWhere(basis, storeId, period)}
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.key, figure(r)]));
}

/** Sales and Ordered value for one store over one period: the dashboard's two headline figures. */
export async function kpi(db: Db, storeId: number, period: Period): Promise<Kpi> {
  const [ordered, sales] = await Promise.all(BASES.map((b) => figures(db, b, storeId, period, Prisma.sql`''`)));
  return { sales: sales!.get('') ?? { ...NO_ORDERS }, ordered: ordered!.get('') ?? { ...NO_ORDERS } };
}

async function breakdown(db: Db, storeId: number, period: Period, key: (b: Basis) => Prisma.Sql, join: Prisma.Sql = Prisma.empty): Promise<KpiRow[]> {
  const [ordered, sales] = await Promise.all(BASES.map((b) => figures(db, b, storeId, period, key(b), join)));
  const keys = [...new Set([...ordered!.keys(), ...sales!.keys()])].sort();
  return keys.map((k) => ({ key: k, ordered: ordered!.get(k) ?? { ...NO_ORDERS }, sales: sales!.get(k) ?? { ...NO_ORDERS } }));
}

/**
 * Day by day, shop days `from` … `to` (both included, oldest first, every day present even when empty). An order is in
 * Ordered value on the day it was placed and in Sales on the day it was delivered — usually two different days.
 */
export async function kpiByDay(db: Db, storeId: number, days: { from: string; to: string }, timeZone: string): Promise<KpiRow[]> {
  const rows = await breakdown(db, storeId, daysPeriod(days.from, days.to, timeZone), (b) => dayExpr(b, timeZone));
  const byDay = new Map(rows.map((r) => [r.key, r]));
  return daysBetween(days.from, days.to).map((d) => byDay.get(d) ?? { key: d, ordered: { ...NO_ORDERS }, sales: { ...NO_ORDERS } });
}

/** By delivery zone (the order's delivery band key; '' = no band settled yet, e.g. an unclear address). */
export function kpiByZone(db: Db, storeId: number, period: Period): Promise<KpiRow[]> {
  return breakdown(db, storeId, period, () => Prisma.sql`COALESCE(z."key", '')`, Prisma.sql`LEFT JOIN "DeliveryBand" z ON z."id" = o."deliveryBandId"`);
}

/** By payment method ('' = none recorded). */
export function kpiByPaymentMethod(db: Db, storeId: number, period: Period): Promise<KpiRow[]> {
  return breakdown(db, storeId, period, () => Prisma.sql`COALESCE(o."paymentMethod"::text, '')`);
}

/**
 * The order lines that count in one figure (sumLines in pure.ts adds them up). Each row carries the shop day it counts
 * on. For a product's or a combo's own numbers; the shop-wide figures use `kpi`.
 */
export async function lines(db: Db, basis: Basis, storeId: number, period: Period, timeZone: string, filter: LineFilter = {}): Promise<LineRow[]> {
  const narrow: Prisma.Sql[] = [];
  if (filter.productId) narrow.push(Prisma.sql`AND oi."productId" = ${filter.productId}::uuid`);
  if (filter.combos) narrow.push(Prisma.sql`AND oi."comboId" IS NOT NULL AND oi."comboGroupKey" IS NOT NULL`);
  const rows = await db.$queryRaw<(Omit<LineRow, 'quantity' | 'unitPriceMinor' | 'lineTotalMinor'> & { quantity: number; unitPriceMinor: number; lineTotalMinor: number })[]>`
    SELECT oi."orderId"::text AS "orderId", oi."productId"::text AS "productId", oi."comboId"::text AS "comboId", oi."comboGroupKey",
           oi."quantity", oi."unitPriceMinor", oi."lineTotalMinor", ${dayExpr(basis, timeZone)} AS "day"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    WHERE ${basisWhere(basis, storeId, period)} AND oi."storeId" = ${storeId} AND oi."status"::text = ${COUNTED_LINE_STATUS} ${narrow.length ? Prisma.join(narrow, ' ') : Prisma.empty}
    ORDER BY ${Prisma.raw(`o."${BASIS_RULE[basis].at}"`)}, oi."id"`;
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity), unitPriceMinor: Number(r.unitPriceMinor), lineTotalMinor: Number(r.lineTotalMinor) }));
}

/** Both figures' lines at once: { ordered, sales }. */
export async function linesBoth(db: Db, storeId: number, period: Period, timeZone: string, filter: LineFilter = {}): Promise<Record<Basis, LineRow[]>> {
  const [ordered, sales] = await Promise.all(BASES.map((b) => lines(db, b, storeId, period, timeZone, filter)));
  return { ordered: ordered!, sales: sales! };
}
