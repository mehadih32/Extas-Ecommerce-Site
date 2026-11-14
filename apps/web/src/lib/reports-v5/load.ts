// S28 · PR 714-717 — what the four v5 report pages read. Each loader only calls the figures the shop already has:
// `profitReport` (Money › Profit & loss, @extas/metrics), `groupProfitView` (Money › Profit by group), `channelProfitView`
// (Money › Profit by channel), `reportOverview` (Marketing › Report), `restockReport` (Report library) and the imported ad
// spend. Nothing is counted twice or in a new way; a page whose person lacks the key of one part simply leaves that part out.
// Practice data is never counted: the money queries read real orders only (the practice flag of CN-049 is outside every
// metric query).
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { ymdIn, type ChannelProfit, type GroupProfit } from '@extas/metrics';
import type { PermissionKey } from '@extas/auth';
import type { AdminDeps } from '../admin-auth';
import { channelProfitView } from '../channel-profit-view';
import { parseReportQuery, quickPeriod, type ParsedQuery, type ReportLimits } from '../cost-report';
import { groupProfitView } from '../group-profit-view';
import { reportOverview, type ReportOverview } from '../marketing/report';
import { profitReport, type ProfitReport } from '../profit-report';
import { previousSpan } from './model';
import type { Who } from '@extas/inventory';

const S = MOTHER_STORE_ID;
type Sp = Record<string, string | string[] | undefined>;
export interface Base {
  currency: string;
  timeZone: string;
  limits: ReportLimits;
  today: string;
  period: ParsedQuery;
  before: { from: string; to: string };
}
type Access = { deps: AdminDeps; guard: { permissions?: ReadonlySet<PermissionKey>; actor: unknown; ctx: unknown } };

/** The period of the page (a one-press period or two dates, made safe by `costs.report`) and the span before it. */
export async function loadBase(deps: AdminDeps, sp: Sp): Promise<Base> {
  const at = { storeId: S };
  const [currency, timeZone, limits] = await Promise.all([deps.resolver.value('store.currency', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('costs.report', at)]);
  const today = ymdIn(new Date(), timeZone);
  const period = parseReportQuery(sp, today, limits);
  return { currency, timeZone, limits, today, period, before: previousSpan(period.q.from, period.q.to) };
}

/** The month the Monthly review is about: `m=this` is this month so far, anything else last month. */
export async function loadReviewBase(deps: AdminDeps, sp: Sp): Promise<Base & { which: 'this' | 'last' }> {
  const at = { storeId: S };
  const [currency, timeZone, limits] = await Promise.all([deps.resolver.value('store.currency', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('costs.report', at)]);
  const today = ymdIn(new Date(), timeZone);
  const which = sp.m === 'this' ? 'this' : 'last';
  const span = quickPeriod(which === 'this' ? 'month' : 'lastMonth', today);
  const period = parseReportQuery({ from: span.from, to: span.to }, today, limits);
  return { currency, timeZone, limits, today, period, before: previousSpan(period.q.from, period.q.to), which };
}

export interface ProfitData {
  now: ProfitReport;
  was: ProfitReport;
  channels: ChannelProfit;
  channelsWas: ChannelProfit;
  categories: GroupProfit;
  styles: GroupProfit;
}

/** Reports › Profit: the period and the span before in Money › Profit & loss's own figure, by channel, category and style. */
export async function loadProfit(deps: AdminDeps, b: Base): Promise<ProfitData> {
  const { from, to } = b.period.q;
  const cur = { from, to };
  const was = { from: b.before.from, to: b.before.to };
  const [now, wasP, channels, channelsWas, categories, styles] = await Promise.all([
    profitReport(deps, S, from, to),
    profitReport(deps, S, was.from, was.to),
    channelProfitView(deps, S, cur, b.limits),
    channelProfitView(deps, S, was, b.limits),
    groupProfitView(deps, S, { ...cur, by: 'category' }, b.limits),
    groupProfitView(deps, S, { ...cur, by: 'style' }, b.limits),
  ]);
  return { now, was: wasP, channels: channels.report, channelsWas: channelsWas.report, categories: categories.report, styles: styles.report };
}

export interface RestockLine {
  productId: string;
  name: string;
  verdict: string;
  sold30: number;
  sizesInStock: number;
  sizesTotal: number;
  stockDays: number | null;
}

/** The restock and unsold lists (the Report library's own, `reports.read`); null when the person lacks that key. */
export async function loadRestock(a: Access): Promise<{ restock: RestockLine[]; unsold: RestockLine[] } | null> {
  if (!a.guard.permissions?.has('reports.read')) return null;
  const who = { actor: a.guard.actor, storeId: S, ctx: a.guard.ctx } as unknown as Who;
  const cdep = { db: a.deps.db, settings: a.deps.resolver, now: a.deps.now } as unknown as cat.CatalogueDeps;
  return cat.restockReport(cdep, who);
}

export interface ProductsData {
  styles: GroupProfit;
  stylesWas: GroupProfit;
  sales: ProfitReport;
  salesWas: ProfitReport;
  restock: { restock: RestockLine[]; unsold: RestockLine[] } | null;
}

/** Reports › Products: profit by style for the period and the span before, daily Sales, and what to restock or stop. */
export async function loadProducts(a: Access, b: Base): Promise<ProductsData> {
  const { from, to } = b.period.q;
  const [styles, stylesWas, sales, salesWas, restock] = await Promise.all([
    groupProfitView(a.deps, S, { from, to, by: 'style' }, b.limits),
    groupProfitView(a.deps, S, { from: b.before.from, to: b.before.to, by: 'style' }, b.limits),
    profitReport(a.deps, S, from, to),
    profitReport(a.deps, S, b.before.from, b.before.to),
    loadRestock(a),
  ]);
  return { styles: styles.report, stylesWas: stylesWas.report, sales, salesWas, restock };
}

export interface AdDay {
  day: string;
  spendMinor: number;
}

/** The ad spend imported for each day of the period, in the shop's currency (a day with an amount that could not be converted counts 0). */
export async function adSpendByDay(db: PrismaClient, currency: string, from: string, to: string): Promise<AdDay[]> {
  const rows = await db.$queryRaw<{ day: string; minor: bigint | null }[]>`
    SELECT to_char(a."date", 'YYYY-MM-DD') AS "day",
           SUM(CASE WHEN a."currency" = ${currency} THEN a."spendMinor" ELSE COALESCE(a."spendStoreMinor", 0) END)::bigint AS "minor"
      FROM "AdSpendDaily" a
     WHERE a."storeId" = ${S} AND a."date" >= ${from}::date AND a."date" <= ${to}::date
     GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ day: r.day, spendMinor: Number(r.minor ?? 0) }));
}

export interface MarketingData {
  now: ReportOverview;
  was: ReportOverview;
  days: AdDay[];
  sales: ProfitReport;
}

/** Reports › Marketing & ads: Marketing › Report's own figure for the period and the span before, plus ad spend by day. */
export async function loadMarketing(deps: AdminDeps, sp: Sp): Promise<MarketingData> {
  const rd = { db: deps.db, resolver: deps.resolver, now: deps.now };
  const now = await reportOverview(rd, sp);
  const { from, to } = now.period.q;
  const prev = previousSpan(from, to);
  const [was, days, sales] = await Promise.all([reportOverview(rd, { from: prev.from, to: prev.to }), now.report ? adSpendByDay(deps.db, now.currency, from, to) : Promise.resolve([]), profitReport(deps, S, from, to)]);
  return { now, was, days, sales };
}

export interface ReviewData {
  now: ProfitReport;
  was: ProfitReport;
  channels: ChannelProfit;
  channelsWas: ChannelProfit;
  categories: GroupProfit;
  restock: { restock: RestockLine[]; unsold: RestockLine[] } | null;
}

/** Reports › Monthly review: the month and the span before, by category, with the return rate and what to restock. */
export async function loadReview(a: Access, b: Base): Promise<ReviewData> {
  const { from, to } = b.period.q;
  const cur = { from, to };
  const was = { from: b.before.from, to: b.before.to };
  const [now, wasP, channels, channelsWas, categories, restock] = await Promise.all([
    profitReport(a.deps, S, from, to),
    profitReport(a.deps, S, was.from, was.to),
    channelProfitView(a.deps, S, cur, b.limits),
    channelProfitView(a.deps, S, was, b.limits),
    groupProfitView(a.deps, S, { ...cur, by: 'category' }, b.limits),
    loadRestock(a),
  ]);
  return { now, was: wasP, channels: channels.report, channelsWas: channelsWas.report, categories: categories.report, restock };
}
