// S13 · PR 283 (register "Marketing report: spend, revenue, by channel, by campaign"; Blueprint C6.1 item 5 "per-campaign
// spend vs delivered revenue", C3.1 row 8 "delivered ROAS by campaign") — what marketing cost and what it brought back,
// over the shop days the caller names, in the store currency:
//   - Ordered value: the orders placed in the period (never a draft), their order total; Sales: the orders delivered in
//     the period, their order total (the one Sales rule, `basisWhere`). The two are always shown apart.
//   - By channel: every order in exactly one channel (`channelOf`, the same words as Profit by channel); an ad
//     platform's channel carries its ad spend imported for the period's days (AdSpendDaily, a dollar day with no rate
//     makes the spend unknown, null — never zero).
//   - By campaign (Marketing › Campaigns, PR 256): an order belongs to the campaign of its ad campaign
//     (Order.adCampaignId → AdCampaign.campaignId) or else of its landing page (Order.landingPageId → Page.campaignId),
//     once; the campaign's spend is the spend of its ad campaigns.
//   - Message sends (SMS, WhatsApp, e-mail: Broadcast) started in the period: their cost (Broadcast.costMinor, or the
//     delivery log's costs while the send has none) and what the receivers ordered within `resultDays` of their message
//     (placed; delivered and their Sales value), as the e-mail and win-back pages count it.
//   - Delivered ROAS in percent = Sales × 100 ÷ spend; null while the spend is unknown or zero.
// Read-only, store-scoped, archived orders left out, minor units.
import { Prisma } from '@extas/db/client';
import { basisWhere, kpi, type Db } from './metrics';
import { CHANNEL_PLATFORMS, channelOf, type ChannelKey, type ChannelPlatform, type ChannelRules } from './channels';
import { daysPeriod, NOT_PLACED_STATUSES, SALES_STATUSES, type Basis } from './pure';

export interface MarketingFigure {
  /** Orders placed in the period and their Ordered value. */
  orders: number;
  orderedMinor: number;
  /** Orders delivered in the period and their Sales. */
  delivered: number;
  salesMinor: number;
}

export interface MarketingChannelRow extends MarketingFigure {
  key: ChannelKey;
  kind: 'ads' | 'organic' | 'other';
  /** Ad spend for the period (ad platforms); 0 elsewhere; null when a day has no store-currency amount. */
  spendMinor: number | null;
  roasPercent: number | null;
}

export interface MarketingCampaignRow extends MarketingFigure {
  /** Campaign id (Marketing › Campaigns). */
  id: string;
  spendMinor: number | null;
  roasPercent: number | null;
}

export interface MarketingSendRow {
  id: string;
  name: string;
  channel: string;
  kind: string | null;
  status: string;
  startedAt: Date;
  sent: number;
  costMinor: number;
  /** Receivers' orders placed within the result days of their message; delivered = delivered by now; their Sales. */
  orders: number;
  delivered: number;
  salesMinor: number;
}

export interface MarketingReport {
  from: string;
  to: string;
  /** The whole shop (every channel). */
  shop: MarketingFigure;
  /** Ad spend of the period (null when unknown); message cost of the sends started in it; together. */
  adSpendMinor: number | null;
  messageSpendMinor: number;
  spendMinor: number | null;
  /** The shop's Sales × 100 ÷ every marketing taka (null while unknown or zero). */
  roasPercent: number | null;
  adsImported: boolean;
  /** Ad channels first (by spend), then organic, then the other channels by Ordered value. */
  channels: MarketingChannelRow[];
  /** Campaigns with an order, a delivery or spend in the period, by Sales. */
  campaigns: MarketingCampaignRow[];
  /** Spend of ad campaigns tied to no campaign (null when unknown). */
  untiedSpendMinor: number | null;
  /** Sends started in the period, newest first. */
  sends: MarketingSendRow[];
}

const NONE: MarketingFigure = Object.freeze({ orders: 0, orderedMinor: 0, delivered: 0, salesMinor: 0 });
/** Sales × 100 ÷ spend, whole percent. */
export const roasOf = (sales: number, spend: number | null) => (spend === null || spend <= 0 ? null : Math.round((sales * 100) / spend)); // hardcode-ok: percent
const addSpend = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);
const kindOf = (k: ChannelKey): MarketingChannelRow['kind'] => (k.startsWith('ads:') ? 'ads' : k === 'organic' ? 'organic' : 'other');
const asPlatform = (v: string): ChannelPlatform | 'OTHER' => CHANNEL_PLATFORMS.find((p) => p === v) ?? 'OTHER';

type Signals = { source: string; adPlatform: string | null; campaignPlatform: string | null; utmSource: string | null; utmMedium: string | null };

/** The marketing report of one store over the days `from`–`to`. `sendsMax` caps the sends listed (a list-length guard). */
export async function marketingReport(
  db: Db,
  storeId: number,
  days: { from: string; to: string },
  o: { currency: string; timeZone: string; rules: ChannelRules; resultDays: number; sendsMax: number },
): Promise<MarketingReport> {
  const period = daysPeriod(days.from, days.to, o.timeZone);
  const byChannel = (basis: Basis) => db.$queryRaw<(Signals & { n: bigint; v: bigint })[]>`
    SELECT o."source"::text AS "source", o."adPlatform", a."platform"::text AS "campaignPlatform", o."utmSource", o."utmMedium",
           count(*)::bigint AS "n", COALESCE(sum(o."totalMinor"), 0)::bigint AS "v"
      FROM "Order" o
      LEFT JOIN "AdCampaign" c ON c."id" = o."adCampaignId" AND c."storeId" = o."storeId"
      LEFT JOIN "AdAccount" a ON a."id" = c."adAccountId" AND a."storeId" = o."storeId"
     WHERE ${basisWhere(basis, storeId, period)}
     GROUP BY 1, 2, 3, 4, 5`;
  const byCampaign = (basis: Basis) => db.$queryRaw<{ cid: string; n: bigint; v: bigint }[]>`
    SELECT COALESCE(c."campaignId", p."campaignId")::text AS "cid", count(*)::bigint AS "n", COALESCE(sum(o."totalMinor"), 0)::bigint AS "v"
      FROM "Order" o
      LEFT JOIN "AdCampaign" c ON c."id" = o."adCampaignId" AND c."storeId" = o."storeId"
      LEFT JOIN "Page" p ON p."id" = o."landingPageId" AND p."storeId" = o."storeId"
     WHERE ${basisWhere(basis, storeId, period)} AND COALESCE(c."campaignId", p."campaignId") IS NOT NULL
     GROUP BY 1`;
  const [shop, chOrdered, chSales, cOrdered, cSales, spend, sends] = await Promise.all([
    kpi(db, storeId, period),
    byChannel('ordered'),
    byChannel('sales'),
    byCampaign('ordered'),
    byCampaign('sales'),
    db.$queryRaw<{ platform: string; cid: string | null; minor: bigint | null; unknown: number; rows: number }[]>`
      SELECT s."platform"::text AS "platform", c."campaignId"::text AS "cid",
             SUM(CASE WHEN s."currency" = ${o.currency} THEN s."spendMinor" ELSE s."spendStoreMinor" END)::bigint AS "minor",
             COUNT(*) FILTER (WHERE s."currency" <> ${o.currency} AND s."spendStoreMinor" IS NULL)::int AS "unknown",
             COUNT(*)::int AS "rows"
        FROM "AdSpendDaily" s
        LEFT JOIN "AdCampaign" c ON c."id" = s."adCampaignId" AND c."storeId" = s."storeId"
       WHERE s."storeId" = ${storeId} AND s."date" >= ${days.from}::date AND s."date" <= ${days.to}::date
       GROUP BY 1, 2`,
    marketingSends(db, storeId, period, o.resultDays, o.sendsMax),
  ]);

  const channels = new Map<ChannelKey, MarketingChannelRow>();
  const row = (k: ChannelKey) => channels.get(k) ?? channels.set(k, { key: k, kind: kindOf(k), ...NONE, spendMinor: 0, roasPercent: null }).get(k)!;
  for (const r of chOrdered) {
    const x = row(channelOf(r, o.rules));
    x.orders += Number(r.n);
    x.orderedMinor += Number(r.v);
  }
  for (const r of chSales) {
    const x = row(channelOf(r, o.rules));
    x.delivered += Number(r.n);
    x.salesMinor += Number(r.v);
  }
  const campaigns = new Map<string, MarketingCampaignRow>();
  const camp = (id: string) => campaigns.get(id) ?? campaigns.set(id, { id, ...NONE, spendMinor: 0, roasPercent: null }).get(id)!;
  for (const r of cOrdered) Object.assign(camp(r.cid), { orders: Number(r.n), orderedMinor: Number(r.v) });
  for (const r of cSales) Object.assign(camp(r.cid), { delivered: Number(r.n), salesMinor: Number(r.v) });

  let adSpend: number | null = 0;
  let untied: number | null = 0;
  for (const s of spend) {
    const minor = s.unknown > 0 ? null : Number(s.minor ?? 0);
    adSpend = addSpend(adSpend, minor);
    const ch = row(`ads:${asPlatform(s.platform)}`);
    ch.spendMinor = addSpend(ch.spendMinor, minor);
    if (s.cid) {
      const c = camp(s.cid);
      c.spendMinor = addSpend(c.spendMinor, minor);
    } else untied = addSpend(untied, minor);
  }
  for (const x of channels.values()) x.roasPercent = roasOf(x.salesMinor, x.spendMinor);
  for (const x of campaigns.values()) x.roasPercent = roasOf(x.salesMinor, x.spendMinor);

  const messageSpend = sends.reduce((a, s) => a + s.costMinor, 0);
  const total = addSpend(adSpend, messageSpend);
  const order = (k: MarketingChannelRow['kind']) => (k === 'ads' ? 0 : k === 'organic' ? 1 : 2);
  return {
    from: days.from,
    to: days.to,
    shop: { orders: shop.ordered.orders, orderedMinor: shop.ordered.valueMinor, delivered: shop.sales.orders, salesMinor: shop.sales.valueMinor },
    adSpendMinor: adSpend,
    messageSpendMinor: messageSpend,
    spendMinor: total,
    roasPercent: roasOf(shop.sales.valueMinor, total),
    adsImported: spend.length > 0,
    channels: [...channels.values()].sort((a, b) => order(a.kind) - order(b.kind) || (a.kind === 'ads' ? (b.spendMinor ?? 0) - (a.spendMinor ?? 0) : 0) || b.orderedMinor - a.orderedMinor || a.key.localeCompare(b.key)),
    campaigns: [...campaigns.values()].sort((a, b) => b.salesMinor - a.salesMinor || b.orderedMinor - a.orderedMinor || (b.spendMinor ?? 0) - (a.spendMinor ?? 0) || a.id.localeCompare(b.id)),
    untiedSpendMinor: untied,
    sends,
  };
}

/** The message sends started in the period (sending or sent), each with its cost and its receivers' orders. */
async function marketingSends(db: Db, storeId: number, period: { from: Date; to: Date }, resultDays: number, max: number): Promise<MarketingSendRow[]> {
  const sales = [...SALES_STATUSES];
  const notPlaced = [...NOT_PLACED_STATUSES];
  const rows = await db.$queryRaw<
    { id: string; name: string; channel: string; kind: string | null; status: string; at: Date; sent: number; cost: bigint | null; logCost: bigint | null; orders: bigint; delivered: bigint; value: bigint | null }[]
  >(Prisma.sql`
    WITH b AS (
      SELECT x."id", x."name", x."channel"::text AS "channel", x."kind", x."status", COALESCE(x."startedAt", x."scheduledAt") AS "at", x."sentCount" AS "sent", x."costMinor" AS "cost"
        FROM "Broadcast" x
       WHERE x."storeId" = ${storeId} AND x."status" IN ('SENDING', 'SENT')
         AND COALESCE(x."startedAt", x."scheduledAt") >= ${period.from} AND COALESCE(x."startedAt", x."scheduledAt") < ${period.to}
       ORDER BY 6 DESC, x."id" DESC
       LIMIT ${max}
    ),
    got AS (
      SELECT DISTINCT l."broadcastId" AS "bid", o."id", o."status"::text AS "st", o."totalMinor" AS "total"
        FROM "NotificationLog" l
        JOIN "Order" o ON o."storeId" = l."storeId" AND o."customerId" = l."customerId" AND o."archivedAt" IS NULL
             AND NOT (o."status"::text = ANY(${notPlaced})) AND o."placedAt" >= l."sentAt" AND o."placedAt" < l."sentAt" + make_interval(days => ${resultDays}::int)
       WHERE l."storeId" = ${storeId} AND l."broadcastId" IN (SELECT "id" FROM b) AND l."status"::text IN ('SENT', 'DELIVERED')
    )
    SELECT b."id"::text AS "id", b."name", b."channel", b."kind", b."status", b."at", b."sent", b."cost"::bigint AS "cost",
           (SELECT sum(l."costMinor") FROM "NotificationLog" l WHERE l."storeId" = ${storeId} AND l."broadcastId" = b."id")::bigint AS "logCost",
           (SELECT count(*) FROM got g WHERE g."bid" = b."id")::bigint AS "orders",
           (SELECT count(*) FROM got g WHERE g."bid" = b."id" AND g."st" = ANY(${sales}))::bigint AS "delivered",
           (SELECT sum(g."total") FROM got g WHERE g."bid" = b."id" AND g."st" = ANY(${sales}))::bigint AS "value"
      FROM b
     ORDER BY b."at" DESC, b."id" DESC`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    channel: r.channel,
    kind: r.kind,
    status: r.status,
    startedAt: r.at,
    sent: r.sent,
    costMinor: Number(r.cost ?? r.logCost ?? 0),
    orders: Number(r.orders),
    delivered: Number(r.delivered),
    salesMinor: Number(r.value ?? 0),
  }));
}
