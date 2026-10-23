// PR 71 — the wishlist (Blueprint register row 71; demo 60-account.js acc_guestWishlist): the hearts a visitor taps,
// kept on the server under the bag's random visitor id (no login: a login wall would lose the sale, demo R16), so the
// list page is drawn at once and a cleared browser store does not lose it. A product taken off the list is archived,
// never deleted (hard rule 3). Only published products are taken. The account's own list (customerId) arrives with the
// customer accounts; the rows already carry the column.
//
//   GET     /api/wishlist     {ids}                         this browser's list, newest first
//   POST    /api/wishlist     {ids?: string[], items?: [{productId, colourId?, variantId?}]}
//                             → {ids, added, full}          a heart, the bag's "Move to wishlist", or the old list once
//   DELETE  /api/wishlist     {productId} → {ids}           takes it off (archived)
//   POST    /api/wishlist/try                               test servers only (EXTAS_SHOP_TEST_PAGES=1): sample hearts
//
// Same site only and small bodies only; every answer refreshes the visitor cookie (`bag.keepDays`) and the readable
// count cookie the hearts compare with their copy.
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@extas/db/client';
import { visitorIdSchema } from '@extas/cart';
import type { Key, Value } from '@extas/settings';
import { body, errorResponse, fail, isUuid, json, readCookie, sameOrigin } from '../admin-auth';
import { BAG_COOKIE, bagCookie } from './bag-model';
import { sellableReader } from './sellable';
import { WISH_BODY_MAX, WISH_ITEMS_MAX, wishCountCookie, wishInputs, type WishInput } from './wish-model';

interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface WishDeps {
  db: PrismaClient;
  settings: Reader;
  storeId: number;
  now?: () => Date;
}

export interface WishRow {
  productId: string;
  colourId: string | null;
  variantId: string | null;
  createdAt: Date;
}

/** This visitor's list, newest first, one row per product. */
export async function wishRows(d: Pick<WishDeps, 'db' | 'storeId'>, visitorId: string): Promise<WishRow[]> {
  const rows = await d.db.wishlistItem.findMany({
    where: { storeId: d.storeId, visitorId, archivedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { productId: true, colourId: true, variantId: true, createdAt: true },
  });
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.productId) && !!seen.add(r.productId));
}

/**
 * Puts products on the list: published ones only, each once (a product already there takes the colour and size it is
 * given now), never past `wish.list.max` — what does not fit is refused (`full`), nothing is dropped.
 */
export async function addWishes(d: WishDeps, visitorId: string, items: WishInput[]): Promise<{ added: string[]; full: boolean }> {
  if (!items.length) return { added: [], full: false };
  const { max } = await d.settings.value('wish.list', { storeId: d.storeId });
  const ids = items.map((i) => i.productId);
  const [live, variants] = await Promise.all([
    d.db.product.findMany({ where: { storeId: d.storeId, id: { in: ids }, status: 'PUBLISHED', archivedAt: null }, select: { id: true } }),
    d.db.productVariant.findMany({
      where: { storeId: d.storeId, id: { in: items.flatMap((i) => (i.variantId ? [i.variantId] : [])) } },
      select: { id: true, productId: true, colourId: true },
    }),
  ]);
  const ok = new Set(live.map((p) => p.id));
  const variantOf = new Map(variants.map((v) => [v.id, v]));
  const now = d.now?.() ?? new Date();
  return d.db.$transaction(async (tx) => {
    const have = await tx.wishlistItem.findMany({ where: { storeId: d.storeId, visitorId, archivedAt: null }, select: { id: true, productId: true } });
    const held = new Map(have.map((h) => [h.productId, h.id]));
    let room = Math.max(0, max - held.size);
    const added: string[] = [];
    let full = false;
    for (const it of items) {
      if (!ok.has(it.productId)) continue;
      const v = it.variantId ? variantOf.get(it.variantId) : undefined;
      const variantId = v && v.productId === it.productId ? v.id : null;
      const colourId = variantId ? (v?.colourId ?? null) : it.colourId;
      const known = held.get(it.productId);
      if (known) {
        if (variantId || colourId) await tx.wishlistItem.update({ where: { id: known }, data: { variantId, colourId, updatedAt: now } });
        continue;
      }
      if (room <= 0) {
        full = true;
        continue;
      }
      await tx.wishlistItem.create({ data: { storeId: d.storeId, visitorId, productId: it.productId, colourId, variantId, createdAt: now } });
      held.set(it.productId, '');
      added.push(it.productId);
      room--;
    }
    return { added, full };
  });
}

/** Takes a product off the list (archived, never deleted). */
export async function removeWish(d: WishDeps, visitorId: string, productId: string): Promise<number> {
  const now = d.now?.() ?? new Date();
  const r = await d.db.wishlistItem.updateMany({ where: { storeId: d.storeId, visitorId, productId, archivedAt: null }, data: { archivedAt: now } });
  return r.count;
}

/** What the list page needs of a saved item beyond its card: the colour it was saved in, and the size if one. */
export interface WishDetail {
  productId: string;
  colourKey: string | null;
  /** The saved size, when it is still a live size of the product. */
  size: { variantId: string; label: string; colourKey: string | null; sellable: number } | null;
}

/** The colour and size each saved item had (from the bag's "Move to wishlist"), and whether that size can be sold now. */
export async function wishDetails(d: WishDeps, rows: readonly WishRow[]): Promise<Map<string, WishDetail>> {
  const variantIds = rows.flatMap((r) => (r.variantId ? [r.variantId] : []));
  const colourIds = rows.flatMap((r) => (r.colourId ? [r.colourId] : []));
  const [variants, colours, units] = await Promise.all([
    variantIds.length
      ? d.db.productVariant.findMany({
          where: { storeId: d.storeId, id: { in: variantIds }, archivedAt: null, active: true },
          select: { id: true, productId: true, colour: { select: { key: true } }, size: { select: { label: true, archivedAt: true } } },
        })
      : Promise.resolve([]),
    colourIds.length ? d.db.colour.findMany({ where: { storeId: d.storeId, id: { in: colourIds } }, select: { id: true, key: true } }) : Promise.resolve([]),
    sellableReader(d.db, d.settings, d.storeId)(variantIds),
  ]);
  const v = new Map(variants.map((x) => [x.id, x]));
  const col = new Map(colours.map((x) => [x.id, x.key]));
  return new Map(
    rows.map((r) => {
      const x = r.variantId ? v.get(r.variantId) : undefined;
      const size = x && x.productId === r.productId && x.size && !x.size.archivedAt ? { variantId: x.id, label: x.size.label, colourKey: x.colour?.key ?? null, sellable: units.get(x.id) ?? 0 } : null;
      return [r.productId, { productId: r.productId, colourKey: size?.colourKey ?? (r.colourId ? (col.get(r.colourId) ?? null) : null), size }];
    }),
  );
}

/** The visitor id the browser sent, when it is a well-formed one. */
export function visitorOf(cookieValue: string | null | undefined): string | null {
  return cookieValue && visitorIdSchema.safeParse(cookieValue).success ? cookieValue : null;
}

const newVisitorId = () => randomBytes(24).toString('base64url');

async function answer(d: WishDeps, visitor: string, payload: Record<string, unknown>): Promise<Response> {
  const [rows, days] = await Promise.all([wishRows(d, visitor), d.settings.value('bag.keepDays', { storeId: d.storeId })]);
  const headers = new Headers();
  headers.append('set-cookie', bagCookie(BAG_COOKIE, visitor, days));
  headers.append('set-cookie', wishCountCookie(rows.length, days));
  return json({ ok: true, ids: rows.map((r) => r.productId), ...payload }, { headers });
}

/**
 * POST /api/wishlist/try — test servers only (EXTAS_SHOP_TEST_PAGES=1): puts sample products on this browser's list the
 * way a shopper would (three hearts, one of them with a size that can be sold, as the bag's "Move to wishlist" leaves
 * it), so the device gate, the smoke test and the screenshots see a list with items. Sample data only.
 */
export async function wishTryHandler(request: Request, d: WishDeps | null): Promise<Response> {
  if (process.env.EXTAS_SHOP_TEST_PAGES !== '1') return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!d) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  try {
    const products = await d.db.product.findMany({
      where: { storeId: d.storeId, status: 'PUBLISHED', archivedAt: null, inStock: true, category: { isVisible: true, archivedAt: null } },
      orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }],
      select: { id: true, variants: { where: { archivedAt: null, active: true, inStock: true }, select: { id: true }, take: 1 } },
      take: 3,
    });
    const sellable = await sellableReader(d.db, d.settings, d.storeId)(products.flatMap((p) => p.variants.map((v) => v.id)));
    const sized = products.find((p) => p.variants.some((v) => (sellable.get(v.id) ?? 0) > 0));
    const items: WishInput[] = products.map((p) => ({ productId: p.id, colourId: null, variantId: p === sized ? p.variants[0]!.id : null }));
    const visitor = visitorOf(readCookie(request, BAG_COOKIE)) ?? newVisitorId();
    return answer(d, visitor, await addWishes(d, visitor, items));
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET / POST / DELETE /api/wishlist. */
export async function wishlistHandler(request: Request, d: WishDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!['GET', 'POST', 'DELETE'].includes(method)) return fail(405, 'method-not-allowed');
  if (!d) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > WISH_BODY_MAX) return fail(413, 'TOO_LARGE');
  try {
    const known = visitorOf(readCookie(request, BAG_COOKIE));
    if (method === 'GET') return known ? answer(d, known, {}) : json({ ok: true, ids: [] });
    const b = await body(request);
    if (method === 'DELETE') {
      if (!isUuid(b.productId)) return fail(400, 'INVALID_INPUT', ['productId']);
      if (!known) return json({ ok: true, ids: [] });
      await removeWish(d, known, b.productId);
      return answer(d, known, {});
    }
    // at most as many as the longest list may hold; the store's own limit is addWishes' (it answers `full`)
    const items = wishInputs(b, WISH_ITEMS_MAX);
    if (!items.length) return fail(400, 'INVALID_INPUT', ['ids']);
    const visitor = known ?? newVisitorId();
    return answer(d, visitor, await addWishes(d, visitor, items));
  } catch (e) {
    return errorResponse(e);
  }
}
