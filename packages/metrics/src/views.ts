// The KPI report views (PR 155, follow-up 92; migration 0012_kpi_report_views): mv_kpi_daily and mv_kpi_lines_monthly
// hold Sales (delivered day) and Ordered value (placed day) precomputed, with exactly the rule in pure.ts, so a long
// report never adds up the live order tables. This file is the only reader of the views and the only caller of their
// refresh (src/guard.test.ts fails the build when anything else reads an `mv_…` view).
//
// A view row carries the time zone its days were counted in (the setting `store.timeZone` at refresh time). A screen
// that asks in another time zone (the setting changed since the last refresh) gets live numbers instead, from the same
// functions as before, and is told so (`source`). The views are as fresh as their last refresh
// (reports.viewRefreshMinutes); a screen that needs "this minute" uses `kpi` / `kpiByDay` directly.
import type { Db, KpiRow } from './metrics';
import { kpiByDay } from './metrics';
import { BASES, NO_ORDERS, daysBetween, type Basis, type OrderFigure } from './pure';

/** The KPI views, in refresh order. */
export const KPI_VIEWS = ['mv_kpi_daily', 'mv_kpi_lines_monthly'] as const;

/** Where a breakdown came from: the precomputed views, or the live tables (the views were counted in another zone). */
export type FigureSource = 'view' | 'live';

/**
 * Refreshes both KPI views without blocking their readers (REFRESH … CONCURRENTLY inside the database function, which
 * runs as the views' owner, so the app's own role may call it). The reports job (PR 603) calls this on its interval.
 */
export async function refreshKpiViews(db: Db): Promise<void> {
  await db.$executeRaw`SELECT extas_refresh_kpi_views()`;
}

interface DailyRow {
  basis: Basis;
  day: string;
  timeZone: string;
  orders: bigint | number;
  value: bigint | number;
  items: bigint | number;
  delivery: bigint | number;
}

const fig = (r: DailyRow): OrderFigure => ({ orders: Number(r.orders), valueMinor: Number(r.value), itemsMinor: Number(r.items), deliveryMinor: Number(r.delivery) });

/**
 * Day by day from mv_kpi_daily: the same rows as `kpiByDay` (shop days `from` … `to`, both included, every day
 * present), or `kpiByDay` itself when the view was counted in another time zone than `timeZone`.
 */
export async function kpiByDayFromView(db: Db, storeId: number, days: { from: string; to: string }, timeZone: string): Promise<{ rows: KpiRow[]; source: FigureSource }> {
  const all = daysBetween(days.from, days.to);
  const zones = await db.$queryRaw<{ timeZone: string }[]>`SELECT DISTINCT "timeZone" FROM "mv_kpi_daily" WHERE "storeId" = ${storeId}`;
  if (zones.some((z) => z.timeZone !== timeZone)) return { rows: await kpiByDay(db, storeId, days, timeZone), source: 'live' };
  const rows = await db.$queryRaw<DailyRow[]>`
    SELECT "basis", to_char("day", 'YYYY-MM-DD') AS "day", "timeZone", "orders", "valueMinor" AS "value", "itemsMinor" AS "items", "deliveryMinor" AS "delivery"
    FROM "mv_kpi_daily"
    WHERE "storeId" = ${storeId} AND "day" >= ${days.from}::date AND "day" <= ${days.to}::date`;
  const by = new Map(BASES.map((b) => [b, new Map<string, OrderFigure>()]));
  for (const r of rows) by.get(r.basis)?.set(r.day, fig(r));
  return {
    rows: all.map((d) => ({ key: d, ordered: by.get('ordered')?.get(d) ?? { ...NO_ORDERS }, sales: by.get('sales')?.get(d) ?? { ...NO_ORDERS } })),
    source: 'view',
  };
}

/** One row of mv_kpi_lines_monthly: the lines of one basis, shop month, product and place, added up. */
export interface LineMonthRow {
  basis: Basis;
  /** First day of the shop month, YYYY-MM-01. */
  month: string;
  productId: string | null;
  categoryId: string | null;
  styleGroupId: string | null;
  districtId: string | null;
  upazilaId: string | null;
  /** Distinct orders in this row (not additive across rows: one order can have lines in several rows). */
  orders: number;
  units: number;
  valueMinor: number;
  regularMinor: number;
  savedMinor: number;
}

const MONTH = /^\d{4}-\d{2}$/;

/**
 * The order lines of shop months `from` … `to` (YYYY-MM, both included) from mv_kpi_lines_monthly, both bases, for the
 * district and style reports. Null when the view was counted in another time zone than `timeZone` (the caller then
 * uses `lines` / `linesBoth` for the period).
 */
export async function linesByMonthFromView(db: Db, storeId: number, months: { from: string; to: string }, timeZone: string): Promise<LineMonthRow[] | null> {
  if (!MONTH.test(months.from) || !MONTH.test(months.to) || months.to < months.from) throw new RangeError(`not a span of months: ${months.from} … ${months.to}`);
  const zones = await db.$queryRaw<{ timeZone: string }[]>`SELECT DISTINCT "timeZone" FROM "mv_kpi_lines_monthly" WHERE "storeId" = ${storeId}`;
  if (zones.some((z) => z.timeZone !== timeZone)) return null;
  const rows = await db.$queryRaw<(Omit<LineMonthRow, 'orders' | 'units' | 'valueMinor' | 'regularMinor' | 'savedMinor'> & Record<'orders' | 'units' | 'valueMinor' | 'regularMinor' | 'savedMinor', bigint | number>)[]>`
    SELECT "basis", to_char("month", 'YYYY-MM-DD') AS "month", "productId"::text AS "productId", "categoryId"::text AS "categoryId",
           "styleGroupId"::text AS "styleGroupId", "districtId"::text AS "districtId", "upazilaId"::text AS "upazilaId",
           "orders", "units", "valueMinor", "regularMinor", "savedMinor"
    FROM "mv_kpi_lines_monthly"
    WHERE "storeId" = ${storeId} AND "month" >= ${`${months.from}-01`}::date AND "month" <= ${`${months.to}-01`}::date
    ORDER BY "month", "basis", "productId" NULLS LAST, "districtId" NULLS LAST, "upazilaId" NULLS LAST`;
  return rows.map((r) => ({
    ...r,
    orders: Number(r.orders),
    units: Number(r.units),
    valueMinor: Number(r.valueMinor),
    regularMinor: Number(r.regularMinor),
    savedMinor: Number(r.savedMinor),
  }));
}
