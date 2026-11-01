// S16 · PR 504 (B3.10 V2, §59 answer 21) — Money → Profit by group (`/admin/money/profit/groups`) and its CSV: the
// per-order profit with its ad-spend share (`costs.allocation`), split over the lines and added up by category or by
// style group (Polo → a brand's polo → its solid polo), each with everything under it, so the owner can see what to
// restock, buy in bulk or stop. The figure is @extas/metrics `profitByGroup`; periods follow `costs.report`. Seeing needs
// `books.read`. Read-only: nothing here buys, stops or reprices anything.
//   GET /api/admin/money/profit/groups?from=&to=&by=category|style   the table as a CSV file (`books.read`)
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { PROFIT_GROUP_BY, profitByGroup, ymdIn, type GroupProfit, type GroupProfitRow, type ProfitGroupBy } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, type AdminDeps } from './admin-auth';
import { parseReportQuery, type ParsedQuery, type ReportLimits } from './cost-report';
import { profitInputs } from './order-profit-view';
import type { AppResolver } from './settings';

export interface GroupProfitView {
  today: string;
  period: ParsedQuery;
  by: ProfitGroupBy;
  report: GroupProfit;
  /** Whether ad spend is spread over orders (`costs.allocation.adSpend`). */
  adsOn: boolean;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The report of one store for the page's query (by category unless style is asked for). */
export async function groupProfitView(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, sp: Record<string, string | string[] | undefined>, limits: ReportLimits): Promise<GroupProfitView> {
  const inputs = await profitInputs(deps.resolver, storeId);
  const today = ymdIn(new Date(), inputs.timeZone);
  const period = parseReportQuery(sp, today, limits);
  const by = PROFIT_GROUP_BY.find((b) => b === one(sp.by)) ?? 'category';
  const report = await profitByGroup(deps.db, storeId, { from: period.q.from, to: period.q.to }, by, inputs);
  return { today, period, by, report, adsOn: inputs.ads.allocate };
}

/** Profit as a share of the costed Sales, one decimal; null when there are none. */
export const marginPct = (r: GroupProfitRow) => (r.costedSalesMinor <= 0 ? null : Math.round((r.profitMinor * 1000) / r.costedSalesMinor) / 10);

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** The table as CSV (minor units; the margin in %; `level` 0 = top group). */
export function groupProfitCsv(r: GroupProfit, currency: string, name: (row: GroupProfitRow) => string): string {
  const fig = (x: GroupProfitRow) => [x.orders, x.pieces, x.salesMinor, x.uncostedSalesMinor, x.returnsMinor, x.productCostMinor, x.grossProfitMinor, x.orderCostsMinor, x.adsMinor, x.profitMinor, marginPct(x), x.missingLines, currency];
  const lines: (string | number | null)[][] = [
    [r.by, 'level', 'orders', 'pieces', 'salesMinor', 'noCostSalesMinor', 'returnsMinor', 'productCostMinor', 'grossProfitMinor', 'orderCostsMinor', 'adSpendMinor', 'profitMinor', 'marginPct', 'linesMissingAPart', 'currency'],
    ...r.rows.map((x) => [name(x), x.id === null ? null : x.depth, ...fig(x)]),
    ['(total)', null, ...fig(r.total)],
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** The CSV route. */
export async function groupProfitRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'books.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const at = { storeId };
    const [currency, limits] = await Promise.all([d.resolver.value('store.currency', at), d.resolver.value('costs.report', at)]);
    const v = await groupProfitView(d, storeId, Object.fromEntries(url.searchParams), limits);
    const csv = groupProfitCsv(v.report, currency, (x) => x.name ?? (v.by === 'category' ? '(no category)' : '(no style)'));
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="profit-by-${v.by}-${v.period.q.from}-${v.period.q.to}.csv"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
