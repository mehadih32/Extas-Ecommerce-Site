// S28 · PR 714-717 — the four v5 reports as CSV files (the same figures as the pages; amounts in minor units, empty = not known):
//   GET /api/admin/reports/export/profit?from=&to=            (`books.read`)
//   GET /api/admin/reports/export/products?from=&to=          (`books.read`)
//   GET /api/admin/reports/export/marketing?from=&to=         (`marketing.campaigns.read`; empty while Marketing › Report is off)
//   GET /api/admin/reports/export/review?m=last|this          (`books.read`)
//   GET /api/admin/reports/export/orders?from=&to=&ch=        (`books.read`; the Sales report: day or week, channel, payment)
//   GET /api/admin/reports/export/customers?from=&to=         (`reports.read`; PR 798: who ordered, new against returning, at-risk buyers)
//   GET /api/admin/reports/export/team?from=&to=            (`staff.performance`; PR 798: what each person did)
//   GET /api/admin/reports/export/areas?from=&to=&path=       (`books.read`; PR 798: every place one level under the path)
//   GET /api/admin/reports/export/couriers?from=&to=          (`reports.read`; PR 799: each courier's parcels, success, charge, cash held, claims)
// Every heading and word in these files is English, whatever the admin's language (the Excel and PDF rule, tested in words.test.ts).
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { errorResponse, fail, guardAdmin, type AdminDeps } from '../admin-auth';
import { channelMarginPct } from '../channel-profit-view';
import { marginPct } from '../group-profit-view';
import { areaStats, loadGeoOrders } from './areas';
import { avg, loadTeam, total as teamTotal } from './team';
import { courierStats, inSpan, loadCouriers } from './couriers';
import { customerFacts, loadCustomers, whoOrdered } from './customers';
import { PLACE_LEVELS, nameAt, underPath } from './geo';
import { loadBase, loadMarketing, loadProducts, loadProfit, loadReview, loadReviewBase } from './load';
import { isSaleSource, loadSaleOrders, saleBuckets, saleFacts } from './sales';
import { toCsv } from './model';
import { practiceScope } from './practice';

export const EXPORT_KINDS = ['profit', 'products', 'marketing', 'review', 'orders', 'customers', 'areas', 'team', 'couriers'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_PERMISSION: Record<ExportKind, PermissionKey> = { profit: 'books.read', products: 'books.read', marketing: 'marketing.campaigns.read', review: 'books.read', orders: 'books.read', customers: 'reports.read', areas: 'books.read', team: 'staff.performance', couriers: 'reports.read' };

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
    } else if (k === 'orders') {
      const b = await loadBase(d, sp);
      const { from, to } = b.period.q;
      const rows = await loadSaleOrders(d.db, b.timeZone, from, to, isSaleSource(sp.ch) ? sp.ch : null, await practiceScope(d));
      const bk = saleBuckets(rows, from, to, sp.grain === 'week' ? 'week' : 'day');
      csv = toCsv([
        ['from', 'to', 'orders', 'pieces', 'orderValueMinor', 'delivered', 'deliveredMinor', 'returned', 'cancelled'],
        ...bk.list.map((x): Cell[] => {
          const f = saleFacts(x.rows);
          return [x.from, x.to, f.orders, f.pieces, f.orderValue, f.delivered, f.deliveredValue, f.returned, f.cancelled];
        }),
        [],
        ['channel', 'orders', 'orderValueMinor'],
        ...[...new Set(rows.map((r) => r.source))].map((s): Cell[] => {
          const f = saleFacts(rows.filter((r) => r.source === s));
          return [s, f.orders, f.orderValue];
        }),
        [],
        ['paymentMethod', 'orders'],
        ...[...new Set(rows.map((r) => r.method ?? ''))].map((m): Cell[] => [m, saleFacts(rows.filter((r) => (r.method ?? '') === m)).orders]),
      ]);
      name = `sales-${from}-${to}`;
    } else if (k === 'customers') {
      const b = await loadBase(d, sp);
      const { from, to } = b.period.q;
      const data = await loadCustomers(d, b.timeZone, from, to, b.before, new Date());
      const w = whoOrdered(data.cur, data.first);
      const f = customerFacts(data.cur, data.buyers, data.first, Date.now(), data.quietDays);
      csv = toCsv([
        ['from', 'to', 'customersOrdered', 'new', 'returning', 'repeatRatePct', 'averageCustomerValueMinor', 'atRisk'],
        [from, to, w.n, w.nw, w.ret, Math.round(f.repeat * 10) / 10, f.avgValue, f.atRisk.length],
        [],
        ['customer', 'orders', 'spentMinor', 'isNew'],
        ...f.topCustomers.map((x): Cell[] => [x.buyer?.name ?? '', x.n, x.v, x.isNew ? 'yes' : 'no']),
        [],
        ['district', 'customers', 'orders', 'orderValueMinor'],
        ...f.byDistrict.map((x): Cell[] => [x.d, x.n, x.o, x.v]),
        [],
        ['atRiskCustomer', 'orders', 'spentMinor', 'lastOrder'],
        ...f.atRisk.map((x): Cell[] => [x.name, x.orders, x.spentMinor, x.lastOrderAt ? new Date(x.lastOrderAt).toISOString().slice(0, 10) : null]),
      ]);
      name = `customers-${from}-${to}`;
    } else if (k === 'areas') {
      const b = await loadBase(d, sp);
      const { from, to } = b.period.q;
      const path = (sp.path ?? '').split('/').map((x) => x.trim()).filter(Boolean).slice(0, PLACE_LEVELS.length - 1);
      const orders = (await loadGeoOrders(d, b.timeZone, from, to, { source: isSaleSource(sp.ch) ? sp.ch : null })).filter((o) => underPath(o.place, path));
      const level = PLACE_LEVELS[Math.min(path.length, PLACE_LEVELS.length - 1)]!;
      csv = toCsv([
        [level, 'orders', 'pieces', 'productValueMinor', 'delivered', 'returned', 'returnRatePct', 'collectedMinor', 'profitMinor', 'averageOrderMinor'],
        ...areaStats(orders, (o) => nameAt(o.place, level)).map((x): Cell[] => [x.key, x.n, x.pcs, x.mrp, x.d, x.rt, Math.round(x.rr * 10) / 10, x.col, x.pr, x.aov]),
      ]);
      name = `areas-${from}-${to}`;
    } else if (k === 'couriers') {
      const b = await loadBase(d, sp);
      const { from, to } = b.period.q;
      const data = await loadCouriers(d.db, b.timeZone, from, to, b.today, await practiceScope(d));
      const stats = courierStats(data.couriers, inSpan(data.rows, from, to, b.timeZone), data.charge, data.held, data.claims);
      csv = toCsv([
        ['courier', 'parcels', 'delivered', 'returned', 'successPct', 'returnedPct', 'avgDays', 'chargePerParcelMinor', 'cashHeldMinor', 'openClaims'],
        ...stats.map((s): Cell[] => [s.name, s.parcels, s.delivered, s.returned, s.success === null ? null : Math.round(s.success * 10) / 10, s.returnPct === null ? null : Math.round(s.returnPct * 10) / 10, s.avgDays === null ? null : Math.round(s.avgDays * 10) / 10, s.perParcel, s.held, s.openClaims]),
      ]);
      name = `couriers-${from}-${to}`;
    } else if (k === 'team') {
      const b = await loadBase(d, sp);
      const { from, to } = b.period.q;
      const data = await loadTeam(d, b.timeZone, from, to, b.before);
      csv = toCsv([
        ['person', 'role', 'confirmed', 'cancelled', 'packed', 'handedToCourier', 'exchanges', 'messagesAnswered', 'chatsAnswered', 'chatsToOrders', 'avgFirstReplyMin', 'avgHoursToConfirm', 'total'],
        ...data.people.map((p): Cell[] => {
          const a = data.cur.get(p.id);
          const cv = data.conv.get(p.id);
          return [p.name, p.role, a?.confirm ?? 0, a?.cancel ?? 0, a?.pack ?? 0, a?.hand ?? 0, a?.exch ?? 0, a?.msgs ?? 0, cv?.chats ?? 0, cv?.orders ?? 0, a ? Math.round(avg(a.rt)) : 0, a ? Math.round(avg(a.ct) * 10) / 10 : 0, a ? teamTotal(a) : 0];
        }),
      ]);
      name = `team-${from}-${to}`;
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
