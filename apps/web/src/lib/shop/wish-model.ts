// PR 71 — the wishlist's pure pieces, shared by the server, the API and the browser (no database, no React): the
// readable count cookie, the browser's mirror of the list, and the request body the API takes. Tested in
// wish-model.test.ts.

/** The number of products in this browser's list (readable by the page: the hearts compare it with their mirror). */
export const WISH_COUNT_COOKIE = 'extas_wish_n';
/** The browser's copy of the list (product ids), so a heart is drawn filled at once (PR 41 kept the list here). */
export const WISH_STORE_KEY = 'extas.wishlist';
/** Set once the browser's own list (before PR 71) has been handed to the server. */
export const WISH_SYNCED_KEY = 'extas.wishlist.server';
/** The event every heart listens to; `detail.user` when a shopper changed the list (not a background sync). */
export const WISH_CHANGED = 'extas:wishlist';
/** The largest body the wishlist API takes (a list of ids handed over once, or one id). */
export const WISH_BODY_MAX = 16_384;
/** The most entries one request may carry (the longest list `wish.list.max` allows). */
export const WISH_ITEMS_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The count cookie: readable by the page (not HttpOnly; it holds a number, never trusted for anything). */
export function wishCountCookie(n: number, days: number): string {
  return `${WISH_COUNT_COOKIE}=${Math.max(0, Math.floor(n))}; Path=/; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(days * 86_400))}`;
}

/** The count from the cookie header of the page (`document.cookie`), or null when there is none. */
export function wishCountOf(cookie: string): number | null {
  const m = new RegExp(`(?:^|;\\s*)${WISH_COUNT_COOKIE}=(\\d{1,4})(?:;|$)`).exec(cookie);
  return m ? Number(m[1]) : null;
}

export interface WishInput {
  productId: string;
  colourId: string | null;
  variantId: string | null;
}

/**
 * What a POST may carry: `ids` (product ids — a heart, or the browser's old list handed over once) and/or `items`
 * (a product with the colour and size it had, from the bag). Anything not an id is dropped; at most `max` entries.
 */
export function wishInputs(body: Record<string, unknown>, max: number): WishInput[] {
  const out: WishInput[] = [];
  const seen = new Set<string>();
  const push = (productId: unknown, colourId: unknown = null, variantId: unknown = null) => {
    if (typeof productId !== 'string' || !UUID.test(productId) || seen.has(productId) || out.length >= max) return;
    seen.add(productId);
    out.push({ productId, colourId: typeof colourId === 'string' && UUID.test(colourId) ? colourId : null, variantId: typeof variantId === 'string' && UUID.test(variantId) ? variantId : null });
  };
  if (Array.isArray(body.items))
    for (const it of body.items) if (it && typeof it === 'object') push((it as Record<string, unknown>).productId, (it as Record<string, unknown>).colourId, (it as Record<string, unknown>).variantId);
  if (Array.isArray(body.ids)) for (const id of body.ids) push(id);
  return out;
}
