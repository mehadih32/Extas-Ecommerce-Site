// S13 · PR 269 (register "AI growth agent — reads performance, proposes changes, waits for approval"; Blueprint C3.1 row
// 8: "watches delivered ROAS by campaign, product and district … flags a campaign spending with no delivered orders") —
// what the ads brought back in delivered sales, over the days the caller names (the shop's own days):
//   - spend: the AdSpendDaily rows of those days per platform campaign (PR 265), in the store currency exactly as
//     `adCostPerOrder` reads it (a dollar day with no rate makes that campaign's spend unknown, null — never zero);
//   - delivered: the orders that carry the campaign (Order.adCampaignId) and were delivered on those days (the Sales
//     rule, `sales`), with their Sales value (the order total, as the headline Sales figure);
//   - delivered ROAS, in percent = delivered sales × 100 ÷ spend (250 = 2.5 taka back for each taka spent); null when
//     the spend is unknown or zero.
// By product and by district the spend is shared out: each delivered order of a campaign carries an equal part of that
// campaign's spend (spend ÷ its delivered orders), and inside the order each counted line carries a part by its line
// total. A district is the order's delivery area (Order.areaId) or the district above it. A campaign with spend and no
// delivered order has nothing to share: it is flagged by the caller (`delivered` 0), its spend is in `unshared`. Only
// orders that carry a campaign count here. Read only, store-scoped, archived orders left out, minor units.
import { basisWhere, type Db } from './metrics';
import { CHANNEL_PLATFORMS, type ChannelPlatform } from './channels';
import { COUNTED_LINE_STATUS, daysPeriod } from './pure';

export interface AdReturnRow {
  /** The AdCampaign id, the product id, the district's GeoArea id ('' = no district known), or `total`. */
  key: string;
  /** A campaign's platform (others null). */
  platform: ChannelPlatform | null;
  /** The campaign's own spend, or the product's / district's share of it; null when a part of it is unknown. */
  spendMinor: number | null;
  delivered: number;
  deliveredSalesMinor: number;
  /** Delivered sales × 100 ÷ spend (whole percent); null when the spend is unknown or zero. */
  roasPercent: number | null;
}

export interface AdReturn {
  from: string;
  to: string;
  campaigns: AdReturnRow[];
  products: AdReturnRow[];
  districts: AdReturnRow[];
  /** Every campaign together (its spend is the whole campaign spend). */
  total: AdReturnRow;
  /** Spend of campaigns with no delivered order in the period (shared out to no product or district); null if unknown. */
  unshared: number | null;
}

const asPlatform = (v: string | null): ChannelPlatform | null => CHANNEL_PLATFORMS.find((p) => p === v) ?? null;
const roas = (sales: number, spend: number | null) => (spend === null || spend <= 0 ? null : Math.round((sales * 100) / spend)); // hardcode-ok: percent
const blank = (key: string, platform: ChannelPlatform | null = null): AdReturnRow => ({ key, platform, spendMinor: 0, delivered: 0, deliveredSalesMinor: 0, roasPercent: null });
const addSpend = (r: AdReturnRow, minor: number | null) => {
  r.spendMinor = r.spendMinor === null || minor === null ? null : r.spendMinor + minor;
};

/** Delivered sales and delivered ROAS by platform campaign, product and district over the days `from`–`to`. */
export async function adDeliveredReturn(db: Db, storeId: number, days: { from: string; to: string }, o: { currency: string; timeZone: string }): Promise<AdReturn> {
  const period = daysPeriod(days.from, days.to, o.timeZone);
  const [spend, orders] = await Promise.all([
    db.$queryRaw<{ cid: string; platform: string; minor: bigint | null; unknown: number }[]>`
      SELECT s."adCampaignId"::text AS "cid", s."platform"::text AS "platform",
             SUM(CASE WHEN s."currency" = ${o.currency} THEN s."spendMinor" ELSE s."spendStoreMinor" END)::bigint AS "minor",
             COUNT(*) FILTER (WHERE s."currency" <> ${o.currency} AND s."spendStoreMinor" IS NULL)::int AS "unknown"
        FROM "AdSpendDaily" s
       WHERE s."storeId" = ${storeId} AND s."adCampaignId" IS NOT NULL AND s."date" >= ${days.from}::date AND s."date" <= ${days.to}::date
       GROUP BY 1, 2`,
    db.$queryRaw<{ id: string; cid: string; platform: string | null; value: number; district: string | null }[]>`
      SELECT o."id"::text AS "id", o."adCampaignId"::text AS "cid", a."platform"::text AS "platform", o."totalMinor" AS "value",
             CASE WHEN g."level"::text = 'DISTRICT' THEN g."id"::text
                  ELSE (SELECT d."id"::text FROM "GeoArea" d WHERE d."id" = ANY(g."ancestorIds") AND d."level"::text = 'DISTRICT' LIMIT 1) END AS "district"
        FROM "Order" o
        LEFT JOIN "AdCampaign" c ON c."id" = o."adCampaignId" AND c."storeId" = o."storeId"
        LEFT JOIN "AdAccount" a ON a."id" = c."adAccountId" AND a."storeId" = o."storeId"
        LEFT JOIN "GeoArea" g ON g."id" = o."areaId"
       WHERE ${basisWhere('sales', storeId, period)} AND o."adCampaignId" IS NOT NULL
       ORDER BY o."id"`,
  ]);

  const campaigns = new Map<string, AdReturnRow>();
  const campaignRow = (id: string, platform: ChannelPlatform | null) => campaigns.get(id) ?? campaigns.set(id, blank(id, platform)).get(id)!;
  const total = blank('total');
  for (const s of spend) {
    const minor = s.unknown > 0 ? null : Number(s.minor ?? 0);
    addSpend(campaignRow(s.cid, asPlatform(s.platform)), minor);
    addSpend(total, minor);
  }
  for (const r of orders) {
    const c = campaignRow(r.cid, asPlatform(r.platform));
    c.delivered += 1;
    c.deliveredSalesMinor += Number(r.value);
    total.delivered += 1;
    total.deliveredSalesMinor += Number(r.value);
  }

  // each delivered order's part of its campaign's spend (null when the campaign's spend is unknown)
  const partOf = (cid: string): number | null => {
    const c = campaigns.get(cid)!;
    return c.spendMinor === null ? null : c.spendMinor / c.delivered;
  };
  const districts = new Map<string, AdReturnRow>();
  for (const r of orders) {
    const d = districts.get(r.district ?? '') ?? districts.set(r.district ?? '', blank(r.district ?? '')).get(r.district ?? '')!;
    d.delivered += 1;
    d.deliveredSalesMinor += Number(r.value);
    addSpend(d, partOf(r.cid));
  }

  const ids = orders.map((r) => r.id);
  const lines = ids.length
    ? await db.$queryRaw<{ orderId: string; productId: string | null; total: number }[]>`
        SELECT i."orderId"::text AS "orderId", i."productId"::text AS "productId", i."lineTotalMinor" AS "total"
          FROM "OrderItem" i
         WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
         ORDER BY i."orderId", i."id"`
    : [];
  const linesOf = new Map<string, typeof lines>();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);
  const products = new Map<string, AdReturnRow>();
  for (const r of orders) {
    const own = (linesOf.get(r.id) ?? []).filter((l) => l.productId);
    const goods = own.reduce((a, l) => a + Number(l.total), 0);
    const part = partOf(r.cid);
    const seen = new Set<string>();
    for (const l of own) {
      const p = products.get(l.productId!) ?? products.set(l.productId!, blank(l.productId!)).get(l.productId!)!;
      const share = goods > 0 ? Number(l.total) / goods : 1 / own.length;
      if (!seen.has(l.productId!)) p.delivered += 1;
      seen.add(l.productId!);
      p.deliveredSalesMinor += Number(l.total);
      addSpend(p, part === null ? null : part * share);
    }
  }

  let unshared: number | null = 0;
  for (const c of campaigns.values()) if (c.delivered === 0) unshared = unshared === null || c.spendMinor === null ? null : unshared + c.spendMinor;
  const finish = (r: AdReturnRow): AdReturnRow => {
    const spendMinor = r.spendMinor === null ? null : Math.round(r.spendMinor);
    return { ...r, spendMinor, roasPercent: roas(r.deliveredSalesMinor, spendMinor) };
  };
  const bySales = (a: AdReturnRow, b: AdReturnRow) => b.deliveredSalesMinor - a.deliveredSalesMinor || (b.spendMinor ?? 0) - (a.spendMinor ?? 0) || a.key.localeCompare(b.key);
  return {
    from: days.from,
    to: days.to,
    campaigns: [...campaigns.values()].map(finish).sort(bySales),
    products: [...products.values()].map(finish).sort(bySales),
    districts: [...districts.values()].map(finish).sort(bySales),
    total: finish(total),
    unshared,
  };
}
