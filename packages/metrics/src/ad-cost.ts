// S13 · PR 267 (register "Cost per order, cost per delivered order, and alert thresholds the owner sets from the
// dashboard"; demo 93-admin-ads.js "ডেলিভারি প্রতি খরচ") — what one order and one delivered order cost in ads, per
// platform campaign, per platform and for the whole shop, over the days the caller names (the shop's own days):
//   - spend: the AdSpendDaily rows of those days (PR 265), in the store currency — the platform's own amount when the
//     account is in the store currency, else the amount the owner's rate gave it (PR 266); a day with no rate yet makes
//     that row's spend unknown (null), never zero;
//   - orders: placed on those days (the Ordered-value rule, `ordered`); delivered: delivered on those days (the Sales
//     rule, `sales`); returned: came back on those days (as Profit by channel). A campaign counts the orders that carry
//     it (Order.adCampaignId); a platform counts the orders of its channel (the platform's own tag, a campaign of one of
//     the shop's accounts on it, or the owner's paid UTM words — channels.ts `channelOf`);
//   - cost per order = spend ÷ orders, cost per delivered order = spend ÷ delivered, rounded to the minor unit; null
//     when the spend is unknown or nothing was counted.
// `adAlertHits` holds the owner's alert rules (AdAlertRule) against these figures: a rule is crossed when its cost is
// over the owner's limit, or when nothing was counted while the spend alone is already over it. Read only.
import { basisWhere, type Db } from './metrics';
import { CHANNEL_PLATFORMS, channelOf, returnedWhere, type ChannelPlatform, type ChannelRules } from './channels';
import { daysPeriod } from './pure';

export interface AdCostRow {
  /** The AdCampaign id, the platform (`META` …) or `total`. */
  key: string;
  platform: ChannelPlatform | null;
  /** Spend in the store currency; null while a row of it has no amount in the store currency. */
  spendMinor: number | null;
  /** The platform's own purchase count (its pixel), beside ours. */
  platformPurchases: number;
  orders: number;
  delivered: number;
  returned: number;
  perOrderMinor: number | null;
  perDeliveredMinor: number | null;
}

export interface AdCost {
  from: string;
  to: string;
  /** Every platform campaign with spend or an order in the period. */
  campaigns: AdCostRow[];
  /** Every platform with spend or an order in the period. */
  platforms: AdCostRow[];
  total: AdCostRow;
}

const NO_RULES: ChannelRules = { paidMediums: [], platforms: [] };
const blank = (key: string, platform: ChannelPlatform | null): AdCostRow => ({ key, platform, spendMinor: 0, platformPurchases: 0, orders: 0, delivered: 0, returned: 0, perOrderMinor: null, perDeliveredMinor: null });
const per = (spend: number | null, n: number) => (spend === null || n <= 0 ? null : Math.round(spend / n));
const asPlatform = (v: string | null): ChannelPlatform | null => CHANNEL_PLATFORMS.find((p) => p === v) ?? null;

type Signal = { cid: string | null; source: string; adPlatform: string | null; campaignPlatform: string | null; utmSource: string | null; utmMedium: string | null; n: number };

/** Cost per order and per delivered order over the days `from`–`to` of one store. */
export async function adCostPerOrder(db: Db, storeId: number, days: { from: string; to: string }, o: { currency: string; timeZone: string; rules?: ChannelRules }): Promise<AdCost> {
  const period = daysPeriod(days.from, days.to, o.timeZone);
  const rules = o.rules ?? NO_RULES;
  const counted = (which: 'orders' | 'delivered' | 'returned') => db.$queryRaw<Signal[]>`
    SELECT o."adCampaignId" AS "cid", o."source"::text AS "source", o."adPlatform", a."platform"::text AS "campaignPlatform", o."utmSource", o."utmMedium", count(*)::int AS "n"
      FROM "Order" o
      LEFT JOIN "AdCampaign" c ON c."id" = o."adCampaignId" AND c."storeId" = o."storeId"
      LEFT JOIN "AdAccount" a ON a."id" = c."adAccountId" AND a."storeId" = o."storeId"
     WHERE ${which === 'orders' ? basisWhere('ordered', storeId, period) : which === 'delivered' ? basisWhere('sales', storeId, period) : returnedWhere(storeId, period)}
     GROUP BY 1, 2, 3, 4, 5, 6`;
  const [orders, delivered, returned, spend] = await Promise.all([
    counted('orders'),
    counted('delivered'),
    counted('returned'),
    db.$queryRaw<{ cid: string | null; platform: string; minor: bigint | null; unknown: number; purchases: number }[]>`
      SELECT s."adCampaignId" AS "cid", s."platform"::text AS "platform",
             SUM(CASE WHEN s."currency" = ${o.currency} THEN s."spendMinor" ELSE s."spendStoreMinor" END)::bigint AS "minor",
             COUNT(*) FILTER (WHERE s."currency" <> ${o.currency} AND s."spendStoreMinor" IS NULL)::int AS "unknown",
             COALESCE(SUM(s."purchases"), 0)::int AS "purchases"
        FROM "AdSpendDaily" s
       WHERE s."storeId" = ${storeId} AND s."date" >= ${days.from}::date AND s."date" <= ${days.to}::date
       GROUP BY 1, 2`,
  ]);

  const campaigns = new Map<string, AdCostRow>();
  const platforms = new Map<ChannelPlatform, AdCostRow>();
  const total = blank('total', null);
  const campaignRow = (id: string, platform: ChannelPlatform | null) => campaigns.get(id) ?? campaigns.set(id, blank(id, platform)).get(id)!;
  const platformRow = (p: ChannelPlatform) => platforms.get(p) ?? platforms.set(p, blank(p, p)).get(p)!;
  const addSpend = (r: AdCostRow, minor: number | null) => {
    r.spendMinor = r.spendMinor === null || minor === null ? null : r.spendMinor + minor;
  };

  for (const s of spend) {
    const p = asPlatform(s.platform);
    const minor = s.unknown > 0 ? null : Number(s.minor ?? 0);
    for (const r of [s.cid ? campaignRow(s.cid, p) : null, p ? platformRow(p) : null, total]) {
      if (!r) continue;
      addSpend(r, minor);
      r.platformPurchases += s.purchases;
    }
  }
  const count = (rows: Signal[], field: 'orders' | 'delivered' | 'returned') => {
    for (const s of rows) {
      const ch = channelOf(s, rules);
      const p = ch.startsWith('ads:') ? asPlatform(ch.slice(4)) : null;
      if (s.cid) campaignRow(s.cid, asPlatform(s.campaignPlatform))[field] += s.n;
      if (p) platformRow(p)[field] += s.n;
      // the shop's total counts only the orders that came through an ad
      if (s.cid || ch.startsWith('ads:')) total[field] += s.n;
    }
  };
  count(orders, 'orders');
  count(delivered, 'delivered');
  count(returned, 'returned');

  const finish = (r: AdCostRow) => ({ ...r, perOrderMinor: per(r.spendMinor, r.orders), perDeliveredMinor: per(r.spendMinor, r.delivered) });
  const bySpend = (a: AdCostRow, b: AdCostRow) => (b.spendMinor ?? 0) - (a.spendMinor ?? 0) || b.orders - a.orders || a.key.localeCompare(b.key);
  return { from: days.from, to: days.to, campaigns: [...campaigns.values()].map(finish).sort(bySpend), platforms: [...platforms.values()].map(finish).sort(bySpend), total: finish(total) };
}

export const AD_ALERT_METRICS = ['costPerOrder', 'costPerDelivered'] as const;
export type AdAlertMetric = (typeof AD_ALERT_METRICS)[number];

/** One owner rule: the whole shop (no scope), one platform, or one platform campaign. */
export interface AdAlertRuleInput {
  id: string;
  metric: AdAlertMetric;
  scope: { platform?: string; adCampaignId?: string } | null;
  thresholdMinor: number;
}

export interface AdAlertHit {
  ruleId: string;
  /** over: the cost is over the limit; noOrders: nothing counted while the spend alone is over it; ok; unknown: the spend has no store-currency amount yet. */
  state: 'over' | 'noOrders' | 'ok' | 'unknown';
  valueMinor: number | null;
  spendMinor: number | null;
  counted: number;
  thresholdMinor: number;
}

/** Each rule against the figures (the row its scope names; a scope with no spend and no order is `ok`). */
export function adAlertHits(rules: readonly AdAlertRuleInput[], cost: AdCost): AdAlertHit[] {
  return rules.map((rule) => {
    const s = rule.scope ?? {};
    const row = s.adCampaignId ? cost.campaigns.find((r) => r.key === s.adCampaignId) : s.platform ? cost.platforms.find((r) => r.key === s.platform) : cost.total;
    const r = row ?? blank('none', null);
    const counted = rule.metric === 'costPerOrder' ? r.orders : r.delivered;
    const valueMinor = rule.metric === 'costPerOrder' ? r.perOrderMinor : r.perDeliveredMinor;
    const base = { ruleId: rule.id, valueMinor, spendMinor: r.spendMinor, counted, thresholdMinor: rule.thresholdMinor };
    if (r.spendMinor === null) return { ...base, state: 'unknown' as const };
    if (counted === 0) return { ...base, state: r.spendMinor > rule.thresholdMinor ? ('noOrders' as const) : ('ok' as const) };
    return { ...base, state: valueMinor !== null && valueMinor > rule.thresholdMinor ? ('over' as const) : ('ok' as const) };
  });
}
