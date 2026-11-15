// PR 796 (prototype v5 Reports › Sales): the order rows of one period for the Sales report, and the plain sums the page draws —
// orders, pieces, delivered value, cancelled, returned, by hour, by weekday, by channel, by payment method, discounts and coupons,
// day by day or week by week. Read-only. The rows are the shop's own orders (the same `Order` rows the Orders report reads); nothing
// is estimated. A channel filter (`ch=`) narrows the rows to one order source.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { daysPeriod, ymdIn } from '@extas/metrics';
import { addDays, daysBetween } from './model';

const S = MOTHER_STORE_ID;

export const SALE_SOURCES = ['WEBSITE', 'LANDING_PAGE', 'MESSENGER', 'WHATSAPP', 'LIVE_CHAT', 'PHONE', 'TELEGRAM', 'ADMIN', 'SHOWROOM', 'IMPORT'] as const;
export const isSaleSource = (v: unknown): v is (typeof SALE_SOURCES)[number] => typeof v === 'string' && (SALE_SOURCES as readonly string[]).includes(v);

export interface SaleOrder {
  id: string;
  number: string;
  day: string;
  hour: number;
  /** 0 = Sunday. */
  wd: number;
  status: string;
  source: string;
  method: string | null;
  discountMinor: number;
  coupon: string | null;
  totalMinor: number;
  pieces: number;
}

const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'];
export const isDelivered = (o: { status: string }) => DELIVERED.includes(o.status);
export const isLive = (o: { status: string }) => o.status !== 'CANCELLED';

/** The orders placed in the span (drafts left out), with the hour and weekday in the shop's time zone and their pieces. */
export async function loadSaleOrders(db: PrismaClient, tz: string, from: string, to: string, source?: string | null): Promise<SaleOrder[]> {
  const per = daysPeriod(from, to, tz);
  const rows = await db.order.findMany({
    where: { storeId: S, archivedAt: null, status: { not: 'DRAFT' }, placedAt: { gte: per.from, lt: per.to }, ...(isSaleSource(source) ? { source } : {}) },
    select: { id: true, number: true, placedAt: true, status: true, source: true, paymentMethod: true, discountMinor: true, couponCode: true, totalMinor: true },
    orderBy: { placedAt: 'asc' },
    take: 20000,
  });
  const ids = rows.map((r) => r.id);
  const items = ids.length ? await db.orderItem.groupBy({ by: ['orderId'], where: { orderId: { in: ids }, status: 'ACTIVE' }, _sum: { quantity: true } }) : [];
  const pcs = new Map(items.map((i) => [i.orderId, i._sum.quantity ?? 0]));
  const hourOf = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz });
  const wdOf = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    day: ymdIn(r.placedAt, tz),
    hour: Number(hourOf.format(r.placedAt)) % 24,
    wd: Math.max(0, WD.indexOf(wdOf.format(r.placedAt))),
    status: r.status,
    source: r.source,
    method: r.paymentMethod,
    discountMinor: r.discountMinor,
    coupon: r.couponCode,
    totalMinor: r.totalMinor,
    pieces: pcs.get(r.id) ?? 0,
  }));
}

const sum = <T>(a: readonly T[], f: (x: T) => number) => a.reduce((n, x) => n + f(x), 0);

export interface SaleFacts {
  all: number;
  live: SaleOrder[];
  orders: number;
  orderValue: number;
  pieces: number;
  aov: number;
  delivered: number;
  deliveredValue: number;
  cancelled: number;
  returned: number;
  discount: number;
}

export function saleFacts(rows: readonly SaleOrder[]): SaleFacts {
  const live = rows.filter(isLive);
  const orderValue = sum(live, (o) => o.totalMinor);
  return {
    all: rows.length,
    live,
    orders: live.length,
    orderValue,
    pieces: sum(live, (o) => o.pieces),
    aov: live.length ? Math.round(orderValue / live.length) : 0,
    delivered: rows.filter(isDelivered).length,
    deliveredValue: sum(rows.filter(isDelivered), (o) => o.totalMinor),
    cancelled: rows.length - live.length,
    returned: rows.filter((o) => o.status === 'RETURNED').length,
    discount: sum(live, (o) => o.discountMinor),
  };
}

/** Order value by hour of day (24) and by weekday (7, 0 = Sunday), live orders only. */
export function hourWeekday(live: readonly SaleOrder[]): { hours: number[]; wds: number[] } {
  const hours = Array<number>(24).fill(0);
  const wds = Array<number>(7).fill(0);
  for (const o of live) {
    hours[o.hour] = (hours[o.hour] ?? 0) + o.totalMinor;
    wds[o.wd] = (wds[o.wd] ?? 0) + o.totalMinor;
  }
  return { hours, wds };
}

export interface SaleBucket {
  /** First day of the bucket. */
  from: string;
  to: string;
  rows: SaleOrder[];
}

/** Days up to 45 of them, else weeks (the Sales report's own rule, `grain=week` forces weeks). */
export function saleBuckets(rows: readonly SaleOrder[], from: string, to: string, grain: 'day' | 'week'): { grain: 'day' | 'week'; list: SaleBucket[] } {
  const span = daysBetween(from, to, 4000);
  const g = grain === 'week' || span.length > 45 ? 'week' : 'day';
  const size = g === 'week' ? 7 : 1;
  const list: SaleBucket[] = [];
  for (let i = 0; i < span.length; i += size) list.push({ from: span[i]!, to: span[Math.min(span.length - 1, i + size - 1)]!, rows: [] });
  const at = new Map<string, SaleBucket>();
  for (const b of list) for (let d = b.from; d <= b.to; d = addDays(d, 1)) at.set(d, b);
  for (const r of rows) at.get(r.day)?.rows.push(r);
  return { grain: g, list };
}

export interface CouponGroup {
  key: string;
  orders: number;
  off: number;
  aov: number;
  pcs: number;
}

/** Orders that had a discount, by coupon code (a discount with no code is grouped by size of order: three or more pieces, or two). */
export function discountGroups(live: readonly SaleOrder[]): CouponGroup[] {
  const by = new Map<string, SaleOrder[]>();
  for (const o of live.filter((x) => x.discountMinor > 0)) {
    const key = o.coupon || (o.pieces >= 3 ? 'BUY3' : 'BUY2');
    by.set(key, [...(by.get(key) ?? []), o]);
  }
  return [...by].map(([key, os]) => ({ key, orders: os.length, off: sum(os, (o) => o.discountMinor), aov: Math.round(sum(os, (o) => o.totalMinor) / os.length), pcs: sum(os, (o) => o.pieces) / os.length })).sort((a, b) => b.off - a.off);
}
