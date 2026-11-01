// S16 · PR 355 (B3.10 Locked) — Money → Profit by channel (`/admin/money/profit/channels`) and its CSV: the period's
// delivered orders by ad platform (Meta, Google, YouTube, TikTok, other ads), organic and every other channel, with
// Sales, the goods that came back, the contribution, the parcels that came back and the return rate, and each
// platform's ad spend set against it (profit after ads). The figure is @extas/metrics `profitByChannel`; periods follow
// `costs.report`; the UTM words are `reports.channels`. Seeing needs `books.read`; changing the words `costs.write`.
// Read-only report: nothing here changes a budget, a campaign, a price or an order.
//   GET /api/admin/money/profit/channels?from=&to=   the table as a CSV file (`books.read`)
//   PUT /api/admin/money/profit/channels/rules       {value, version}   the UTM words (`costs.write`; settings history + audit)
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { profitByChannel, ymdIn, type ChannelProfit, type ChannelRow } from '@extas/metrics';
import { registry, SettingsError, storeTarget, type ReportChannels } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { parseReportQuery, type ParsedQuery, type ReportLimits } from './cost-report';
import { profitInputs } from './order-profit-view';
import type { AppResolver } from './settings';

export interface ChannelProfitView {
  today: string;
  period: ParsedQuery;
  report: ChannelProfit;
  rules: { value: ReportChannels; version: number };
}

/** The report of one store for the page's query. */
export async function channelProfitView(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, sp: Record<string, string | string[] | undefined>, limits: ReportLimits): Promise<ChannelProfitView> {
  const [inputs, rules] = await Promise.all([profitInputs(deps.resolver, storeId), deps.resolver.get('reports.channels', { storeId })]);
  const today = ymdIn(new Date(), inputs.timeZone);
  const period = parseReportQuery(sp, today, limits);
  const report = await profitByChannel(deps.db, storeId, { from: period.q.from, to: period.q.to }, inputs, rules.value);
  return { today, period, report, rules: { value: rules.value, version: rules.version } };
}

/** Profit after ads as a share of the costed Sales, one decimal; null when not known or no costed Sales. */
export const channelMarginPct = (r: ChannelRow) => (r.profitMinor === null || r.costedSalesMinor <= 0 ? null : Math.round((r.profitMinor * 1000) / r.costedSalesMinor) / 10);

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** The table as CSV (minor units; rates and margin in %; empty = not known). */
export function channelProfitCsv(r: ChannelProfit, currency: string): string {
  const fig = (x: ChannelRow) => [x.key, x.orders, x.salesMinor, x.uncostedSalesMinor, x.returnsMinor, x.contributionMinor, x.adSpendMinor, x.profitMinor, channelMarginPct(x), x.returnedOrders, x.returnRatePct, x.missingOrders, currency];
  const lines: (string | number | null)[][] = [
    ['channel', 'orders', 'salesMinor', 'noCostSalesMinor', 'returnsMinor', 'contributionMinor', 'adSpendMinor', 'profitAfterAdsMinor', 'marginPct', 'returnedOrders', 'returnRatePct', 'ordersMissingAPart', 'currency'],
    ...r.rows.map(fig),
    fig(r.total),
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

const storeOf = (url: URL) => {
  const raw = url.searchParams.get('storeId');
  const id = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
};

/** The CSV route and the UTM words route. */
export async function channelProfitRoute(request: Request, deps: AdminDeps | null, path: string[] = []): Promise<Response> {
  const m = request.method.toUpperCase();
  const url = new URL(request.url);
  const storeId = storeOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const where = path.join('/');
  if (where !== '' && where !== 'rules') return fail(404, 'not-found');
  if (m !== (where === 'rules' ? 'PUT' : 'GET')) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: where === 'rules' ? 'costs.write' : 'books.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  const at = { storeId };
  try {
    if (where === 'rules') {
      const b = await body(request);
      const parsed = registry['reports.channels'].schema.safeParse(b.value === undefined ? Symbol('missing') : b.value);
      if (!parsed.success) return json({ ok: false, error: 'INVALID_INPUT', details: parsed.error.issues.map((i) => `${['reports.channels', ...i.path].join('.')}: ${i.message}`) }, { status: 400 });
      const before = await d.resolver.value('reports.channels', at);
      if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
        await d.resolver.set('reports.channels', parsed.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Money › Profit by channel', expectedVersion: typeof b.version === 'number' ? b.version : undefined });
        await audit(d.db, g.actor, { storeId, action: 'reports.channels', entityType: 'Setting', entityId: 'reports.channels', before: { 'reports.channels': before }, after: { 'reports.channels': parsed.data } }, g.ctx);
      }
      const now = await d.resolver.get('reports.channels', at);
      return json({ ok: true, value: now.value, version: now.version });
    }
    const [currency, limits] = await Promise.all([d.resolver.value('store.currency', at), d.resolver.value('costs.report', at)]);
    const v = await channelProfitView(d, storeId, Object.fromEntries(url.searchParams), limits);
    return new Response(channelProfitCsv(v.report, currency), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="profit-by-channel-${v.period.q.from}-${v.period.q.to}.csv"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof SettingsError) return json({ ok: false, error: e.code === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'INVALID_INPUT', details: [...e.issues] }, { status: e.code === 'VERSION_CONFLICT' ? 409 : 400 });
    return errorResponse(e);
  }
}
