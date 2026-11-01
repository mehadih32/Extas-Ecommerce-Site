// S16 · PR 355 (B3.10 Locked: "one page shows total ad spend this month across Meta, Google, YouTube and TikTok, set
// against sales attributed to ads, against organic and other channels, with delivered revenue, returns, and profit or
// loss per channel") — the period's delivered orders (on their delivered day, the one Sales rule) put in one channel
// each, with the per-order profit (order-profit.ts, ad spend not spread) added up per channel:
//   - an ad platform's channel: the order carries the platform (its click, `adPlatform`), or a campaign of one of the
//     shop's ad accounts on that platform, or a paid UTM medium with that platform's UTM source (`reports.channels`);
//     a paid medium with a source no platform has is "other ads";
//   - organic: a website or landing-page order with none of those;
//   - every other way an order comes in (Messenger, WhatsApp, phone, showroom, …) is its own channel, by order source.
// Per channel: delivered orders, Sales, the goods that came back, the contribution of the costed orders (Sales less
// returns, product cost and every order cost, as Profit & loss), the parcels that came back in the period (status
// RETURNED, on their returned day) and the return rate; an ad platform's channel also carries its ad spend imported for
// the period's days, so profit after ads = contribution − that spend. Spend on a platform with no attributed order is
// still shown. An order without a cost on a line is left out of the profit (its Sales named). Read-only, store-scoped.
import { Prisma } from '@extas/db/client';
import { basisWhere, type Db } from './metrics';
import { orderProfits, type ProfitInputs, type ProfitPart } from './order-profit';
import { daysPeriod } from './pure';

export const CHANNEL_PLATFORMS = ['META', 'GOOGLE', 'YOUTUBE', 'TIKTOK'] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

/** The order sources a shop visitor comes through (organic when no paid signal). */
export const WEB_SOURCES = ['WEBSITE', 'LANDING_PAGE'] as const;

/** `reports.channels`: the UTM words that mean an ad platform. */
export interface ChannelRules {
  paidMediums: readonly string[];
  platforms: readonly { platform: ChannelPlatform; sources: readonly string[] }[];
}

/** `ads:META` … `ads:OTHER`, `organic`, or `source:<OrderSource>`. */
export type ChannelKey = `ads:${ChannelPlatform | 'OTHER'}` | 'organic' | `source:${string}`;

export interface ChannelRow {
  key: ChannelKey | 'total';
  kind: 'ads' | 'organic' | 'other' | 'total';
  orders: number;
  salesMinor: number;
  /** Sales of the orders left out of profit for a missing cost. */
  uncostedSalesMinor: number;
  /** Over the costed orders: */
  costedSalesMinor: number;
  returnsMinor: number;
  contributionMinor: number;
  /** Costed orders missing a part (courier, COD fee, payment fee, packaging): the figure is short of it. */
  missingOrders: number;
  /** Orders that came back in the period, and returned ÷ (delivered + returned) in %, one decimal; null with neither. */
  returnedOrders: number;
  returnRatePct: number | null;
  /** Ad platforms: spend imported for the period's days (null when a row has no amount in the store currency); 0 elsewhere. */
  adSpendMinor: number | null;
  /** contribution − ad spend; null while the spend is not known. */
  profitMinor: number | null;
}

export interface ChannelProfit {
  from: string;
  to: string;
  /** Ad platforms first (by spend), then organic, then the other channels by Sales. */
  rows: ChannelRow[];
  total: ChannelRow;
  /** Spend imported for the period on every platform; null when a row has no store-currency amount; false = none. */
  adSpendMinor: number | null;
  adsImported: boolean;
}

type Signals = { source: string; adPlatform: string | null; campaignPlatform: string | null; utmSource: string | null; utmMedium: string | null };

/** The channel one order belongs to (exported for the rule's own tests). */
export function channelOf(o: Signals, rules: ChannelRules): ChannelKey {
  const platform = (v: string | null) => CHANNEL_PLATFORMS.find((p) => p === v?.trim().toUpperCase()) ?? null;
  const direct = platform(o.adPlatform) ?? platform(o.campaignPlatform);
  if (direct) return `ads:${direct}`;
  const medium = o.utmMedium?.trim().toLowerCase() ?? '';
  if (medium && rules.paidMediums.includes(medium)) {
    const src = o.utmSource?.trim().toLowerCase() ?? '';
    const hit = rules.platforms.find((p) => src && p.sources.includes(src));
    return `ads:${hit?.platform ?? 'OTHER'}`;
  }
  if ((WEB_SOURCES as readonly string[]).includes(o.source)) return 'organic';
  return `source:${o.source}`;
}

const kindOf = (k: ChannelRow['key']): ChannelRow['kind'] => (k === 'total' ? 'total' : k.startsWith('ads:') ? 'ads' : k === 'organic' ? 'organic' : 'other');
const empty = (key: ChannelRow['key']): ChannelRow => ({
  key,
  kind: kindOf(key),
  orders: 0,
  salesMinor: 0,
  uncostedSalesMinor: 0,
  costedSalesMinor: 0,
  returnsMinor: 0,
  contributionMinor: 0,
  missingOrders: 0,
  returnedOrders: 0,
  returnRatePct: null,
  adSpendMinor: 0,
  profitMinor: null,
});
const CONTRIBUTION_OUT: readonly ProfitPart[] = ['returns', 'productCost', 'courier', 'codFee', 'paymentFees', 'packaging', 'messages', 'returnLoss'];
const MAYBE_MISSING: readonly ProfitPart[] = ['courier', 'codFee', 'paymentFees', 'packaging'];

/** Profit by channel of one store over the days `from`–`to` (the store's own days). Ad spend is never spread here. */
export async function profitByChannel(db: Db, storeId: number, days: { from: string; to: string }, inputs: ProfitInputs, rules: ChannelRules): Promise<ChannelProfit> {
  const period = daysPeriod(days.from, days.to, inputs.timeZone);
  const signals = (where: 'sales' | 'returned') => db.$queryRaw<(Signals & { id: string })[]>`
    SELECT o."id", o."source"::text AS "source", o."adPlatform", a."platform"::text AS "campaignPlatform", o."utmSource", o."utmMedium"
      FROM "Order" o
      LEFT JOIN "AdCampaign" c ON c."id" = o."adCampaignId" AND c."storeId" = o."storeId"
      LEFT JOIN "AdAccount" a ON a."id" = c."adAccountId" AND a."storeId" = o."storeId"
     WHERE ${where === 'sales' ? basisWhere('sales', storeId, period) : returnedWhere(storeId, period)}`;
  const [delivered, returned, spend] = await Promise.all([
    signals('sales'),
    signals('returned'),
    db.$queryRaw<{ platform: string; minor: bigint | null; unknown: number }[]>`
      SELECT a."platform"::text AS "platform",
             SUM(CASE WHEN a."currency" = ${inputs.currency} THEN a."spendMinor" ELSE a."spendStoreMinor" END)::bigint AS "minor",
             COUNT(*) FILTER (WHERE a."currency" <> ${inputs.currency} AND a."spendStoreMinor" IS NULL)::int AS "unknown"
        FROM "AdSpendDaily" a
       WHERE a."storeId" = ${storeId} AND a."date" >= ${days.from}::date AND a."date" <= ${days.to}::date
       GROUP BY 1`,
  ]);
  const profits = await orderProfits(db, storeId, delivered.map((o) => o.id), { ...inputs, ads: { allocate: false, basis: 'month' } });

  const rows = new Map<ChannelKey, ChannelRow>();
  const rowOf = (k: ChannelKey) => rows.get(k) ?? rows.set(k, empty(k)).get(k)!;
  for (const o of delivered) {
    const p = profits.get(o.id);
    if (!p) continue;
    const r = rowOf(channelOf(o, rules));
    const sales = p.parts.sales.minor ?? 0;
    r.orders += 1;
    r.salesMinor += sales;
    if (p.parts.productCost.minor === null) {
      r.uncostedSalesMinor += sales;
      continue;
    }
    r.costedSalesMinor += sales;
    r.returnsMinor += p.parts.returns.minor ?? 0;
    let c = sales + (p.parts.deliveryCharge.minor ?? 0);
    for (const k of CONTRIBUTION_OUT) c -= p.parts[k].minor ?? 0;
    r.contributionMinor += c;
    if (MAYBE_MISSING.some((k) => p.parts[k].state === 'missing')) r.missingOrders += 1;
  }
  for (const o of returned) rowOf(channelOf(o, rules)).returnedOrders += 1;
  let adSpendMinor: number | null = 0;
  for (const s of spend) {
    const platform = CHANNEL_PLATFORMS.find((p) => p === s.platform);
    if (!platform) continue;
    const r = rowOf(`ads:${platform}`);
    r.adSpendMinor = s.unknown > 0 ? null : Number(s.minor ?? 0);
    if (r.adSpendMinor === null) adSpendMinor = null;
    else if (adSpendMinor !== null) adSpendMinor += r.adSpendMinor;
  }

  const total = empty('total');
  for (const r of rows.values()) {
    finish(r);
    for (const k of ['orders', 'salesMinor', 'uncostedSalesMinor', 'costedSalesMinor', 'returnsMinor', 'contributionMinor', 'missingOrders', 'returnedOrders'] as const) total[k] += r[k];
  }
  total.adSpendMinor = adSpendMinor;
  finish(total);
  const order = (r: ChannelRow) => (r.kind === 'ads' ? 0 : r.kind === 'organic' ? 1 : 2);
  const sorted = [...rows.values()].sort((a, b) => order(a) - order(b) || (b.adSpendMinor ?? 0) - (a.adSpendMinor ?? 0) || b.salesMinor - a.salesMinor || a.key.localeCompare(b.key));
  return { from: days.from, to: days.to, rows: sorted, total, adSpendMinor, adsImported: spend.length > 0 };
}

function finish(r: ChannelRow): ChannelRow {
  const seen = r.orders + r.returnedOrders;
  r.returnRatePct = seen === 0 ? null : Math.round((r.returnedOrders * 1000) / seen) / 10;
  r.profitMinor = r.adSpendMinor === null ? null : r.contributionMinor - r.adSpendMinor;
  return r;
}

/** Orders that came back in the period (as Sales by area, PR 568). */
function returnedWhere(storeId: number, period: { from: Date; to: Date }) {
  return Prisma.sql`o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."status"::text = 'RETURNED' AND o."returnedAt" >= ${period.from} AND o."returnedAt" < ${period.to}`;
}
