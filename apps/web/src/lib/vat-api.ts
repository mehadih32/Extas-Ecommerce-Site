// S16 · PR 350 (B3.10, Blueprint §59 answer 23: "VAT system present and dynamic per product/category, off for now") —
// Money → VAT (`/admin/money/vat`): the switch of the VAT system and the owner's VAT rates. Prices are VAT inclusive
// only, so nothing here changes a price, a delivery charge or COD: the shop only reads the VAT already inside them
// (`@extas/metrics` vat.ts). The rates are owner data, empty as shipped, never guessed.
//
// `path` is what comes after /api/admin/money/vat (`?storeId=`, default the mother store):
//   GET   ''           the switch, the rates, the category tree with each category's rate and the product rates (`books.read`)
//   GET   'find?q='    up to 10 products by name, link name, style code or SKU, each with the rate that applies now and why
//   PUT   'system'     {value: {enabled, onDelivery}, version}          (`vat.manage`; settings history + audit `vat.system`)
//   PUT   'rates'      {value: {defaultBps, categories, products} | null, version}   (`vat.manage`; history + audit `vat.rates`)
//   GET   'report?from=&to='  PR 537: the period's VAT report as a CSV file (`books.read`; 409 VAT_OFF while the system is off)
// A category or product of another store is refused; a category or product that is archived keeps its rate.
import { z } from 'zod';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { vatResolver, ymdIn, type VatRate } from '@extas/metrics';
import { registry, SettingsError, storeTarget, type VatRates, type VatSystemSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { parseReportQuery } from './cost-report';
import { vatCsv, vatReportFor } from './vat-report';

export { bpsToPercent, percentToBps } from './vat-percent';

type Db = Pick<PrismaClient, 'category' | 'product'>;

export interface VatCategoryRow {
  id: string;
  nameEn: string;
  nameBn: string | null;
  parentId: string | null;
  depth: number;
  archived: boolean;
  /** The category's own rate, or null when it takes its parent's or the default. */
  bps: number | null;
  /** The rate its products get (without a product rate of their own). */
  applies: VatRate;
}

export interface VatProductRow {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  bps: number;
  /** The rate it would have without its own rate (its category's or the default). */
  without: VatRate;
}

export interface VatView {
  system: { value: VatSystemSettings; version: number };
  rates: { value: VatRates | null; version: number };
  categories: VatCategoryRow[];
  products: VatProductRow[];
  /** Names of categories by id, for "from Shirts" under a rate. */
  categoryNames: Record<string, { nameEn: string; nameBn: string | null }>;
}

export interface VatFound {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  categoryId: string | null;
  rate: VatRate;
}

/** Categories in tree order (parents before children, each level by sort order and name), with their depth. */
function treeOrder<T extends { id: string; parentId: string | null; sortOrder: number; nameEn: string }>(rows: T[]): (T & { depth: number })[] {
  const ids = new Set(rows.map((r) => r.id));
  const kids = new Map<string | null, T[]>();
  for (const r of rows) {
    const p = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    kids.set(p, [...(kids.get(p) ?? []), r]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
  const out: (T & { depth: number })[] = [];
  const seen = new Set<string>();
  const walk = (p: string | null, depth: number) => {
    for (const r of kids.get(p) ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ ...r, depth });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  // A loop in the tree (never made by the app) still lists every category once.
  for (const r of rows) if (!seen.has(r.id)) out.push({ ...r, depth: 0 });
  return out;
}

async function categoriesOf(db: Db, storeId: number) {
  return db.category.findMany({ where: { storeId }, select: { id: true, parentId: true, nameEn: true, nameBn: true, sortOrder: true, archivedAt: true } });
}

/** Everything the page shows for one store. */
export async function vatView(db: Db, deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<VatView> {
  const at = { storeId };
  const [system, rates, cats] = await Promise.all([deps.resolver.get('vat.system', at), deps.resolver.get('vat.rates', at), categoriesOf(db, storeId)]);
  const parentOf = new Map(cats.map((c) => [c.id, c.parentId]));
  const rateOf = vatResolver(rates.value, parentOf);
  const own = new Map((rates.value?.categories ?? []).map((c) => [c.categoryId, c.bps]));
  const productRates = rates.value?.products ?? [];
  const products = productRates.length
    ? await db.product.findMany({ where: { storeId, id: { in: productRates.map((p) => p.productId) } }, select: { id: true, nameEn: true, nameBn: true, slug: true, categoryId: true } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const withoutOwn = vatResolver(rates.value ? { ...rates.value, products: [] } : null, parentOf);
  return {
    system: { value: system.value, version: system.version },
    rates: { value: rates.value, version: rates.version },
    categories: treeOrder(cats).map((c) => ({ id: c.id, nameEn: c.nameEn, nameBn: c.nameBn, parentId: c.parentId, depth: c.depth, archived: c.archivedAt !== null, bps: own.get(c.id) ?? null, applies: rateOf(null, c.id) })),
    products: productRates
      .filter((r) => byId.has(r.productId))
      .map((r) => {
        const p = byId.get(r.productId)!;
        return { productId: p.id, nameEn: p.nameEn, nameBn: p.nameBn, slug: p.slug, bps: r.bps, without: withoutOwn(null, p.categoryId) };
      }),
    categoryNames: Object.fromEntries(cats.map((c) => [c.id, { nameEn: c.nameEn, nameBn: c.nameBn }])),
  };
}

/** Up to 10 products of the store matching `q` (name, link name, style code or a SKU), with the rate that applies now. */
export async function vatFind(db: Db, deps: Pick<AdminDeps, 'resolver'>, storeId: number, q: string): Promise<VatFound[]> {
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  const [rates, cats, found] = await Promise.all([
    deps.resolver.value('vat.rates', { storeId }),
    categoriesOf(db, storeId),
    db.product.findMany({
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
      take: 10,
      select: { id: true, nameEn: true, nameBn: true, slug: true, categoryId: true },
    }),
  ]);
  const rateOf = vatResolver(rates, new Map(cats.map((c) => [c.id, c.parentId])));
  return found.map((p) => ({ productId: p.id, nameEn: p.nameEn, nameBn: p.nameBn, slug: p.slug, categoryId: p.categoryId, rate: rateOf(p.id, p.categoryId) }));
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
const invalid = (details: string[]) => json({ ok: false, error: 'INVALID_INPUT', details }, { status: 400 });
const versionOf = (b: Record<string, unknown>) => (typeof b.version === 'number' ? b.version : undefined);

/** PR 537: the period's VAT report as a CSV file, the period made safe as on the page (`costs.report`). */
async function reportCsv(d: AdminDeps, storeId: number, url: URL): Promise<Response> {
  const at = { storeId };
  const [timeZone, currency, limits] = await Promise.all([d.resolver.value('store.timeZone', at), d.resolver.value('store.currency', at), d.resolver.value('costs.report', at)]);
  const { q } = parseReportQuery(Object.fromEntries(url.searchParams), ymdIn(new Date(), timeZone), limits);
  const r = await vatReportFor(d, storeId, q.from, q.to);
  if (!r) return json({ ok: false, error: 'VAT_OFF' }, { status: 409 });
  const ids = r.byCategory.map((c) => c.categoryId).filter((x): x is string => x !== null);
  const cats = ids.length ? await d.db.category.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, nameEn: true } }) : [];
  const name = new Map(cats.map((c) => [c.id, c.nameEn]));
  const csv = vatCsv(r, currency, (id) => (id === null ? '(no category)' : (name.get(id) ?? id)));
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="vat-${q.from}-${q.to}.csv"`, 'cache-control': 'no-store' } });
}

/** The VAT routes (the table above). */
export async function vatRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const where = path.join('/');
  const kind = where === '' ? 'view' : where === 'find' || where === 'report' ? where : where === 'system' || where === 'rates' ? where : null;
  if (!kind) return fail(404, 'not-found');
  const want = kind === 'view' || kind === 'find' || kind === 'report' ? 'GET' : 'PUT';
  if (m !== want) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: want === 'GET' ? 'books.read' : 'vat.manage', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    if (kind === 'view') return json({ ok: true, ...(await vatView(d.db, d, storeId)) });
    if (kind === 'find') return json({ ok: true, products: await vatFind(d.db, d, storeId, url.searchParams.get('q') ?? '') });
    if (kind === 'report') return await reportCsv(d, storeId, url);
    const b = await body(request);
    const key = kind === 'system' ? ('vat.system' as const) : ('vat.rates' as const);
    const parsed = (registry[key].schema as z.ZodType).safeParse(b.value === undefined ? Symbol('missing') : b.value);
    if (!parsed.success) return invalid(parsed.error.issues.map((i) => `${[key, ...i.path].join('.')}: ${i.message}`));
    if (key === 'vat.rates' && parsed.data) {
      const v = parsed.data as VatRates;
      const [cats, prods] = await Promise.all([
        v.categories.length ? d.db.category.count({ where: { storeId, id: { in: v.categories.map((c) => c.categoryId) } } }) : 0,
        v.products.length ? d.db.product.count({ where: { storeId, id: { in: v.products.map((p) => p.productId) } } }) : 0,
      ]);
      const bad = [...(cats !== v.categories.length ? ['vat.rates.categories: only this store’s categories'] : []), ...(prods !== v.products.length ? ['vat.rates.products: only this store’s products'] : [])];
      if (bad.length) return invalid(bad);
    }
    const at = { storeId };
    const before = await d.resolver.value(key, at);
    if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
      await d.resolver.set(key, parsed.data as never, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Money › VAT', expectedVersion: versionOf(b) });
      await audit(d.db, g.actor, { storeId, action: key, entityType: 'Setting', entityId: key, before: { [key]: before }, after: { [key]: parsed.data } }, g.ctx);
    }
    const now = await d.resolver.get(key, at);
    return json({ ok: true, value: now.value, version: now.version });
  } catch (e) {
    if (e instanceof SettingsError) return json({ ok: false, error: e.code === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'INVALID_INPUT', details: [...e.issues] }, { status: e.code === 'VERSION_CONFLICT' ? 409 : 400 });
    return errorResponse(e);
  }
}
