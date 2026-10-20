// PR 21, 35 — what the product pages read on the server before they draw: the catalogue services as the signed-in
// person in the mother store (the same checks the API makes), the store's money format and the photos to show.
import { MOTHER_STORE_ID } from '@extas/db/client';
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
