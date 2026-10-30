// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) — Sales by SKU, for the ERP's "Top products" (the ERP asks the shop
// live, GET /erp-api/top-products). The one KPI rule (pure.ts BASIS_RULE `sales`): delivered orders, counted on the day
// they were delivered, archived orders skipped, counted lines only (COUNTED_LINE_STATUS). Per SKU: the pieces, the net
// sales (the line totals, after each line's own discount) and the profit over the cost snapshot each line carries
// (OrderItem.unitCostMinor, the buying price when the order was placed). A SKU with one line without a cost has no
// profit (null): never guessed. Best first by net sales, then pieces, then SKU. Store-scoped like every figure here.
import { Prisma } from '@extas/db/client';
import { basisWhere, type Db } from './metrics';
import { COUNTED_LINE_STATUS, type Period } from './pure';

export interface SkuFigure {
  sku: string;
  /** The product name on the latest line sold. */
  name: string;
  pieces: number;
  /** Net sales, minor units. */
  salesMinor: number;
  /** The pieces at their cost snapshots; null when a line has none. */
  costMinor: number | null;
  /** Net sales − cost; null when the cost is not known. */
  profitMinor: number | null;
}

interface Row {
  sku: string;
  name: string;
  pieces: bigint;
  sales: bigint;
  cost: bigint | null;
  costed: boolean;
}

/** A whole-number sum read back exactly (throws rather than round). */
function exact(v: bigint | number): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || (typeof v === 'bigint' && BigInt(n) !== v)) throw new RangeError('an amount left the exact range');
  return n;
}

/** Sales by SKU over the period, best first, at most `limit` SKUs. */
export async function salesBySku(db: Db, storeId: number, period: Period, limit: number): Promise<SkuFigure[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('a limit is a whole number from 1');
  const rows = await db.$queryRaw<Row[]>`
    SELECT oi."sku" AS "sku",
           (array_agg(oi."productName" ORDER BY o."deliveredAt" DESC, oi."createdAt" DESC, oi."id" DESC))[1] AS "name",
           sum(oi."quantity")::bigint                                          AS "pieces",
           COALESCE(sum(oi."lineTotalMinor"), 0)::bigint                       AS "sales",
           sum(oi."quantity"::bigint * oi."unitCostMinor")::bigint             AS "cost",
           bool_and(oi."unitCostMinor" IS NOT NULL)                            AS "costed"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    WHERE ${basisWhere('sales', storeId, period)} AND oi."storeId" = ${storeId} AND oi."status"::text = ${COUNTED_LINE_STATUS}
    GROUP BY oi."sku"
    ORDER BY 4 DESC, 3 DESC, 1 ASC
    LIMIT ${Prisma.raw(String(limit))}`;
  return rows.map((r) => {
    const salesMinor = exact(r.sales);
    const costMinor = r.costed && r.cost !== null ? exact(r.cost) : null;
    return { sku: r.sku, name: r.name, pieces: exact(r.pieces), salesMinor, costMinor, profitMinor: costMinor === null ? null : salesMinor - costMinor };
  });
}
