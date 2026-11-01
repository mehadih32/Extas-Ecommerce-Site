// S16 · PR 349 (B3.10 money reporting; BACKEND-ARCHITECTURE §5 MNY-01, §10.2 M1, M5–M9, M11–M14) — profit and loss for
// a period on the money registry, built only from the per-order profit (order-profit.ts) so the two never disagree:
//   Sales (M1, delivered orders on their delivered day) — with Ordered value beside it, never instead of it
//   − product cost (M9) = gross profit (M11)
//   + delivery charges (M5) − courier (M6) − payment fees (M7) − packaging − messages and AI = contribution (M12)
//   − ad spend imported for the period's days (M8) − the other cost-ledger rows of the period (month-end expenses, M13:
//     daily cost lines, expenses, return losses, messages not about a delivered order) − fixed costs (added by the caller,
//     which spreads each month's fixed costs over its days) = net profit (M14).
// PR 353: pieces that came back after receipt — returns (M2 value) off Sales = net delivered sales (M4); gross profit is
// M4 − M9 (the kept pieces' cost); the booked return loss (M10) is inside the contribution, so its rows are no longer
// among the other cost rows when the order is a delivered one.
// An order without a cost snapshot on a counted line is left out of every profit line (never cost 0) and counted in
// `uncosted` with its SKUs, so the coverage is shown; a part not known yet on a costed order (courier charge, a fee
// figure, packaging) is left out and counted in `missing`. Store-scoped, archived orders skipped, minor units.
import { basisWhere, kpi, type Db } from './metrics';
import { orderProfits, PROFIT_PARTS, RETURN_LOSS, SALE_RETURN_KINDS, type ProfitInputs, type ProfitPart } from './order-profit';
import { BASIS_RULE, daysPeriod, nextDay } from './pure';

export type PnlInputs = Omit<ProfitInputs, 'ads'>;

/** The parts of the contribution a costed order can be missing (not known yet). */
export const PNL_MAYBE_MISSING = ['courier', 'codFee', 'paymentFees', 'packaging'] as const satisfies readonly ProfitPart[];

export interface PnlLine {
  key: string;
  minor: number;
}

export interface Pnl {
  from: string;
  to: string;
  /** Delivered orders in the period, and how many of them had a cost on every counted line. */
  orders: number;
  costedOrders: number;
  /** Orders left out of the profit lines for a missing cost, with the SKUs without one. */
  uncosted: { orders: number; salesMinor: number; skus: string[] };
  /** M1 over every delivered order, and Ordered value (placed orders) shown beside it. */
  salesMinor: number;
  orderedMinor: number;
  /** Over the costed orders: each part of the per-order profit (unknown parts left out). */
  parts: Record<ProfitPart, number>;
  /** How many costed orders were missing each part. */
  missing: Record<(typeof PNL_MAYBE_MISSING)[number], number>;
  /** PR 354: how many costed orders had a parcel priced from the rate card (`costs.courierEstimate`). */
  estimatedCourier: number;
  /** PR 353: M4 over the costed orders — their Sales less the goods that came back. */
  netSalesMinor: number;
  grossProfitMinor: number;
  contributionMinor: number;
  /** M8 over the period's days; null when an imported row has no converted amount; `adsImported` false when no rows. */
  adsMinor: number | null;
  adsImported: boolean;
  /** M13: the period's cost-ledger rows not already inside an order's contribution, by service. */
  otherCosts: PnlLine[];
  otherCostsMinor: number;
  /** Day by day (the delivered day), newest first: orders, sales of costed orders, gross profit, contribution. */
  byDay: { day: string; orders: number; salesMinor: number; grossProfitMinor: number; contributionMinor: number }[];
}

const zeroParts = () => Object.fromEntries(PROFIT_PARTS.map((k) => [k, 0])) as Record<ProfitPart, number>;
const grossOf = (p: Record<ProfitPart, number>) => p.sales - p.returns - p.productCost;
const contributionOf = (p: Record<ProfitPart, number>) => grossOf(p) + p.deliveryCharge - p.courier - p.codFee - p.paymentFees - p.packaging - p.messages - p.returnLoss;

/** Profit and loss of one store over the days `from`–`to` (the store's own days), fixed costs not included. */
export async function profitAndLoss(db: Db, storeId: number, days: { from: string; to: string }, inputs: PnlInputs): Promise<Pnl> {
  const period = daysPeriod(days.from, days.to, inputs.timeZone);
  const delivered = await db.$queryRaw<{ id: string }[]>`SELECT o."id" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)}`;
  const ids = delivered.map((r) => r.id);
  const [profits, k, ads, other] = await Promise.all([
    orderProfits(db, storeId, ids, { ...inputs, ads: { allocate: false, basis: 'month' } }),
    kpi(db, storeId, period),
    db.$queryRaw<{ minor: bigint | null; rows: number; unknown: number }[]>`
      SELECT SUM(CASE WHEN a."currency" = ${inputs.currency} THEN a."spendMinor" ELSE a."spendStoreMinor" END)::bigint AS "minor",
             COUNT(*)::int AS "rows",
             COUNT(*) FILTER (WHERE a."currency" <> ${inputs.currency} AND a."spendStoreMinor" IS NULL)::int AS "unknown"
        FROM "AdSpendDaily" a
       WHERE a."storeId" = ${storeId} AND a."date" >= ${days.from}::date AND a."date" <= ${days.to}::date`,
    // the period's cost rows, except those counted inside a delivered order's contribution (its paid messages and the
    // rows booked to the order itself); business day = costDate, else the store's day of occurredAt (as PR 347)
    db.$queryRaw<{ service: string; minor: bigint }[]>`
      SELECT c."service", SUM(c."amountMinor")::bigint AS "minor"
        FROM "CostEntry" c
        LEFT JOIN "NotificationLog" l ON c."refType" = 'notification' AND l."id"::text = c."refId"
        LEFT JOIN "ReturnItem" ri ON c."refType" = 'ReturnItem' AND c."service" = ${RETURN_LOSS} AND ri."id"::text = c."refId" AND ri."storeId" = c."storeId"
        LEFT JOIN "ReturnRecord" rr ON rr."id" = ri."returnId" AND rr."kind"::text = ANY(${[...SALE_RETURN_KINDS]}) AND rr."receivedAt" IS NOT NULL
        LEFT JOIN "Order" o ON o."storeId" = c."storeId"
                           AND o."id"::text = (CASE WHEN c."refType" = 'Order' THEN c."refId" WHEN c."refType" = 'ReturnItem' THEN rr."orderId"::text ELSE l."orderId"::text END)
       WHERE c."storeId" = ${storeId}
         AND COALESCE(c."costDate", (c."occurredAt" AT TIME ZONE ${inputs.timeZone})::date) >= ${days.from}::date
         AND COALESCE(c."costDate", (c."occurredAt" AT TIME ZONE ${inputs.timeZone})::date) < ${nextDay(days.to)}::date
         AND NOT (o."id" IS NOT NULL AND o."archivedAt" IS NULL AND o."status"::text = ANY(${[...BASIS_RULE.sales.statuses]}) AND o."deliveredAt" IS NOT NULL)
       GROUP BY 1`,
  ]);

  const parts = zeroParts();
  const missing = Object.fromEntries(PNL_MAYBE_MISSING.map((k) => [k, 0])) as Pnl['missing'];
  const uncostedSkus = new Set<string>();
  let salesMinor = 0;
  let costedOrders = 0;
  let uncostedOrders = 0;
  let uncostedSales = 0;
  let estimatedCourier = 0;
  const dayMap = new Map<string, { day: string; orders: number; salesMinor: number; grossProfitMinor: number; contributionMinor: number }>();
  for (const p of profits.values()) {
    const sales = p.parts.sales.minor ?? 0;
    salesMinor += sales;
    const day = dayMap.get(p.deliveredDay!) ?? { day: p.deliveredDay!, orders: 0, salesMinor: 0, grossProfitMinor: 0, contributionMinor: 0 };
    day.orders += 1;
    dayMap.set(day.day, day);
    if (p.parts.productCost.minor === null) {
      uncostedOrders += 1;
      uncostedSales += sales;
      for (const s of p.uncostedSkus) uncostedSkus.add(s);
      continue;
    }
    costedOrders += 1;
    const own = zeroParts();
    for (const key of PROFIT_PARTS) {
      const v = p.parts[key].minor;
      if (v !== null) own[key] = v;
    }
    for (const key of PNL_MAYBE_MISSING) if (p.parts[key].state === 'missing') missing[key] += 1;
    if (p.parts.courier.state === 'estimated') estimatedCourier += 1;
    for (const key of PROFIT_PARTS) parts[key] += own[key];
    day.salesMinor += own.sales;
    day.grossProfitMinor += grossOf(own);
    day.contributionMinor += contributionOf(own);
  }
  const a = ads[0]!;
  const otherCosts = other.map((r) => ({ key: r.service, minor: Number(r.minor) })).sort((x, y) => y.minor - x.minor || x.key.localeCompare(y.key));
  return {
    from: days.from,
    to: days.to,
    orders: profits.size,
    costedOrders,
    uncosted: { orders: uncostedOrders, salesMinor: uncostedSales, skus: [...uncostedSkus].sort() },
    salesMinor,
    orderedMinor: k.ordered.valueMinor,
    parts,
    missing,
    estimatedCourier,
    netSalesMinor: parts.sales - parts.returns,
    grossProfitMinor: grossOf(parts),
    contributionMinor: contributionOf(parts),
    adsMinor: a.unknown > 0 ? null : Number(a.minor ?? 0),
    adsImported: a.rows > 0,
    otherCosts,
    otherCostsMinor: otherCosts.reduce((s, x) => s + x.minor, 0),
    byDay: [...dayMap.values()].sort((x, y) => y.day.localeCompare(x.day)),
  };
}
