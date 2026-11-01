// S16 · PR 349 (B3.10; BACKEND-ARCHITECTURE §5 MNY-01) — Money → Profit & loss (`/admin/money/profit`) and its CSV.
// The period's profit and loss from @extas/metrics `profitAndLoss` (the per-order profit, so the order page and this page
// agree), with the owner's figures (`costs.gatewayFees`, `costs.packaging`) and the fixed costs of PR 618 (salary, rent,
// utilities, other): each month's latest version spread over its days by the ERP's rule (`fixedCostDays`), the days
// inside the period added. Read-only; nothing here pays, charges or changes a price.
//   GET /api/admin/money/profit?from=YYYY-MM-DD&to=YYYY-MM-DD   the period as a CSV file (`books.read`)
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { fixedCostDays } from '@extas/inventory';
import { profitAndLoss, ymdIn, type Pnl } from '@extas/metrics';
import { gatewayFeeMinor } from '@extas/settings';
import { errorResponse, fail, guardAdmin, type AdminDeps } from './admin-auth';
import { parseReportQuery } from './cost-report';
import type { AppResolver } from './settings';

export interface ProfitReport extends Pnl {
  /** The fixed costs on the period's days, or null when none were entered for any of its months. */
  fixedMinor: number | null;
  /** Contribution − ad spend − other costs − fixed costs; null while the ad spend is not known. */
  netProfitMinor: number | null;
}

/** Fixed costs (PR 618) on the days `from`–`to`: each month's latest version spread by its days. */
export async function fixedCostsIn(db: Pick<PrismaClient, 'erpFixedCostMonth'>, storeId: number, from: string, to: string): Promise<number | null> {
  const rows = await db.erpFixedCostMonth.findMany({
    where: { storeId, month: { gte: new Date(`${from.slice(0, 7)}-01T00:00:00Z`), lte: new Date(`${to.slice(0, 7)}-01T00:00:00Z`) } },
    orderBy: [{ month: 'asc' }, { version: 'desc' }],
    select: { month: true, version: true, salaryMinor: true, rentMinor: true, utilitiesMinor: true, otherMinor: true },
  });
  if (!rows.length) return null;
  const seen = new Set<string>();
  let total = 0;
  for (const r of rows) {
    const month = r.month.toISOString().slice(0, 7);
    if (seen.has(month)) continue;
    seen.add(month);
    const days = fixedCostDays(month, { salary: Number(r.salaryMinor), rent: Number(r.rentMinor), utilities: Number(r.utilitiesMinor), other: Number(r.otherMinor) });
    for (const d of days) if (d.day >= from && d.day <= to) total += d.minor;
  }
  return total;
}

/** The report of one store over `from`–`to` (the store's own days). */
export async function profitReport(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, from: string, to: string): Promise<ProfitReport> {
  const at = { storeId };
  const [currency, timeZone, fees, packaging] = await Promise.all([
    deps.resolver.value('store.currency', at),
    deps.resolver.value('store.timeZone', at),
    deps.resolver.value('costs.gatewayFees', at),
    deps.resolver.value('costs.packaging', at),
  ]);
  const [p, fixedMinor] = await Promise.all([
    profitAndLoss(deps.db, storeId, { from, to }, { currency, timeZone, packagingMinor: packaging?.perOrderMinor ?? null, gatewayFee: (amount, provider) => gatewayFeeMinor(amount, provider, fees) }),
    fixedCostsIn(deps.db, storeId, from, to),
  ]);
  return { ...p, fixedMinor, netProfitMinor: p.adsMinor === null ? null : p.contributionMinor - p.adsMinor - p.otherCostsMinor - (fixedMinor ?? 0) };
}

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** The report as CSV: the lines of the profit, then day by day (amounts in minor units; empty = not known). */
export function profitCsv(r: ProfitReport, currency: string): string {
  const lines: (string | number | null)[][] = [
    ['line', 'amountMinor', 'currency'],
    ['sales.delivered', r.salesMinor, currency],
    ['ordered.value', r.orderedMinor, currency],
    ['sales.costedOrders', r.parts.sales, currency],
    ['productCost', r.parts.productCost, currency],
    ['grossProfit', r.grossProfitMinor, currency],
    ['deliveryCharges', r.parts.deliveryCharge, currency],
    ['courier', r.parts.courier, currency],
    ['paymentFees', r.parts.paymentFees, currency],
    ['packaging', r.parts.packaging, currency],
    ['messages', r.parts.messages, currency],
    ['contribution', r.contributionMinor, currency],
    ['adSpend', r.adsMinor, currency],
    ['otherCosts', r.otherCostsMinor, currency],
    ['fixedCosts', r.fixedMinor, currency],
    ['netProfit', r.netProfitMinor, currency],
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
    const r = await profitReport(d, storeId, q.from, q.to);
    return new Response(profitCsv(r, currency), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="profit-${q.from}-${q.to}.csv"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
