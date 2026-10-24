// S14 · PR 284, 285 — one customer's money through the one KPI rule (PR 155, CN-022): his lifetime value is "Sales"
// (delivered orders only, all time), always shown beside his "Ordered value" (every placed order), never instead of it.
//
// A customer is a set of profiles (the survivor and the profiles merged into it, PR 284) and their numbers: an order is
// his when it carries one of his profile ids, or when it was placed without an account (a guest's order while the
// automatic account is off) with one of his numbers. A gift's number is the receiver's, so a guest gift is never counted
// for whoever owns that number. Each order counts once, however many ways it matches.
//
// `customerFiguresSql` is the figure as a SQL subquery over any set of people (the Customers list joins it to sort and
// filter by spend); `customerKpis` runs it for a few named people (one customer's page, a merge pair);
// `customerOrdersSql` is the person-to-order rule itself, for counts that are not money (the list's refusals). Like metrics.ts,
// everything is store-scoped, skips archived orders, and reads the status rule from pure.ts (BASIS_RULE).
import { Prisma } from '@extas/db/client';
import { BASIS_RULE, NO_ORDERS, type Basis, type OrderFigure } from './pure';
import type { Db, Kpi } from './metrics';

/** Who one figure is about: his profile ids and the numbers (every stored form) his guest orders may carry. */
export interface CustomerRef {
  key: string;
  customerIds: readonly string[];
  phones: readonly string[];
}

/** Both figures for one customer, with when he first and last ordered (placed orders). */
export interface CustomerKpi extends Kpi {
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
}

export const NO_CUSTOMER_KPI: CustomerKpi = Object.freeze({ sales: { ...NO_ORDERS }, ordered: { ...NO_ORDERS }, firstOrderAt: null, lastOrderAt: null });

/** Whether an order (alias `o`) counts in a figure by its status (the same rule as basisWhere, without the period). */
export function statusRule(basis: Basis): Prisma.Sql {
  const r = BASIS_RULE[basis];
  const statuses = [...r.statuses];
  return r.include ? Prisma.sql`o."status"::text = ANY(${statuses})` : Prisma.sql`NOT (o."status"::text = ANY(${statuses}))`;
}

/**
 * The person's orders as rows `(k, id)`: any order of one of his profiles, and a guest's order (never a gift) with one
 * of his numbers — the one rule every customer figure and list count uses. `people` as in `customerFiguresSql`.
 * Drafts and archived orders are left to the caller (counts read the order's status).
 */
export function customerOrdersSql(storeId: number, people: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
      SELECT p.k, o."id" FROM (${people}) p JOIN "Order" o ON o."customerId" = p.cid WHERE o."storeId" = ${storeId}
      UNION
      SELECT p.k, o."id" FROM (${people}) p JOIN "Order" o ON o."customerId" IS NULL AND NOT o."isGift" AND o."phone" = p.phone WHERE o."storeId" = ${storeId}`;
}

/**
 * Per person, both figures over all time. `people` is a SQL query with the columns `k` (the person's key, text),
 * `cid` (one of his profile ids, uuid, or null) and `phone` (one of his numbers, or null). The result's columns: k,
 * ordered_orders, ordered_value, ordered_items, ordered_delivery, sales_orders, sales_value, sales_items,
 * sales_delivery, first_at, last_at. A person with no order has no row.
 */
export function customerFiguresSql(storeId: number, people: Prisma.Sql): Prisma.Sql {
  const ordered = statusRule('ordered');
  const sales = statusRule('sales');
  return Prisma.sql`
    WITH own AS (${customerOrdersSql(storeId, people)})
    SELECT own.k AS "k",
           count(*) FILTER (WHERE ${ordered})                                                  AS "ordered_orders",
           COALESCE(sum(o."totalMinor") FILTER (WHERE ${ordered}), 0)::bigint                   AS "ordered_value",
           COALESCE(sum(o."subtotalMinor" - o."discountMinor") FILTER (WHERE ${ordered}), 0)::bigint AS "ordered_items",
           COALESCE(sum(o."deliveryChargeMinor") FILTER (WHERE ${ordered}), 0)::bigint          AS "ordered_delivery",
           count(*) FILTER (WHERE ${sales})                                                    AS "sales_orders",
           COALESCE(sum(o."totalMinor") FILTER (WHERE ${sales}), 0)::bigint                     AS "sales_value",
           COALESCE(sum(o."subtotalMinor" - o."discountMinor") FILTER (WHERE ${sales}), 0)::bigint AS "sales_items",
           COALESCE(sum(o."deliveryChargeMinor") FILTER (WHERE ${sales}), 0)::bigint            AS "sales_delivery",
           min(o."placedAt") FILTER (WHERE ${ordered})                                         AS "first_at",
           max(o."placedAt") FILTER (WHERE ${ordered})                                         AS "last_at"
    FROM own JOIN "Order" o ON o."id" = own."id"
    WHERE o."archivedAt" IS NULL
    GROUP BY own.k`;
}

interface FigureRow {
  k: string;
  ordered_orders: bigint | number;
  ordered_value: bigint | number;
  ordered_items: bigint | number;
  ordered_delivery: bigint | number;
  sales_orders: bigint | number;
  sales_value: bigint | number;
  sales_items: bigint | number;
  sales_delivery: bigint | number;
  first_at: Date | null;
  last_at: Date | null;
}

const fig = (orders: bigint | number, value: bigint | number, items: bigint | number, delivery: bigint | number): OrderFigure => ({
  orders: Number(orders),
  valueMinor: Number(value),
  itemsMinor: Number(items),
  deliveryMinor: Number(delivery),
});

/** One row of `customerFiguresSql` as the KPI pair. */
export function customerKpiOf(r: FigureRow | undefined): CustomerKpi {
  if (!r) return { ...NO_CUSTOMER_KPI, sales: { ...NO_ORDERS }, ordered: { ...NO_ORDERS } };
  return {
    ordered: fig(r.ordered_orders, r.ordered_value, r.ordered_items, r.ordered_delivery),
    sales: fig(r.sales_orders, r.sales_value, r.sales_items, r.sales_delivery),
    firstOrderAt: r.first_at,
    lastOrderAt: r.last_at,
  };
}

/** Both figures, all time, for each named person (a key with no order gets the empty pair). */
export async function customerKpis(db: Db, storeId: number, people: readonly CustomerRef[]): Promise<Map<string, CustomerKpi>> {
  const out = new Map<string, CustomerKpi>(people.map((p) => [p.key, customerKpiOf(undefined)]));
  const rows: Prisma.Sql[] = [];
  for (const p of people) {
    for (const id of new Set(p.customerIds)) rows.push(Prisma.sql`(${p.key}::text, ${id}::uuid, NULL::text)`);
    for (const ph of new Set(p.phones)) rows.push(Prisma.sql`(${p.key}::text, NULL::uuid, ${ph}::text)`);
  }
  if (!rows.length) return out;
  const values = Prisma.sql`SELECT * FROM (VALUES ${Prisma.join(rows)}) AS v(k, cid, phone)`;
  const got = await db.$queryRaw<FigureRow[]>(customerFiguresSql(storeId, values));
  for (const r of got) out.set(r.k, customerKpiOf(r));
  return out;
}
