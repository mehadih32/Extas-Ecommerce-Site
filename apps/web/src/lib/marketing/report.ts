// S13 · PR 283 (register "Marketing report: spend, revenue, by channel, by campaign"; Blueprint C6.1 item 5 "per-campaign
// spend vs delivered revenue"; demo 93-admin-ads.js) — Marketing › Report: what marketing cost against what it brought
// back, for any period (the one-press periods of the money reports, or two dates), only while `marketing.report` is on
// (registry v218, off as shipped). Every money figure is @extas/metrics `marketingReport`: Ordered value (orders placed)
// and Sales (orders delivered, the only sale) kept apart; the whole shop, by channel (the `reports.channels` words, as
// Profit by channel), by campaign (Marketing › Campaigns: its ad campaigns' spend, its orders through those ad campaigns
// or its landing pages) and per message send (its cost, its receivers' orders within `resultDays`). Read-only: nothing
// here changes a budget, a campaign, a price or an order.
// Follow-up 657: the message spend counts every send of the period; the sends list is paged (`sends=` page, one page =
// REPORT_SENDS_MAX); `format=csv` downloads the whole report (the shop, each channel, campaign and send) as one CSV.
//   GET /api/admin/marketing/report?period=|from=&to=[&sends=]   the report as JSON (`marketing.campaigns.read`)
//   GET /api/admin/marketing/report?…&format=csv               the report as a CSV file (same permission)
//   PUT /api/admin/marketing/report                     {key: 'report', value, version} the card (`marketing.campaigns.write`; audited)
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { marketingReport, marketingSendsPage, roasOf, ymdIn, type MarketingFigure, type MarketingReport, type MarketingSendRow } from '@extas/metrics';
import { marketingReportSettingsSchema, storeTarget, type MarketingReportSettings, type ReportChannels } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { csvCell } from '../cost-ledger';
import { parseReportQuery, type ParsedQuery } from '../cost-report';
import type { AdPlatformsWho } from './ad-platforms';

const S = MOTHER_STORE_ID;
/** The most message sends one report lists (a list-length guard, not a business number): one page of them. */
export const REPORT_SENDS_MAX = 200; // hardcode-ok: a list-length guard
/** The most send rows one CSV carries (a file-length guard; a longer period says it was cut). */
export const REPORT_CSV_SENDS_MAX = 10_000; // hardcode-ok: a file-length guard

export class ReportError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface ReportDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

export interface ReportCampaignName {
  name: string;
  status: string;
  archived: boolean;
}

export interface ReportOverview {
  settings: MarketingReportSettings;
  card: { key: 'report'; value: MarketingReportSettings; version: string };
  currency: string;
  timeZone: string;
  today: string;
  period: ParsedQuery;
  /** Only while the switch is on. */
  report: MarketingReport | null;
  /** The campaigns the report names. */
  campaigns: Record<string, ReportCampaignName>;
  /** Follow-up 657: the sends page shown (1 = the newest) and how many pages there are. */
  sendsPage: number;
  sendsPages: number;
}

/** The sends page asked for (`sends=`, 1 = the newest); anything else is page 1. */
export const sendsPageOf = (v: string | string[] | undefined): number => {
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : 1;
  return n >= 1 ? n : 1;
};

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const settingsOf = async (deps: ReportDeps) => (await deps.resolver.value('marketing.report', { storeId: S })) as MarketingReportSettings;

/** The page's report for its query (`period`, or `from` and `to`), made safe by the money reports' own rules. */
export async function reportOverview(deps: ReportDeps, sp: Record<string, string | string[] | undefined> = {}): Promise<ReportOverview> {
  const at = { storeId: S };
  const [settings, timeZone, currency, rules] = await Promise.all([
    settingsOf(deps),
    deps.resolver.value('store.timeZone', at) as Promise<string>,
    deps.resolver.value('store.currency', at) as Promise<string>,
    deps.resolver.value('reports.channels', at) as Promise<ReportChannels>,
  ]);
  const today = ymdIn(deps.now?.() ?? new Date(), timeZone);
  const period = parseReportQuery(sp, today, { maxDays: settings.maxDays, maxDayRows: settings.maxDays });
  const base = { settings, card: { key: 'report' as const, value: settings, version: versionOf(settings) }, currency, timeZone, today, period };
  if (!settings.enabled) return { ...base, report: null, campaigns: {}, sendsPage: 1, sendsPages: 1 };
  const asked = sendsPageOf(sp.sends);
  const at0 = (page: number) => marketingReport(deps.db, S, { from: period.q.from, to: period.q.to }, { currency, timeZone, rules, resultDays: settings.resultDays, sendsMax: REPORT_SENDS_MAX, sendsOffset: (page - 1) * REPORT_SENDS_MAX });
  let report = await at0(asked);
  const pages = Math.max(1, Math.ceil(report.sendsTotal / REPORT_SENDS_MAX));
  // a page past the last (an old link): the last page
  const page = Math.min(asked, pages);
  if (page !== asked) report = await at0(page);
  const ids = report.campaigns.map((c) => c.id);
  const rows = ids.length ? await deps.db.campaign.findMany({ where: { storeId: S, id: { in: ids } }, select: { id: true, name: true, status: true, archivedAt: true } }) : [];
  return { ...base, report, campaigns: Object.fromEntries(rows.map((r) => [r.id, { name: r.name, status: r.status, archived: r.archivedAt !== null }])), sendsPage: page, sendsPages: pages };
}

/** Every send of the report's period for the CSV (page by page, at most REPORT_CSV_SENDS_MAX; `cut` when there were more). */
export async function allSendsOf(deps: ReportDeps, o: ReportOverview): Promise<{ sends: MarketingSendRow[]; cut: boolean }> {
  const r = o.report;
  if (!r) return { sends: [], cut: false };
  const want = Math.min(r.sendsTotal, REPORT_CSV_SENDS_MAX);
  const sends: MarketingSendRow[] = [];
  while (sends.length < want) {
    const page = await marketingSendsPage(deps.db, S, { from: r.from, to: r.to }, { timeZone: o.timeZone, resultDays: o.settings.resultDays, offset: sends.length, max: Math.min(REPORT_SENDS_MAX, want - sends.length) });
    if (!page.length) break;
    sends.push(...page);
  }
  return { sends, cut: r.sendsTotal > sends.length };
}

/**
 * Follow-up 657 — the report as one CSV table (spreadsheet-safe cells, amounts in minor units, times in UTC): a row for
 * the whole shop, then each channel, campaign and message send, with the spend, ROAS (percent) and the currency.
 */
export function reportCsv(o: ReportOverview, sends: readonly MarketingSendRow[], cut: boolean): string {
  const r = o.report;
  const head = ['section', 'key', 'name', 'orders', 'orderedMinor', 'delivered', 'salesMinor', 'spendMinor', 'roasPercent', 'sent', 'startedAt', 'currency'];
  if (!r) return head.join(',') + '\r\n';
  const fig = (x: MarketingFigure) => [x.orders, x.orderedMinor, x.delivered, x.salesMinor];
  const lines: (string | number | null)[][] = [
    ['shop', '', '', ...fig(r.shop), r.spendMinor, r.roasPercent, null, null, o.currency],
    ['messages', '', '', null, null, null, null, r.messageSpendMinor, null, r.sendsTotal, null, o.currency],
    ...r.channels.map((x) => ['channel', x.key, '', ...fig(x), x.spendMinor, x.roasPercent, null, null, o.currency]),
    ...r.campaigns.map((x) => ['campaign', x.id, o.campaigns[x.id]?.name ?? '', ...fig(x), x.spendMinor, x.roasPercent, null, null, o.currency]),
    ...(r.untiedSpendMinor !== 0 ? [['untied', '', '', null, null, null, null, r.untiedSpendMinor, null, null, null, o.currency]] : []),
    ...sends.map((x) => ['send', `${x.channel}:${x.id}`, x.name, x.orders, null, x.delivered, x.salesMinor, x.costMinor, roasOf(x.salesMinor, x.costMinor), x.sent, x.startedAt.toISOString(), o.currency]),
  ];
  return [head.join(','), ...lines.map((l) => l.map(csvCell).join(',')), ...(cut ? [`# cut at ${sends.length} sends: choose a shorter period`] : [])].join('\r\n') + '\r\n';
}

/** PUT: the settings card ({key: 'report', value, version}). Audited. */
export async function saveReportCard(deps: ReportDeps, who: AdPlatformsWho, input: unknown): Promise<ReportOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'report') throw new ReportError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (o.version !== versionOf(before)) throw new ReportError('STALE', 409);
  const ok = marketingReportSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new ReportError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('marketing.report', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Report' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketingReport.settings', entityType: 'Setting', entityId: 'marketing.report', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'report', value: ok.data, version: versionOf(ok.data) };
}

/** /api/admin/marketing/report — GET the report (`marketing.campaigns.read`); PUT the card (`marketing.campaigns.write`). */
export async function reportHandler(request: Request, deps: AdminDeps | null, now?: () => Date): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: ReportDeps = { db: deps!.db, resolver: deps!.resolver, ...(now ? { now } : {}) };
  try {
    if (method === 'GET') {
      const sp = Object.fromEntries(new URL(request.url).searchParams);
      const o = await reportOverview(d, sp);
      if (sp.format !== 'csv') return json({ ok: true, ...o });
      if (!o.report) return json({ ok: false, error: 'SWITCHED_OFF', details: ['marketing.report'] }, { status: 409 });
      const { sends, cut } = await allSendsOf(d, o);
      return new Response(reportCsv(o, sends, cut), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="marketing-report-${o.period.q.from}-${o.period.q.to}.csv"`, 'cache-control': 'no-store' },
      });
    }
    return json({ ok: true, cards: { report: await saveReportCard(d, { actor: g.actor, ctx: g.ctx }, b) } });
  } catch (e) {
    return e instanceof ReportError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}
