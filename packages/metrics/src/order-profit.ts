// S16 · PR 348 (B3.9 "per-order cost allocation feeds the per-order profit figure"; BACKEND-ARCHITECTURE §10.2 M1, M5–M9,
// M12) — what one delivered order earned after its own costs. Per order:
//   + goods sold (M1: the order's items after line and order discounts, the same figure as Sales)
//   + the delivery charge on it (M5, the order's snapshot)
//   − product cost (M9: each counted line's cost snapshot × quantity; a line without a cost makes the cost unknown, and
//     its SKU is listed — never cost 0)
//   − courier (M6: the charge on each real parcel of the order; a mock parcel is practice and costs nothing; exchange legs
//     are the exchange's own; a real parcel without a charge yet makes it unknown)
//   − payment fees (M7: each paid online payment at the owner's fee figures, `costs.gatewayFees`; a provider without a
//     figure makes it unknown; COD, cash, wallet and bank transfer have none here)
//   − packaging (`costs.packaging`, the owner's figure per order; unknown until entered)
//   − messages and AI (the cost rows written for this order: each paid message sent about it, and any row booked to
//     the order itself)
//   − ad spend (M8, estimated: the period's imported spend spread evenly over the orders delivered in it — the store's
//     month by default, or its day; off by the owner's switch `costs.allocation.adSpend`)
// The profit is shown only when the product cost is known; any other unknown part is left out and named, so a figure
// is never made to look complete. Only delivered orders have a profit (the one KPI rule, pure.ts BASIS_RULE `sales`).
import { Prisma } from '@extas/db/client';
import { type Db } from './metrics';
import { BASIS_RULE, COUNTED_LINE_STATUS, dayStart, nextDay } from './pure';

/** The parts of an order's profit, in the order they are added up. */
export const PROFIT_PARTS = ['sales', 'deliveryCharge', 'productCost', 'courier', 'paymentFees', 'packaging', 'messages', 'ads'] as const;
export type ProfitPart = (typeof PROFIT_PARTS)[number];
/** The parts that are added (the rest are costs, taken away). */
export const PROFIT_INCOME: readonly ProfitPart[] = ['sales', 'deliveryCharge'];

/** known: from the order's own records (no ad spend at all is a known 0); estimated: spread over orders (ad spend); missing: not known yet; off: switched off. */
export type PartState = 'known' | 'estimated' | 'missing' | 'off';

export interface PartFigure {
  minor: number | null;
  state: PartState;
}

export interface OrderProfit {
  orderId: string;
  number: string;
  /** The store-time-zone day it was delivered; null when it is not (yet) a delivered order. */
  deliveredDay: string | null;
  parts: Record<ProfitPart, PartFigure>;
  /** SKUs of counted lines without a cost snapshot. */
  uncostedSkus: string[];
  /** Sales + delivery charge − every known cost; null while not delivered or while the product cost is unknown. */
  profitMinor: number | null;
  /** complete: every part known; estimated: ad spend spread in; partial: a part is missing; notDelivered. */
  status: 'complete' | 'estimated' | 'partial' | 'notDelivered';
}

export interface ProfitInputs {
  currency: string;
  timeZone: string;
  /** The owner's packaging cost of one order, or null while not entered. */
  packagingMinor: number | null;
  /** What a gateway keeps of one payment by the owner's figures, or null when the provider has none. */
  gatewayFee: (amountMinor: number, provider: string) => number | null;
  /** `costs.allocation`: spread ad spend over delivered orders, by the store's month or day. */
  ads: { allocate: boolean; basis: 'month' | 'day' };
}

/** The payment methods a gateway takes a fee on (COD, cash, wallet and bank transfer have none here). */
export const FEE_METHODS = ['BKASH', 'NAGAD', 'CARD', 'ROCKET', 'UPAY', 'ONLINE'] as const;
/** A payment that came in (a later refund does not give the fee back). */
const FEE_STATUSES = ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'];
/** The cost rows of a paid message (packages/messages/src/costs.ts SEND_COST_REF) and rows booked to the order itself. */
const MESSAGE_REF = 'notification';
const ORDER_REF = 'Order';

const n = (v: bigint | number | null) => (v === null ? null : Number(v));

/** The ad-spend period an order delivered on `day` falls in. */
const adPeriodOf = (day: string, basis: 'month' | 'day') => (basis === 'day' ? day : day.slice(0, 7));
const adPeriodBounds = (key: string) => (key.length === 10 ? { from: key, to: key } : { from: `${key}-01`, to: lastDayOf(key) });
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Each order's profit (store-scoped; ids of other stores or unknown ids are left out of the map). */
export async function orderProfits(db: Db, storeId: number, orderIds: readonly string[], inputs: ProfitInputs): Promise<Map<string, OrderProfit>> {
  const ids = [...new Set(orderIds)];
  const out = new Map<string, OrderProfit>();
  if (!ids.length) return out;
  const sales = BASIS_RULE.sales;
  const tz = inputs.timeZone;

  const [orders, lines, parcels, payments, messageCosts] = await Promise.all([
    db.$queryRaw<{ id: string; number: string; status: string; items: number; delivery: number; day: string | null }[]>`
      SELECT o."id", o."number", o."status"::text AS "status", (o."subtotalMinor" - o."discountMinor") AS "items", o."deliveryChargeMinor" AS "delivery",
             CASE WHEN o."${Prisma.raw(sales.at)}" IS NULL THEN NULL ELSE to_char(o."${Prisma.raw(sales.at)}" AT TIME ZONE ${tz}, 'YYYY-MM-DD') END AS "day"
        FROM "Order" o
       WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."id" = ANY(${ids}::uuid[])`,
    db.$queryRaw<{ orderId: string; sku: string; cost: bigint | null; costed: boolean }[]>`
      SELECT i."orderId", i."sku", SUM(i."unitCostMinor"::bigint * i."quantity")::bigint AS "cost", bool_and(i."unitCostMinor" IS NOT NULL) AS "costed"
        FROM "OrderItem" i
       WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
       GROUP BY 1, 2`,
    db.$queryRaw<{ orderId: string; charge: bigint | null; known: boolean }[]>`
      SELECT s."orderId", SUM(s."chargeMinor")::bigint AS "charge", bool_and(s."chargeMinor" IS NOT NULL) AS "known"
        FROM "Shipment" s
       WHERE s."storeId" = ${storeId} AND s."orderId" = ANY(${ids}::uuid[]) AND s."isExchangeLeg" = false AND s."mode"::text IS DISTINCT FROM 'MOCK'
         AND s."consignmentId" IS NOT NULL
       GROUP BY 1`,
    db.$queryRaw<{ orderId: string; method: string; provider: string | null; amountMinor: number }[]>`
      SELECT p."orderId", p."method"::text AS "method", p."provider", p."amountMinor"
        FROM "Payment" p
       WHERE p."storeId" = ${storeId} AND p."orderId" = ANY(${ids}::uuid[]) AND p."method"::text = ANY(${[...FEE_METHODS]}) AND p."status"::text = ANY(${FEE_STATUSES})`,
    db.$queryRaw<{ orderId: string; minor: bigint }[]>`
      SELECT x."orderId", SUM(x."amount")::bigint AS "minor" FROM (
        SELECT l."orderId" AS "orderId", c."amountMinor" AS "amount"
          FROM "CostEntry" c JOIN "NotificationLog" l ON l."id"::text = c."refId"
         WHERE c."storeId" = ${storeId} AND c."refType" = ${MESSAGE_REF} AND l."orderId" = ANY(${ids}::uuid[])
        UNION ALL
        SELECT c."refId"::uuid AS "orderId", c."amountMinor" AS "amount"
          FROM "CostEntry" c
         WHERE c."storeId" = ${storeId} AND c."refType" = ${ORDER_REF} AND c."refId" = ANY(${ids}::text[])
      ) x GROUP BY 1`,
  ]);

  const costOf = new Map<string, { minor: number; costed: boolean; uncosted: string[] }>();
  for (const l of lines) {
    const c = costOf.get(l.orderId) ?? { minor: 0, costed: true, uncosted: [] };
    if (l.costed && l.cost !== null) c.minor += Number(l.cost);
    else {
      c.costed = false;
      c.uncosted.push(l.sku);
    }
    costOf.set(l.orderId, c);
  }
  const parcelOf = new Map(parcels.map((p) => [p.orderId, p]));
  const feeOf = new Map<string, { minor: number; known: boolean }>();
  for (const p of payments) {
    if (!p.orderId) continue;
    const f = feeOf.get(p.orderId) ?? { minor: 0, known: true };
    const fee = inputs.gatewayFee(p.amountMinor, (p.provider ?? p.method).toLowerCase());
    if (fee === null) f.known = false;
    else f.minor += fee;
    feeOf.set(p.orderId, f);
  }
  const msgOf = new Map(messageCosts.map((m) => [m.orderId, Number(m.minor)]));

  const delivered = (o: { status: string; day: string | null }) => o.day !== null && sales.statuses.includes(o.status);
  const ads = inputs.ads.allocate ? await adShares(db, storeId, [...new Set(orders.filter(delivered).map((o) => adPeriodOf(o.day!, inputs.ads.basis)))], inputs) : new Map<string, number | null>();

  for (const o of orders) {
    const isDelivered = delivered(o);
    const c = costOf.get(o.id) ?? { minor: 0, costed: true, uncosted: [] };
    const parcel = parcelOf.get(o.id);
    const fee = feeOf.get(o.id);
    const ad = isDelivered && inputs.ads.allocate ? (ads.get(adPeriodOf(o.day!, inputs.ads.basis)) ?? null) : null;
    const parts: Record<ProfitPart, PartFigure> = {
      sales: { minor: Number(o.items), state: 'known' },
      deliveryCharge: { minor: Number(o.delivery), state: 'known' },
      productCost: c.costed ? { minor: c.minor, state: 'known' } : { minor: null, state: 'missing' },
      courier: !parcel ? { minor: 0, state: 'known' } : parcel.known ? { minor: n(parcel.charge), state: 'known' } : { minor: null, state: 'missing' },
      paymentFees: !fee ? { minor: 0, state: 'known' } : fee.known ? { minor: fee.minor, state: 'known' } : { minor: null, state: 'missing' },
      packaging: inputs.packagingMinor === null ? { minor: null, state: 'missing' } : { minor: inputs.packagingMinor, state: 'known' },
      messages: { minor: msgOf.get(o.id) ?? 0, state: 'known' },
      ads: !inputs.ads.allocate ? { minor: null, state: 'off' } : ad === null ? { minor: null, state: 'missing' } : { minor: ad, state: ad === 0 ? 'known' : 'estimated' },
    };
    let profitMinor: number | null = null;
    if (isDelivered && parts.productCost.minor !== null) {
      profitMinor = 0;
      for (const k of PROFIT_PARTS) {
        const v = parts[k].minor;
        if (v !== null) profitMinor += PROFIT_INCOME.includes(k) ? v : -v;
      }
    }
    const states = PROFIT_PARTS.map((k) => parts[k].state);
    out.set(o.id, {
      orderId: o.id,
      number: o.number,
      deliveredDay: isDelivered ? o.day : null,
      parts,
      uncostedSkus: c.uncosted.sort(),
      profitMinor,
      status: !isDelivered ? 'notDelivered' : states.includes('missing') ? 'partial' : states.includes('estimated') ? 'estimated' : 'complete',
    });
  }
  return out;
}

/**
 * Each ad period's spend per delivered order (whole minor units, rounded down; the remainder stays unallocated rather
 * than invented). A period with imported spend but a row in another currency without its converted amount is unknown;
 * a period with no spend imported is 0 when the store has no ad account, else unknown (days not imported are never 0).
 */
async function adShares(db: Db, storeId: number, periods: string[], inputs: ProfitInputs): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!periods.length) return out;
  const accounts = await db.adAccount.count({ where: { storeId } });
  for (const key of periods) {
    const { from, to } = adPeriodBounds(key);
    const [spend, count] = await Promise.all([
      db.$queryRaw<{ minor: bigint | null; rows: number; unknown: number }[]>`
        SELECT SUM(CASE WHEN a."currency" = ${inputs.currency} THEN a."spendMinor" ELSE a."spendStoreMinor" END)::bigint AS "minor",
               COUNT(*)::int AS "rows",
               COUNT(*) FILTER (WHERE a."currency" <> ${inputs.currency} AND a."spendStoreMinor" IS NULL)::int AS "unknown"
          FROM "AdSpendDaily" a
         WHERE a."storeId" = ${storeId} AND a."date" >= ${from}::date AND a."date" <= ${to}::date`,
      db.$queryRaw<{ orders: number }[]>`
        SELECT COUNT(*)::int AS "orders" FROM "Order" o
         WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."status"::text = ANY(${[...BASIS_RULE.sales.statuses]})
           AND o."${Prisma.raw(BASIS_RULE.sales.at)}" >= ${dayStart(from, inputs.timeZone)} AND o."${Prisma.raw(BASIS_RULE.sales.at)}" < ${dayStart(nextDay(to), inputs.timeZone)}`,
    ]);
    const s = spend[0]!;
    const orders = count[0]!.orders;
    if (s.unknown > 0) out.set(key, null);
    else if (s.rows === 0) out.set(key, accounts === 0 ? 0 : null);
    else out.set(key, orders > 0 ? Math.floor(Number(s.minor ?? 0) / orders) : null);
  }
  return out;
}
