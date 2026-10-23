// PR 117–126 — the checkout's public API (no sign-in: the bag belongs to the browser's random visitor id, as in the
// bag's API). Every call is same-site only and small. Money is never taken from the browser: the page sends what the
// customer chose (the finished address line, the band he picked, the payment method …) and the server prices it again
// with the engines; the answer is the checkout as the page draws it.
import { findBag, visitorIdSchema } from '@extas/cart';
import { captureDraft, checkoutQuote, CheckoutError, payAction, placeOrder, viewOf, type CheckoutDeps, type PlaceNext } from '@extas/checkout';
import { CartError } from '@extas/cart';
import { screenOrder } from '@extas/orders';
import { body, errorResponse, fail, json, readCookie, requestContext, sameOrigin } from '../admin-auth';
import { BAG_COOKIE, bagCookie, COUNT_COOKIE } from './bag-model';
import { hrefIn, isShopLang, type ShopLang } from './lang';
import { ROUTES } from './routes';

/** The largest request body the checkout takes (the delivery details, a note, the choices). */
export const CHECKOUT_BODY_MAX = 8_192;

export interface CheckoutApiDeps {
  checkout: CheckoutDeps;
  storeId: number;
  /** PR 130 — the signed-in customer of the request (his wallet, his order), or null for a guest. */
  customerOf?: (request: Request) => Promise<string | null>;
}

const customerOf = (request: Request, d: CheckoutApiDeps) => (d.customerOf ? d.customerOf(request) : Promise.resolve(null));

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

/**
 * POST /api/checkout/quote — the checkout priced again for what the customer chose so far (the address read, the band
 * he picked, the payment method). The engines validate every part; a bad one is INVALID_INPUT.
 */
export async function quoteHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = await body(request);
    const [{ cartId }, customerId] = await Promise.all([bagOfRequest(request, deps), customerOf(request, deps)]);
    const q = await checkoutQuote(deps.checkout, { storeId: deps.storeId, cartId, customerId, lang: langOf(b.lang), address: (b.address ?? null) as never, payment: (b.payment ?? null) as never, useWallet: b.useWallet === true, ip: requestContext(request).ip ?? null });
    return json({ ok: true, view: viewOf(q) });
  } catch (e) {
    return refusal(e);
  }
}

/**
 * S05 · PR 145 — the duplicate check the moment the order lands (layer 2: another open order of the same customer that
 * looks alike waits in the team's review queue). It never fails the customer's order: a problem is logged and the order
 * stays placed (the team can still see both orders).
 */
async function screenForDuplicates(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await screenOrder({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`duplicate check: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/** Where the page goes after the order or a payment answer, in its language. */
export const nextHref = (lang: ShopLang, next: PlaceNext, number: string): string => hrefIn(lang, next === 'pay' ? ROUTES.checkoutPay(number) : ROUTES.thanks(number));

/**
 * POST /api/checkout/orders — PR 125: places the order the customer confirmed. The page sends what he typed and chose,
 * the order key it made once, and the fingerprint of the money it showed; the server prices it again and stores exactly
 * that (or refuses: FORM, PRICE_CHANGED with the checkout as it is now, OUT_OF_STOCK, NO_PAYMENT, EMPTY). A second press
 * with the same key gets the same order back. The bag badge goes to 0; the visitor cookie stays (his thank-you page).
 */
export async function placeHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = await body(request);
    const [{ visitor }, customerId] = await Promise.all([bagOfRequest(request, deps), customerOf(request, deps)]);
    if (!visitor) return fail(409, 'EMPTY');
    const r = await placeOrder(deps.checkout, { storeId: deps.storeId, visitorId: visitor, customerId, ip: requestContext(request).ip ?? null, input: b });
    if (!r.replay) await screenForDuplicates(deps, r.orderId);
    const lang = langOf(b.lang);
    const days = await deps.checkout.settings.value('bag.keepDays', { storeId: deps.storeId });
    const headers = new Headers();
    headers.append('set-cookie', bagCookie(COUNT_COOKIE, '0', days));
    return json({ ok: true, number: r.number, replay: r.replay, next: nextHref(lang, r.next, r.number) }, { status: r.replay ? 200 : 201, headers });
  } catch (e) {
    return refusal(e);
  }
}

/** POST /api/checkout/payments — PR 125: the mock payment page's answer (approve, fail, try again); no money moves. */
export async function paymentHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = await body(request);
    const { visitor } = await bagOfRequest(request, deps);
    if (!visitor) return fail(404, 'NOT_FOUND', ['number']);
    const { lang, ...input } = b;
    const r = await payAction(deps.checkout, { storeId: deps.storeId, visitorId: visitor, input });
    return json({ ok: true, status: r.status, next: nextHref(langOf(lang), r.next, r.number) });
  } catch (e) {
    return refusal(e);
  }
}

/** POST /api/checkout/draft — SIM-F-026: keeps what he typed for the team's follow-up, when the owner's switch is on. */
export async function draftHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = await body(request);
    const { visitor } = await bagOfRequest(request, deps);
    if (!visitor) return json({ ok: true, kept: false });
    const customerId = await customerOf(request, deps);
    return json({ ok: true, ...(await captureDraft(deps.checkout, { storeId: deps.storeId, visitorId: visitor, customerId, input: b })) });
  } catch (e) {
    return refusal(e);
  }
}
