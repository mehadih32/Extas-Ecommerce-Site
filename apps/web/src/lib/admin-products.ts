// PR 21, 35 — what the product pages read on the server before they draw: the catalogue services as the signed-in
// person in the mother store (the same checks the API makes), the store's money format and the photos to show.
// PR 657 (CN-025, follow-up 382): `loadProductList` and `productsHref` are the one loader and one link builder design
// A (the page's own route), B and C all share, so every design reads the same figures and writes nothing (CN-044).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminProductList, SOLD_STATUS, stockByVariant, type AdminStatusFilter } from '@extas/catalogue';
import type { CatalogueDeps, Who } from '@extas/catalogue';
import { imageSources, type ImageSource } from '@extas/media';
import type { PermissionKey } from '@extas/auth';
import { moneyOf, type Money } from '@/components/admin/products/model';
import type { PageAccess } from './admin-page';

export const PRODUCTS_HOME = '/admin/products';
export const QUEUE_HOME = '/admin/products/queue';
export const productHref = (id: string) => `${PRODUCTS_HOME}/${id}`;

type Ok = Extract<PageAccess, { kind: 'ok' }>;

export interface CatalogueAccess {
  deps: CatalogueDeps;
  who: Who;
  storeId: number;
  can: (p: PermissionKey) => boolean;
}

/** The catalogue services' deps and "who" for this page's person (the mother store until store pickers come). */
export function catalogueAccess(access: Ok): CatalogueAccess {
  const storeId = MOTHER_STORE_ID;
  return {
    deps: { db: access.deps.db, settings: access.deps.resolver, now: access.deps.now },
    who: { actor: access.guard.actor, storeId, ctx: access.guard.ctx },
    storeId,
    can: (p) => access.guard.permissions?.has(p) ?? false,
  };
}

/** The store's currency (`store.currency`) written in the admin's locale. */
export async function storeMoney(c: CatalogueAccess, locale: string): Promise<Money> {
  return moneyOf(await c.deps.settings.value('store.currency', { storeId: c.storeId }), locale);
}

/** Photos to draw, by asset id (only those the store has; archived ones are left out). */
export async function photosOf(c: CatalogueAccess, assetIds: (string | null)[]): Promise<Record<string, ImageSource>> {
  const ids = assetIds.filter((a): a is string => !!a);
  if (!ids.length) return {};
  return Object.fromEntries(await imageSources({ db: c.deps.db, settings: c.deps.settings }, c.storeId, ids));
}

/** A page number from the address (?page=), 1 when missing or not a whole number. */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v) || undefined;

export interface ProductQuery {
  q?: string;
  status?: AdminStatusFilter;
  categoryId?: string;
  page: number;
  /** PR 722: "Sort: best selling" (pieces sold in 30 days); absent = newest first. */
  sort?: 'new' | 'best';
}

export interface ProductListData {
  list: Awaited<ReturnType<typeof adminProductList>>;
  money: Money;
  issuesShown: number;
  lowPieces: number;
  photoMin: number;
  bulkMax: number;
  photos: Record<string, ImageSource>;
  pages: number;
  /** PR 722 (prototype v5 parity): per product on this page — style code, struck price, ERP buying price, margin, 30-day sales, low sizes. */
  extras: Record<string, ProductExtras>;
  /** PR 722: the headline strip's store-wide figures and the one-line insight. */
  strip: ProductStrip;
  /** PR 722: may this person see the ERP buying price and margin (`catalogue.prices`)? */
  showsBuying: boolean;
}

export interface ProductExtras {
  styleCode: string | null;
  compareAtMinor: number | null;
  /** The ERP buying price ("bought from ERP at"), the average over the product's sizes that have one; null when none or not allowed. */
  buyingMinor: number | null;
  /** (price - buying) / price in percent, averaged over the sizes that have both; null when not known or not allowed. */
  marginPct: number | null;
  sold30: number;
  /** Sizes with a few pieces left (1 to `catalogue.admin.lowStockPieces`). */
  lowSizes: number;
}

export interface ProductStrip {
  sold30Pieces: number;
  avgMarginPct: number | null;
  /** How many shop products sold nothing in the last 30 days. */
  notSelling: number;
  best: { name: string; sold30: number; categoryName: string | null } | null;
  /** The owner's lowest margin (`catalogue.floor.minMarginPercent`, a mark-up on the buying price) said as a margin on the selling price; null: no floor set. */
  floorMarginPct: number | null;
  /** Shop products whose average margin is under that floor (0 when no floor). */
  belowFloor: number;
  /** PR 722: how many products are in each status chip (archived ones only under Archived). */
  statusCounts: { all: number; live: number; ready: number; draft: number; off: number; archived: number };
}

const DAY_MS = 86_400_000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** PR 657: every design's one loader (design A's route, design B and C) — the same figures, never a second read. */
export async function loadProductList(c: CatalogueAccess, locale: string, query: ProductQuery): Promise<ProductListData> {
  const [list, money, issuesShown, lowPieces, photoMin, bulkMax] = await Promise.all([
    adminProductList(c.deps, c.who, query),
    storeMoney(c, locale),
    c.deps.settings.value('catalogue.admin.issuesShown', { storeId: c.storeId }),
    c.deps.settings.value('catalogue.admin.lowStockPieces', { storeId: c.storeId }),
    c.deps.settings.value('media.photos.minimum', { storeId: c.storeId }),
    c.deps.settings.value('catalogue.bulk.maxProducts', { storeId: c.storeId }),
  ]);
  const photos = await photosOf(c, list.items.map((i) => i.thumbAssetId));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const showsBuying = c.can('catalogue.prices');
  const { extras, strip } = await loadProductExtras(c, list.items.map((i) => i.id), lowPieces, showsBuying);
  return { list, money, issuesShown, lowPieces, photoMin, bulkMax, photos, pages, extras, strip, showsBuying };
}

/** PR 722: the extra columns of the product table and the headline strip. Reads only; a failure leaves them empty (the list still draws). */
export async function loadProductExtras(c: CatalogueAccess, ids: string[], lowPieces: number, showsBuying: boolean): Promise<{ extras: Record<string, ProductExtras>; strip: ProductStrip }> {
  const empty = { extras: {}, strip: { sold30Pieces: 0, avgMarginPct: null, notSelling: 0, best: null, floorMarginPct: null, belowFloor: 0, statusCounts: { all: 0, live: 0, ready: 0, draft: 0, off: 0, archived: 0 } } as ProductStrip };
  try {
    const db = c.deps.db;
    const since = new Date(((c.deps.now ?? (() => new Date()))()).getTime() - 30 * DAY_MS);
    const [pageProducts, sold, shop, floor, byStatus, archivedCount] = await Promise.all([
      ids.length
        ? db.product.findMany({ where: { storeId: c.storeId, id: { in: ids } }, select: { id: true, erpStyleCode: true, variants: { where: { archivedAt: null }, select: { id: true, priceMinor: true, compareAtMinor: true, shopPriceMinor: true } } } })
        : Promise.resolve([]),
      db.orderItem.groupBy({ by: ['productId'], where: { storeId: c.storeId, productId: { not: null }, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } }, _sum: { quantity: true } }),
      db.product.findMany({ where: { storeId: c.storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true, nameEn: true, category: { select: { nameEn: true } }, variants: { where: { archivedAt: null }, select: { priceMinor: true, shopPriceMinor: true } } } }),
      Promise.resolve(c.deps.settings.value('catalogue.floor.minMarginPercent', { storeId: c.storeId })).then((v): number | null => (typeof v === 'number' ? v : null)),
      db.product.groupBy({ by: ['status'], where: { storeId: c.storeId, archivedAt: null }, _count: { _all: true } }),
      db.product.count({ where: { storeId: c.storeId, archivedAt: { not: null } } }),
    ]);
    const inStatus = (st: string) => byStatus.find((b) => b.status === st)?._count._all ?? 0;
    const floorMarginPct = showsBuying && floor != null ? Math.round(((floor * 100) / (100 + floor)) * 10) / 10 : null;
    const soldBy = new Map(sold.map((r) => [r.productId as string, r._sum.quantity ?? 0]));
    const stock = await stockByVariant(db, c.storeId, pageProducts.flatMap((p) => p.variants.map((v) => v.id)));
    const marginOf = (vs: { priceMinor: number | null; shopPriceMinor: number | null }[]) => mean(vs.filter((v) => v.priceMinor && v.priceMinor > 0 && v.shopPriceMinor && v.shopPriceMinor > 0).map((v) => ((v.priceMinor! - v.shopPriceMinor!) / v.priceMinor!) * 100));
    const extras: Record<string, ProductExtras> = {};
    for (const p of pageProducts) {
      const priced = p.variants.filter((v) => v.priceMinor && v.priceMinor > 0);
      const cheapest = priced.sort((a, b) => a.priceMinor! - b.priceMinor!)[0];
      const buy = mean(p.variants.map((v) => v.shopPriceMinor).filter((x): x is number => !!x && x > 0));
      const m = marginOf(p.variants);
      extras[p.id] = {
        styleCode: p.erpStyleCode,
        compareAtMinor: cheapest?.compareAtMinor && cheapest.compareAtMinor > (cheapest.priceMinor ?? 0) ? cheapest.compareAtMinor : null,
        buyingMinor: showsBuying && buy !== null ? Math.round(buy) : null,
        marginPct: showsBuying && m !== null ? Math.round(m * 10) / 10 : null,
        sold30: soldBy.get(p.id) ?? 0,
        lowSizes: p.variants.filter((v) => { const n = stock.get(v.id) ?? 0; return n > 0 && n <= lowPieces; }).length,
      };
    }
    const ranked = shop.map((p) => ({ name: p.nameEn, sold30: soldBy.get(p.id) ?? 0, categoryName: p.category?.nameEn ?? null })).sort((a, b) => b.sold30 - a.sold30);
    const avg = showsBuying ? mean(shop.map((p) => marginOf(p.variants)).filter((x): x is number => x !== null)) : null;
    return {
      extras,
      strip: {
        sold30Pieces: sold.reduce((n, r) => n + (r._sum.quantity ?? 0), 0),
        avgMarginPct: avg === null ? null : Math.round(avg * 10) / 10,
        notSelling: ranked.filter((r) => r.sold30 === 0).length,
        best: ranked[0] && ranked[0].sold30 > 0 ? ranked[0] : null,
        floorMarginPct,
        statusCounts: { all: byStatus.reduce((n, b) => n + b._count._all, 0), live: inStatus('PUBLISHED'), ready: inStatus('READY_TO_PUBLISH'), draft: inStatus('DRAFT'), off: inStatus('UNPUBLISHED'), archived: archivedCount },
        belowFloor: floorMarginPct === null ? 0 : shop.filter((p) => { const m = marginOf(p.variants); return m !== null && m < floorMarginPct; }).length,
      },
    };
  } catch {
    return empty;
  }
}

/** PR 657: the list's own link builder, shared by every design (q/status/category kept, page reset unless given). */
export function productsHref(query: ProductQuery, o: { q?: string; status?: string; category?: string; page?: number }): string {
  const p = new URLSearchParams();
  const merged = { q: query.q, status: query.status, category: query.categoryId, ...o };
  if (query.sort && query.sort !== 'new') p.set('sort', query.sort);
  if (merged.q) p.set('q', merged.q);
  if (merged.status) p.set('status', merged.status);
  if (merged.category) p.set('category', merged.category);
  if (o.page && o.page > 1) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `${PRODUCTS_HOME}?${s}` : PRODUCTS_HOME;
}
