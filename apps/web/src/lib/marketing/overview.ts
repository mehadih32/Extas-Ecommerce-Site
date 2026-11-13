// S28 · PR 699 (CN-048; prototype v5 Marketing › Overview, Ad campaigns and Plan & ideas; gap M1-M4) — what the three pages
// read. Everything is read-only and from what is already stored: spend and Sales come from the Marketing report (Sales =
// delivered orders only), profit after ads from Profit by channel, the ad campaigns table from the ad campaigns' own spend
// days and the delivered orders that came through each, the ad-level rows from `AdCreativeDay`. Nothing here pauses, changes
// or sends anything; chips and the plan are advice from the owner's `marketing.verdicts` numbers.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { daysPeriod, deliveredSalesByCampaign, marketingReport, ymdIn } from '@extas/metrics';
import type { MarketingVerdictsSettings, ReportChannels } from '@extas/settings';
import type { AdminDeps } from '../admin-auth';
import { channelProfitView } from '../channel-profit-view';
import { calendarOverview } from './calendar';
import { fatigueOf, overlaps, planBudget, salesPerTk, verdictOf, type PlanRow, type Verdict, type WarnItem } from './overview-model';

const S = MOTHER_STORE_ID;
/** How many ad rows one page shows (a list-length guard, not a business number). */
export const AD_ROWS = 50; // hardcode-ok: a list-length guard
/** The share a click rate must fall by to call an ad tired (a rule of thumb shown on the page). */
export const TIRED_DROP_PCT = 30; // hardcode-ok: shown as a rule on the page, advice only

export interface OverviewDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

export interface OverviewCampaignRow {
  id: string;
  name: string;
  platform: string;
  status: string;
  spendMinor: number;
  salesMinor: number;
  delivered: number;
  perTk: number | null;
  verdict: Verdict;
}
export interface OverviewAdRow {
  id: string;
  name: string;
  campaign: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  purchases: number;
  ctrNow: number | null;
  ctrBefore: number | null;
  dropPct: number | null;
  tired: boolean;
}
export interface Overview {
  currency: string;
  today: string;
  from: string;
  to: string;
  thresholds: MarketingVerdictsSettings;
  spendMinor: number | null;
  salesMinor: number;
  delivered: number;
  perTk: number | null;
  verdict: Verdict;
  profitMinor: number | null;
  campaigns: OverviewCampaignRow[];
  ads: OverviewAdRow[];
  adsTotal: number;
}

const DAY_MS = 86_400_000; // hardcode-ok: ms in a day
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The overview for the last `days` shop days (today included). */
export async function marketingOverview(deps: OverviewDeps, days: number): Promise<Overview> {
  const at = { storeId: S };
  const [timeZone, currency, rules, thresholds, settings] = await Promise.all([
    deps.resolver.value('store.timeZone', at) as Promise<string>,
    deps.resolver.value('store.currency', at) as Promise<string>,
    deps.resolver.value('reports.channels', at) as Promise<ReportChannels>,
    deps.resolver.value('marketing.verdicts', at) as Promise<MarketingVerdictsSettings>,
    deps.resolver.value('marketing.report', at) as Promise<{ resultDays: number; maxDays: number }>,
  ]);
  const today = ymdIn(deps.now?.() ?? new Date(), timeZone);
  const n = Math.min(Math.max(1, Math.floor(days)), settings.maxDays);
  const from = addDay(today, -(n - 1));
  const period = daysPeriod(from, today, timeZone);
  const [report, profit] = await Promise.all([
    marketingReport(deps.db, S, { from, to: today }, { currency, timeZone, rules, resultDays: settings.resultDays, sendsMax: 1 }),
    channelProfitView({ db: deps.db, resolver: deps.resolver as never }, S, { from, to: today }, { maxDays: settings.maxDays, maxDayRows: settings.maxDays }).catch(() => null),
  ]);
  const perTk = salesPerTk(report.shop.salesMinor, report.spendMinor);

  const [adCampaigns, spendRows, saleOf] = await Promise.all([
    deps.db.adCampaign.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true, status: true, adAccount: { select: { platform: true } } }, take: 500 }), // hardcode-ok: a list guard
    deps.db.adSpendDaily.groupBy({ by: ['adCampaignId'], where: { storeId: S, adCampaignId: { not: null }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } }, _sum: { spendStoreMinor: true } }),
    deliveredSalesByCampaign(deps.db, S, period),
  ]);
  const spendOf = new Map(spendRows.map((r) => [r.adCampaignId, r._sum.spendStoreMinor ?? 0]));
  const campaigns: OverviewCampaignRow[] = adCampaigns
    .map((c) => {
      const spendMinor = spendOf.get(c.id) ?? 0;
      const sale = saleOf.get(c.id) ?? { salesMinor: 0, delivered: 0 };
      const s = { v: sale.salesMinor, n: sale.delivered };
      const p = salesPerTk(s.v, spendMinor);
      return { id: c.id, name: c.name, platform: String(c.adAccount.platform), status: c.status, spendMinor, salesMinor: s.v, delivered: s.n, perTk: p, verdict: verdictOf(p, thresholds) };
    })
    .filter((c) => c.spendMinor > 0 || c.salesMinor > 0)
    .sort((a, b) => b.spendMinor - a.spendMinor);

  // ad level: 14 days of each ad's days (the two weeks fatigue compares), the period's spend and results
  const lo = from < addDay(today, -13) ? from : addDay(today, -13);
  const dayRows = await deps.db.adCreativeDay.findMany({
    where: { storeId: S, date: { gte: new Date(`${lo}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } },
    select: { adId: true, date: true, spendStoreMinor: true, impressions: true, clicks: true, purchases: true, ad: { select: { name: true, adSet: { select: { adCampaign: { select: { name: true } } } } } } },
    take: 20_000, // hardcode-ok: a read guard
  });
  const byAd = new Map<string, { name: string; campaign: string; days: { day: string; impressions: number; clicks: number }[]; spend: number; imp: number; clk: number; buy: number }>();
  for (const r of dayRows) {
    const a = byAd.get(r.adId) ?? { name: r.ad.name, campaign: r.ad.adSet.adCampaign.name, days: [], spend: 0, imp: 0, clk: 0, buy: 0 };
    const day = r.date.toISOString().slice(0, 10);
    a.days.push({ day, impressions: r.impressions, clicks: r.clicks });
    if (day >= from) {
      a.spend += r.spendStoreMinor;
      a.imp += r.impressions;
      a.clk += r.clicks;
      a.buy += r.purchases;
    }
    byAd.set(r.adId, a);
  }
  const allAds: OverviewAdRow[] = [...byAd.entries()]
    .map(([id, a]) => {
      const f = fatigueOf(a.days, today, TIRED_DROP_PCT);
      return { id, name: a.name, campaign: a.campaign, spendMinor: a.spend, impressions: a.imp, clicks: a.clk, purchases: a.buy, ctrNow: f.now, ctrBefore: f.before, dropPct: f.dropPct, tired: f.tired };
    })
    .sort((a, b) => Number(b.tired) - Number(a.tired) || b.spendMinor - a.spendMinor);

  return {
    currency,
    today,
    from,
    to: today,
    thresholds,
    spendMinor: report.spendMinor,
    salesMinor: report.shop.salesMinor,
    delivered: report.shop.delivered,
    perTk,
    verdict: verdictOf(perTk, thresholds),
    profitMinor: profit?.report.total.profitMinor ?? null,
    campaigns,
    ads: allAds.slice(0, AD_ROWS),
    adsTotal: allAds.length,
  };
}

export interface PlanData {
  currency: string;
  today: string;
  from: string;
  thresholds: MarketingVerdictsSettings;
  rows: PlanRow[];
  overlaps: { a: string; b: string }[];
  lowStock: { id: string; name: string; available: number }[];
  lowStockAt: number;
  hasUpcoming: boolean;
}

/** The Plan page: the channel plan from delivered sales per Tk 1, and the calendar's two warnings (overlap, low stock). */
export async function marketingPlan(deps: OverviewDeps, days: number): Promise<PlanData> {
  const at = { storeId: S };
  const [timeZone, currency, rules, thresholds, settings, lowStockAt] = await Promise.all([
    deps.resolver.value('store.timeZone', at) as Promise<string>,
    deps.resolver.value('store.currency', at) as Promise<string>,
    deps.resolver.value('reports.channels', at) as Promise<ReportChannels>,
    deps.resolver.value('marketing.verdicts', at) as Promise<MarketingVerdictsSettings>,
    deps.resolver.value('marketing.report', at) as Promise<{ resultDays: number; maxDays: number }>,
    deps.resolver.value('bag.lowStockAt', at) as Promise<number>,
  ]);
  const today = ymdIn(deps.now?.() ?? new Date(), timeZone);
  const n = Math.min(Math.max(1, Math.floor(days)), settings.maxDays);
  const from = addDay(today, -(n - 1));
  const report = await marketingReport(deps.db, S, { from, to: today }, { currency, timeZone, rules, resultDays: settings.resultDays, sendsMax: 1 });
  const rows = planBudget(
    report.channels.filter((c) => c.kind === 'ads').map((c) => ({ key: c.key, spendMinor: c.spendMinor ?? 0, salesMinor: c.salesMinor })),
    thresholds,
  );
  // the calendar's coming weeks: campaigns and ads that run at the same time, and stock running low while they do
  const cal = await calendarOverview(deps, { always: true });
  const live: WarnItem[] = cal.items
    .filter((i) => (i.lane === 'campaign' || i.lane === 'ads') && i.state !== 'ended' && i.state !== 'off')
    .map((i) => ({ id: i.id, title: i.title.en, starts: i.starts, ends: i.ends, open: i.open }));
  const pairs = overlaps(live).map(([a, b]) => ({ a: a.title, b: b.title }));
  const low = lowStockAt > 0 ? await deps.db.stockLevel.groupBy({ by: ['variantId'], where: { variant: { storeId: S, product: { isDemo: false } } }, _sum: { available: true }, having: { available: { _sum: { lte: lowStockAt } } }, orderBy: { variantId: 'asc' }, take: 200 }) : []; // hardcode-ok: a list guard
  const variantIds = low.map((l) => l.variantId);
  const vs = variantIds.length ? await deps.db.productVariant.findMany({ where: { id: { in: variantIds }, storeId: S, product: { archivedAt: null } }, select: { id: true, product: { select: { id: true, nameEn: true } } } }) : [];
  const availOf = new Map(low.map((l) => [l.variantId, l._sum?.available ?? 0]));
  const byProduct = new Map<string, { id: string; name: string; available: number }>();
  for (const v of vs) {
    const cur = byProduct.get(v.product.id);
    const a = availOf.get(v.id) ?? 0;
    if (!cur || a < cur.available) byProduct.set(v.product.id, { id: v.product.id, name: v.product.nameEn, available: a });
  }
  return { currency, today, from, thresholds, rows, overlaps: pairs, lowStock: [...byProduct.values()].sort((a, b) => a.available - b.available).slice(0, 10), lowStockAt, hasUpcoming: live.length > 0 }; // hardcode-ok: a list guard
}

/** The writer for the platform sync (mock until a key is typed) and for a hand entry: one ad's day, replacing that day. */
export async function recordAdCreativeDay(db: PrismaClient, input: { adId: string; day: string; spendStoreMinor: number; impressions: number; clicks: number; purchases: number }): Promise<void> {
  const nonNeg = (v: number) => Number.isInteger(v) && v >= 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || ![input.spendStoreMinor, input.impressions, input.clicks, input.purchases].every(nonNeg) || input.clicks > input.impressions) throw new RangeError('BAD_AD_DAY');
  const ad = await db.ad.findFirst({ where: { id: input.adId, storeId: S }, select: { id: true } });
  if (!ad) throw new RangeError('AD_NOT_FOUND');
  const date = new Date(`${input.day}T00:00:00Z`);
  const data = { spendStoreMinor: input.spendStoreMinor, impressions: input.impressions, clicks: input.clicks, purchases: input.purchases };
  await db.adCreativeDay.upsert({ where: { adId_date: { adId: input.adId, date } }, create: { storeId: S, adId: input.adId, date, ...data }, update: data });
}
