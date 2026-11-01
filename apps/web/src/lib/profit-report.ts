// S16 · PR 349 (B3.10; BACKEND-ARCHITECTURE §5 MNY-01) — Money → Profit & loss (`/admin/money/profit`) and its CSV.
// The period's profit and loss from @extas/metrics `profitAndLoss` (the per-order profit, so the order page and this page
// agree), with the owner's figures (`costs.gatewayFees`, `costs.packaging`) and the fixed costs of PR 618 (salary, rent,
// utilities, other): each month's latest version spread over its days by the ERP's rule (`fixedCostDays`), the days
// inside the period added. Read-only; nothing here pays, charges or changes a price. (PR 351: the figure itself now lives
// in @extas/inventory books-profit.ts, shared with the worker's money report; `fixedCostsIn` and `ProfitReport` too.)
//   GET /api/admin/money/profit?from=YYYY-MM-DD&to=YYYY-MM-DD   the period as a CSV file (`books.read`)
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { profitReport as inventoryProfitReport, type ProfitReport } from '@extas/inventory';

export { fixedCostsIn, type ProfitReport } from '@extas/inventory';
import { ymdIn } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, type AdminDeps } from './admin-auth';
import { parseReportQuery } from './cost-report';
import type { AppResolver } from './settings';
import { vatReportFor } from './vat-report';

/** The report of one store over `from`–`to` (the store's own days): @extas/inventory `profitReport` (PR 351 moved it there
 * so the worker's money report reads the same figure) with the app's settings resolver. */
export const profitReport = (deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, from: string, to: string): Promise<ProfitReport> =>
  inventoryProfitReport({ db: deps.db, settings: deps.resolver }, storeId, from, to);

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** The report as CSV: the lines of the profit, then day by day (amounts in minor units; empty = not known). PR 537: while
 * the VAT system is on, `vatInsideSales` adds the VAT already inside Sales after net profit (a part of Sales, not a cost). */
export function profitCsv(r: ProfitReport, currency: string, vatInsideSales: number | null = null): string {
  const lines: (string | number | null)[][] = [
    ['line', 'amountMinor', 'currency'],
    ['sales.delivered', r.salesMinor, currency],
    ['ordered.value', r.orderedMinor, currency],
    ['sales.costedOrders', r.parts.sales, currency],
    ['returns', r.parts.returns, currency],
    ['netSales', r.netSalesMinor, currency],
    ['productCost', r.parts.productCost, currency],
    ['grossProfit', r.grossProfitMinor, currency],
    ['deliveryCharges', r.parts.deliveryCharge, currency],
    ['courier', r.parts.courier, currency],
    ['paymentFees', r.parts.paymentFees, currency],
    ['packaging', r.parts.packaging, currency],
    ['messages', r.parts.messages, currency],
    ['returnLoss', r.parts.returnLoss, currency],
    ['contribution', r.contributionMinor, currency],
    ['adSpend', r.adsMinor, currency],
    ['otherCosts', r.otherCostsMinor, currency],
    ['fixedCosts', r.fixedMinor, currency],
    ['netProfit', r.netProfitMinor, currency],
    ...(vatInsideSales === null ? [] : [['vat.insideSales', vatInsideSales, currency]]),
    [],
    ['day', 'orders', 'salesMinor', 'grossProfitMinor', 'contributionMinor'],
    ...[...r.byDay].reverse().map((d) => [d.day, d.orders, d.salesMinor, d.grossProfitMinor, d.contributionMinor]),
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** The CSV route (the table at the top). */
export async function profitRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
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
    const [timeZone, currency, limits] = await Promise.all([d.resolver.value('store.timeZone', at), d.resolver.value('store.currency', at), d.resolver.value('costs.report', at)]);
    const { q } = parseReportQuery(Object.fromEntries(url.searchParams), ymdIn(new Date(), timeZone), limits);
    const [r, vat] = await Promise.all([profitReport(d, storeId, q.from, q.to), vatReportFor(d, storeId, q.from, q.to)]);
    return new Response(profitCsv(r, currency, vat?.totalVatMinor ?? null), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="profit-${q.from}-${q.to}.csv"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
