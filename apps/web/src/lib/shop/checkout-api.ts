// PR 117–126 — the checkout's public API (no sign-in: the bag belongs to the browser's random visitor id, as in the
// bag's API). Every call is same-site only and small. Money is never taken from the browser: the page sends what the
// customer chose (the finished address line, the band he picked, the payment method …) and the server prices it again
// with the engines; the answer is the checkout as the page draws it.
import { findBag, visitorIdSchema } from '@extas/cart';
import { checkoutQuote, CheckoutError, viewOf, type CheckoutDeps } from '@extas/checkout';
import { CartError } from '@extas/cart';
import { body, errorResponse, fail, json, readCookie, sameOrigin } from '../admin-auth';
import { BAG_COOKIE } from './bag-model';
import { isShopLang, type ShopLang } from './lang';

/** The largest request body the checkout takes (the delivery details, a note, the choices). */
export const CHECKOUT_BODY_MAX = 8_192;

export interface CheckoutApiDeps {
  checkout: CheckoutDeps;
  storeId: number;
}

/** The door of every checkout route: the method, a database, the same site, a small body. */
export function guard(request: Request, deps: CheckoutApiDeps | null, methods: readonly string[]): Response | null {
  if (!methods.includes(request.method.toUpperCase())) return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > CHECKOUT_BODY_MAX) return fail(413, 'TOO_LARGE');
  return null;
}

/** The visitor (bag cookie) and his open bag, or nulls. */
export async function bagOfRequest(request: Request, d: CheckoutApiDeps): Promise<{ visitor: string | null; cartId: string | null }> {
  const sent = readCookie(request, BAG_COOKIE);
  const visitor = sent && visitorIdSchema.safeParse(sent).success ? sent : null;
  if (!visitor) return { visitor: null, cartId: null };
  return { visitor, cartId: await findBag(d.checkout, { storeId: d.storeId, visitorId: visitor }) };
}

/** A refusal in the checkout's or the bag's own codes (the page turns them into words). */
export function refusal(e: unknown): Response {
  if (e instanceof CheckoutError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ?? {}) }, { status: e.status });
  if (e instanceof CartError) return fail(e.status, e.code, e.details);
  return errorResponse(e);
}

export const langOf = (v: unknown): ShopLang => (isShopLang(v) ? v : 'en');

/** POST /api/checkout/quote — the checkout priced again for what the customer chose so far (the address read, …). */
export async function quoteHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = await body(request);
    const { cartId } = await bagOfRequest(request, deps);
    const q = await checkoutQuote(deps.checkout, { storeId: deps.storeId, cartId, lang: langOf(b.lang), address: (b.address ?? null) as never });
    return json({ ok: true, view: viewOf(q) });
  } catch (e) {
    return refusal(e);
  }
}
