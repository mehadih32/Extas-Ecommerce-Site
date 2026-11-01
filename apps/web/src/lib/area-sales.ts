// S16 · PR 568 (B3.10 Locked; BACKEND-ARCHITECTURE §5 REP-02) — Reports → Areas (`/admin/reports/areas`) and its CSV:
// Sales, pieces and returns by district, by upazila/thana or by area inside Dhaka City, for the whole shop, a category
// (with its sub-categories) or one product, over any period (the rules of Costs and Profit & loss, `costs.report`). The
// figure is @extas/metrics `salesByArea` (delivered orders only for Sales). Seeing needs `books.read`. Read-only.
//   GET /api/admin/reports/areas?from=&to=&level=&category=&product=   the table as a CSV file (`books.read`)
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { AREA_LEVELS, salesByArea, ymdIn, type AreaFigures, type AreaLevel, type AreaSales } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, type AdminDeps } from './admin-auth';
import { parseReportQuery, type ParsedQuery, type ReportLimits } from './cost-report';
import type { AppResolver } from './settings';

export interface AreaQuery {
  level: AreaLevel;
  categoryId: string | null;
  productId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The level, category and product asked for; anything unknown falls back to the district level and the whole shop. */
export function parseAreaQuery(sp: Record<string, string | string[] | undefined>): AreaQuery {
  const level = AREA_LEVELS.find((l) => l === one(sp.level)) ?? 'district';
  const id = (v: string | undefined) => (v && UUID.test(v) ? v.toLowerCase() : null);
  return { level, categoryId: id(one(sp.category)), productId: id(one(sp.product)) };
}

export interface AreaReport {
  /** The store's today (the latest day a period may end on). */
  today: string;
  period: ParsedQuery;
  area: AreaQuery;
  sales: AreaSales;
  /** The chosen category and product as this store has them (another store's id is dropped). */
  category: { id: string; nameEn: string; nameBn: string | null } | null;
  product: { id: string; nameEn: string; nameBn: string | null } | null;
}

/** The report of one store for the page's query. */
export async function areaReport(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, sp: Record<string, string | string[] | undefined>, limits: ReportLimits, timeZone: string): Promise<AreaReport> {
  const today = ymdIn(new Date(), timeZone);
  const period = parseReportQuery(sp, today, limits);
  const asked = parseAreaQuery(sp);
  const [category, product] = await Promise.all([
    asked.categoryId ? deps.db.category.findFirst({ where: { storeId, id: asked.categoryId }, select: { id: true, nameEn: true, nameBn: true } }) : null,
    asked.productId ? deps.db.product.findFirst({ where: { storeId, id: asked.productId }, select: { id: true, nameEn: true, nameBn: true } }) : null,
  ]);
  const area: AreaQuery = { level: asked.level, categoryId: category?.id ?? null, productId: product?.id ?? null };
  const sales = await salesByArea(deps.db, storeId, { from: period.q.from, to: period.q.to }, { timeZone, ...area });
  return { today, period, area, sales, category, product };
}

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** A return rate as a percentage with one decimal; empty when there is none. */
export const ratePct = (r: number | null) => (r === null ? null : Math.round(r * 1000) / 10);

/** The table as CSV (amounts in minor units, the return rate in %; empty = none). */
export function areaCsv(r: AreaSales, currency: string): string {
  const fig = (f: AreaFigures) => [f.delivered, f.salesMinor, f.pieces, f.returned, ratePct(f.returnRate)];
  const lines: (string | number | null)[][] = [
    ['area', 'district', 'deliveredOrders', 'salesMinor', 'pieces', 'returnedOrders', 'returnRatePct', 'currency'],
    ...r.rows.map((x) => [x.nameEn, x.parentNameEn, ...fig(x), currency]),
    ['(area not known)', null, ...fig(r.unknown), currency],
    ...(r.level === 'dhaka' ? [['(outside Dhaka City)', null, ...fig(r.outside), currency]] : []),
    ['(total)', null, ...fig(r.total), currency],
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** The CSV route. */
export async function areasRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
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
    const r = await areaReport(d, storeId, Object.fromEntries(url.searchParams), limits, timeZone);
    const name = `areas-${r.area.level}-${r.period.q.from}-${r.period.q.to}.csv`;
    return new Response(areaCsv(r.sales, currency), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Up to `take` products of the store by name, link name, style code or SKU (for "Only this product"). */
export async function findAreaProducts(db: Pick<PrismaClient, 'product'>, storeId: number, q: string, take: number): Promise<{ id: string; nameEn: string; nameBn: string | null }[]> {
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  return db.product.findMany({
    where: {
      storeId,
      OR: [
        { nameEn: { contains: text, mode: 'insensitive' } },
        { nameBn: { contains: text, mode: 'insensitive' } },
        { slug: { contains: text.toLowerCase() } },
        { erpStyleCode: { equals: text, mode: 'insensitive' } },
        { variants: { some: { sku: { equals: text, mode: 'insensitive' } } } },
      ],
    },
    orderBy: { nameEn: 'asc' },
    take,
    select: { id: true, nameEn: true, nameBn: true },
  });
}
