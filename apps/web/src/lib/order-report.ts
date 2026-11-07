// S05 · PR 155 follow-up 91 — Reports › Orders: the order analytics the register names (by day, by delivery zone, by
// payment method) on the one KPI definition of @extas/metrics (CN-022): Ordered value on the day an order was placed,
// Sales on the day it was delivered, never one for the other. Read-only; money comes back in minor units.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { kpi, kpiByDay, kpiByPaymentMethod, kpiByZone, lastDays, type Kpi, type KpiRow } from '@extas/metrics';

export const ORDER_REPORT_PERIODS = [7, 30, 90] as const;
export type OrderReportDays = (typeof ORDER_REPORT_PERIODS)[number];

export const daysOf = (v: unknown): OrderReportDays => ((ORDER_REPORT_PERIODS as readonly number[]).includes(Number(v)) ? (Number(v) as OrderReportDays) : 30);

export interface ZoneRow extends KpiRow {
  nameEn: string | null;
  nameBn: string | null;
}

export interface OrderReport {
  from: string;
  to: string;
  total: Kpi;
  /** The days with an order placed or delivered, newest first. */
  days: KpiRow[];
  zones: ZoneRow[];
  methods: KpiRow[];
}

/** A breakdown's rows with something in them, the larger Ordered value first (then Sales, then the key). */
export function ranked<T extends KpiRow>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => r.ordered.orders || r.sales.orders)
    .sort((a, b) => b.ordered.valueMinor - a.ordered.valueMinor || b.sales.valueMinor - a.sales.valueMinor || a.key.localeCompare(b.key));
}

/** The average order of the Ordered value (null with no order). */
export const averageOf = (k: Kpi): number | null => (k.ordered.orders ? Math.round(k.ordered.valueMinor / k.ordered.orders) : null);

export async function orderReport(db: PrismaClient, input: { days: OrderReportDays; timeZone: string; now?: Date; storeId?: number }): Promise<OrderReport> {
  const storeId = input.storeId ?? MOTHER_STORE_ID;
  const w = lastDays(input.days, input.now ?? new Date(), input.timeZone);
  const [total, days, zones, methods, bands] = await Promise.all([
    kpi(db, storeId, w.period),
    kpiByDay(db, storeId, { from: w.from, to: w.to }, input.timeZone),
    kpiByZone(db, storeId, w.period),
    kpiByPaymentMethod(db, storeId, w.period),
    db.deliveryBand.findMany({ where: { storeId }, select: { key: true, nameEn: true, nameBn: true } }),
  ]);
  const band = new Map(bands.map((b) => [b.key, b]));
  return {
    from: w.from,
    to: w.to,
    total,
    days: [...days].reverse().filter((r) => r.ordered.orders || r.sales.orders),
    zones: ranked(zones.map((z) => ({ ...z, nameEn: band.get(z.key)?.nameEn ?? null, nameBn: band.get(z.key)?.nameBn ?? null }))),
    methods: ranked(methods),
  };
}
