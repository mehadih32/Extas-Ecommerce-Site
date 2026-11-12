// PR 21, 35 — what the product pages read on the server before they draw: the catalogue services as the signed-in
// person in the mother store (the same checks the API makes), the store's money format and the photos to show.
// PR 657 (CN-025, follow-up 382): `loadProductList` and `productsHref` are the one loader and one link builder design
// A (the page's own route), B and C all share, so every design reads the same figures and writes nothing (CN-044).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminProductList, type AdminStatusFilter } from '@extas/catalogue';
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
}

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
  return { list, money, issuesShown, lowPieces, photoMin, bulkMax, photos, pages };
}

/** PR 657: the list's own link builder, shared by every design (q/status/category kept, page reset unless given). */
export function productsHref(query: ProductQuery, o: { q?: string; status?: string; category?: string; page?: number }): string {
  const p = new URLSearchParams();
  const merged = { q: query.q, status: query.status, category: query.categoryId, ...o };
  if (merged.q) p.set('q', merged.q);
  if (merged.status) p.set('status', merged.status);
  if (merged.category) p.set('category', merged.category);
  if (o.page && o.page > 1) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `${PRODUCTS_HOME}?${s}` : PRODUCTS_HOME;
}
