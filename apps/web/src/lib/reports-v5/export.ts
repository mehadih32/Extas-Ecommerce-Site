// S28 · PR 714-717 — the four v5 reports as CSV files (the same figures as the pages; amounts in minor units, empty = not known):
//   GET /api/admin/reports/export/profit?from=&to=            (`books.read`)
//   GET /api/admin/reports/export/products?from=&to=          (`books.read`)
//   GET /api/admin/reports/export/marketing?from=&to=         (`marketing.campaigns.read`; empty while Marketing › Report is off)
//   GET /api/admin/reports/export/review?m=last|this          (`books.read`)
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { errorResponse, fail, guardAdmin, type AdminDeps } from '../admin-auth';
import { channelMarginPct } from '../channel-profit-view';
import { marginPct } from '../group-profit-view';
import { loadBase, loadMarketing, loadProducts, loadProfit, loadReview, loadReviewBase } from './load';
import { toCsv } from './model';

export const EXPORT_KINDS = ['profit', 'products', 'marketing', 'review'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_PERMISSION: Record<ExportKind, PermissionKey> = { profit: 'books.read', products: 'books.read', marketing: 'marketing.campaigns.read', review: 'books.read' };

type Cell = string | number | null;
type Group = { rows: { name: string | null; depth: number; orders: number; pieces: number; salesMinor: number; costedSalesMinor: number; profitMinor: number }[] };
const groupLines = (g: Group): Cell[][] => g.rows.map((x) => [x.name ?? '', x.depth, x.orders, x.pieces, x.salesMinor, x.profitMinor, marginPct(x as never)]);

export async function exportRoute(kind: string, request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return fail(404, 'not-found');
  const k = kind as ExportKind;
  const g = await guardAdmin(request, deps, { permission: EXPORT_PERMISSION[k], storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const sp = Object.fromEntries(new URL(request.url).searchParams);
    const access = { deps: d, guard: g as unknown as { permissions?: ReadonlySet<PermissionKey>; actor: unknown; ctx: unknown } };
    let csv: string;
    let name: string;
    if (k === 'profit') {
      const b = await loadBase(d, sp);
      const r = await loadProfit(d, b);
      const p = r.now;
      csv = toCsv([
        ['line', 'amountMinor', 'currency'],
        ['sales.delivered', p.salesMinor, b.currency],
        ['returns', p.parts.returns, b.currency],
        ['productCost', p.parts.productCost, b.currency],
        ['contribution', p.contributionMinor, b.currency],
        ['adSpend', p.adsMinor, b.currency],
        ['netProfit', p.netProfitMinor, b.currency],
        [],
        ['channel', 'orders', 'salesMinor', 'profitAfterAdsMinor', 'marginPct'],
        ...r.channels.rows.map((x): Cell[] => [x.key, x.orders, x.salesMinor, x.profitMinor, channelMarginPct(x)]),
        [],
        ['category', 'level', 'orders', 'pieces', 'salesMinor', 'profitMinor', 'marginPct'],
        ...groupLines(r.categories),
        [],
        ['style', 'level', 'orders', 'pieces', 'salesMinor', 'profitMinor', 'marginPct'],
        ...groupLines(r.styles),
      ]);
      name = `profit-${b.period.q.from}-${b.period.q.to}`;
    } else if (k === 'products') {
      const b = await loadBase(d, sp);
      const r = await loadProducts(access, b);
      csv = toCsv([['style', 'level', 'orders', 'pieces', 'salesMinor', 'profitMinor', 'marginPct'], ...groupLines(r.styles)]);
      name = `products-${b.period.q.from}-${b.period.q.to}`;
    } else if (k === 'marketing') {
      const m = await loadMarketing(d, sp);
      const r = m.now.report;
      csv = toCsv([
        ['channel', 'spendMinor', 'orders', 'orderedMinor', 'delivered', 'salesMinor', 'roasPercent'],
        ...(r ? r.channels.map((x): Cell[] => [x.key, x.spendMinor, x.orders, x.orderedMinor, x.delivered, x.salesMinor, x.roasPercent]) : []),
        [],
        ['campaign', 'spendMinor', 'orders', 'orderedMinor', 'delivered', 'salesMinor', 'roasPercent'],
        ...(r ? r.campaigns.map((x): Cell[] => [m.now.campaigns[x.id]?.name ?? x.id, x.spendMinor, x.orders, x.orderedMinor, x.delivered, x.salesMinor, x.roasPercent]) : []),
      ]);
      name = `marketing-${m.now.period.q.from}-${m.now.period.q.to}`;
    } else {
      const b = await loadReviewBase(d, sp);
      const r = await loadReview(access, b);
      const p = r.now;
      const w = r.was;
      csv = toCsv([
        ['line', 'thisMonthMinor', 'beforeMinor', 'currency'],
        ['sales', p.parts.sales, w.parts.sales, b.currency],
        ['returns', p.parts.returns, w.parts.returns, b.currency],
        ['productCost', p.parts.productCost, w.parts.productCost, b.currency],
        ['deliveryCharge', p.parts.deliveryCharge, w.parts.deliveryCharge, b.currency],
        ['courierAndFees', p.parts.courier + p.parts.codFee + p.parts.paymentFees, w.parts.courier + w.parts.codFee + w.parts.paymentFees, b.currency],
        ['packagingAndMessages', p.parts.packaging + p.parts.messages, w.parts.packaging + w.parts.messages, b.currency],
        ['returnLoss', p.parts.returnLoss, w.parts.returnLoss, b.currency],
        ['adSpend', p.adsMinor, w.adsMinor, b.currency],
        ['otherAndFixedCosts', p.otherCostsMinor + (p.fixedMinor ?? 0), w.otherCostsMinor + (w.fixedMinor ?? 0), b.currency],
        ['netProfit', p.netProfitMinor, w.netProfitMinor, b.currency],
        ['orders', p.orders, w.orders, ''],
        ['returnRatePct', r.channels.total.returnRatePct, r.channelsWas.total.returnRatePct, ''],
      ]);
      name = `monthly-review-${b.period.q.from}-${b.period.q.to}`;
    }
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
