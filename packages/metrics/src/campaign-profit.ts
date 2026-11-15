// Parity round 3, lane F6 · PR 865 (prototype v5 Marketing › Ad campaigns: the "Returned" and "Profit after ads" columns and the
// campaign page) — per ad campaign over the shop's days `from`–`to`: the delivered orders it brought (the Sales rule, on the delivered
// day), the parcels that came back, the contribution of the costed orders (Sales plus the delivery charge, less returns, product
// cost and every order cost, exactly as `profitByChannel`) and the campaign's own ad spend, so profit after ads = contribution − spend.
// Nothing new is stored: it reads the orders that carry the campaign (Order.adCampaignId) and the spend days. An order with no cost
// on a line is left out of the profit (its Sales is still counted). Read only, store-scoped.
import { basisWhere, type Db } from './metrics';
import { orderProfits, type ProfitInputs, type ProfitPart } from './order-profit';
import { COUNTED_LINE_STATUS, daysPeriod } from './pure';
import { returnedWhere } from './channels';

export interface CampaignProfitRow {
  adCampaignId: string;
  /** Delivered orders of the period that carry the campaign. */
  delivered: number;
  salesMinor: number;
  /** Parcels of the campaign that came back in the period. */
  returned: number;
  /** Over the costed orders (Sales less returns, product cost and every order cost). */
  contributionMinor: number;
  /** Sales of the orders left out of profit for a missing cost. */
  uncostedSalesMinor: number;
  /** The campaign's spend in the store currency; null when an amount is not known. */
  spendMinor: number | null;
  /** contribution − spend; null while the spend is not known. */
  profitMinor: number | null;
}

const OUT: readonly ProfitPart[] = ['returns', 'productCost', 'courier', 'codFee', 'paymentFees', 'packaging', 'messages', 'returnLoss'];

/** One row per ad campaign that has a delivered order, a returned parcel or spend in the period. */
export async function profitByAdCampaign(db: Db, storeId: number, days: { from: string; to: string }, inputs: ProfitInputs): Promise<Map<string, CampaignProfitRow>> {
  const period = daysPeriod(days.from, days.to, inputs.timeZone);
  const [delivered, returned, spend] = await Promise.all([
    db.$queryRaw<{ id: string; cid: string }[]>`SELECT o."id"::text AS "id", o."adCampaignId"::text AS "cid" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)} AND o."adCampaignId" IS NOT NULL`,
    db.$queryRaw<{ cid: string; n: number }[]>`SELECT o."adCampaignId"::text AS "cid", COUNT(*)::int AS "n" FROM "Order" o WHERE ${returnedWhere(storeId, period)} AND o."adCampaignId" IS NOT NULL GROUP BY 1`,
    db.$queryRaw<{ cid: string; minor: bigint | null; unknown: number }[]>`
      SELECT a."adCampaignId"::text AS "cid",
             SUM(CASE WHEN a."currency" = ${inputs.currency} THEN a."spendMinor" ELSE a."spendStoreMinor" END)::bigint AS "minor",
             COUNT(*) FILTER (WHERE a."currency" <> ${inputs.currency} AND a."spendStoreMinor" IS NULL)::int AS "unknown"
        FROM "AdSpendDaily" a
       WHERE a."storeId" = ${storeId} AND a."adCampaignId" IS NOT NULL AND a."date" >= ${days.from}::date AND a."date" <= ${days.to}::date
       GROUP BY 1`,
  ]);
  const profits = delivered.length ? await orderProfits(db, storeId, delivered.map((o) => o.id), { ...inputs, ads: { allocate: false, basis: 'month' } }) : new Map();
  const rows = new Map<string, CampaignProfitRow>();
  const rowOf = (id: string) => rows.get(id) ?? rows.set(id, { adCampaignId: id, delivered: 0, salesMinor: 0, returned: 0, contributionMinor: 0, uncostedSalesMinor: 0, spendMinor: 0, profitMinor: null }).get(id)!;
  for (const o of delivered) {
    const p = profits.get(o.id);
    if (!p) continue;
    const r = rowOf(o.cid);
    const sales = p.parts.sales.minor ?? 0;
    r.delivered += 1;
    r.salesMinor += sales;
    if (p.parts.productCost.minor === null) {
      r.uncostedSalesMinor += sales;
      continue;
    }
    let c = sales + (p.parts.deliveryCharge.minor ?? 0);
    for (const k of OUT) c -= p.parts[k].minor ?? 0;
    r.contributionMinor += c;
  }
  for (const x of returned) rowOf(x.cid).returned = x.n;
  for (const s of spend) rowOf(s.cid).spendMinor = s.unknown > 0 ? null : Number(s.minor ?? 0);
  for (const r of rows.values()) r.profitMinor = r.spendMinor === null ? null : r.contributionMinor - r.spendMinor;
  return rows;
}

/** Where a delivered order of one campaign was sent (district id) and what it held, for the campaign page's "where it sold". */
export async function campaignWhereWhat(db: Db, storeId: number, adCampaignId: string, days: { from: string; to: string }, timeZone: string): Promise<{ districts: { key: string; delivered: number }[]; products: { key: string; pieces: number }[] }> {
  const period = daysPeriod(days.from, days.to, timeZone);
  const orders = await db.$queryRaw<{ id: string; district: string | null }[]>`
    SELECT o."id"::text AS "id",
           CASE WHEN g."level"::text = 'DISTRICT' THEN g."id"::text
                ELSE (SELECT d."id"::text FROM "GeoArea" d WHERE d."id" = ANY(g."ancestorIds") AND d."level"::text = 'DISTRICT' LIMIT 1) END AS "district"
      FROM "Order" o LEFT JOIN "GeoArea" g ON g."id" = o."areaId"
     WHERE ${basisWhere('sales', storeId, period)} AND o."adCampaignId" = ${adCampaignId}::uuid
     ORDER BY o."id"`;
  const dist = new Map<string, number>();
  for (const o of orders) dist.set(o.district ?? '', (dist.get(o.district ?? '') ?? 0) + 1);
  const ids = orders.map((o) => o.id);
  const lines = ids.length
    ? await db.$queryRaw<{ productId: string | null; qty: number }[]>`
        SELECT i."productId"::text AS "productId", SUM(i."quantity")::int AS "qty" FROM "OrderItem" i
         WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS} AND i."productId" IS NOT NULL GROUP BY 1`
    : [];
  return {
    districts: [...dist.entries()].map(([key, delivered]) => ({ key, delivered })).sort((a, b) => b.delivered - a.delivered),
    products: lines.map((l) => ({ key: l.productId as string, pieces: Number(l.qty) })).sort((a, b) => b.pieces - a.pieces),
  };
}

/**
 * PR 865 (prototype Marketing › Plan › "Where to spend by district", the "Profit / order" column): the contribution of the period's
 * costed delivered orders per district (Sales plus the delivery charge, less returns, product cost and every order cost, as above;
 * ad spend not spread), with how many orders were costed. A district is the order's delivery area or the district above it.
 */
export async function contributionByDistrict(db: Db, storeId: number, days: { from: string; to: string }, inputs: ProfitInputs): Promise<Map<string, { costed: number; contributionMinor: number }>> {
  const period = daysPeriod(days.from, days.to, inputs.timeZone);
  const orders = await db.$queryRaw<{ id: string; district: string | null }[]>`
    SELECT o."id"::text AS "id",
           CASE WHEN g."level"::text = 'DISTRICT' THEN g."id"::text
                ELSE (SELECT d."id"::text FROM "GeoArea" d WHERE d."id" = ANY(g."ancestorIds") AND d."level"::text = 'DISTRICT' LIMIT 1) END AS "district"
      FROM "Order" o LEFT JOIN "GeoArea" g ON g."id" = o."areaId"
     WHERE ${basisWhere('sales', storeId, period)}
     ORDER BY o."id"`;
  const out = new Map<string, { costed: number; contributionMinor: number }>();
  if (!orders.length) return out;
  const profits = await orderProfits(db, storeId, orders.map((o) => o.id), { ...inputs, ads: { allocate: false, basis: 'month' } });
  for (const o of orders) {
    const p = profits.get(o.id);
    if (!p || p.parts.productCost.minor === null) continue;
    let c = (p.parts.sales.minor ?? 0) + (p.parts.deliveryCharge.minor ?? 0);
    for (const k of OUT) c -= p.parts[k].minor ?? 0;
    const r = out.get(o.district ?? '') ?? { costed: 0, contributionMinor: 0 };
    r.costed += 1;
    r.contributionMinor += c;
    out.set(o.district ?? '', r);
  }
  return out;
}
