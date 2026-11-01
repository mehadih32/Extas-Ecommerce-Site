// PR 117–126 — the checkout's public API (no sign-in: the bag belongs to the browser's random visitor id, as in the
// bag's API). Every call is same-site only and small. Money is never taken from the browser: the page sends what the
// customer chose (the finished address line, the band he picked, the payment method …) and the server prices it again
// with the engines; the answer is the checkout as the page draws it.
import { findBag, visitorIdSchema } from '@extas/cart';
import { captureDraft, checkoutQuote, CheckoutError, noteFlagShown, payAction, payView, placeOrder, saveVoiceAddress, viewOf, type CheckoutDeps, type CheckoutQuote, type PlaceNext, type VoiceHooks } from '@extas/checkout';
import { isPaymentsError, startPayment, type PaymentsDeps } from '@extas/payments';
import { CartError } from '@extas/cart';
import { askCheckoutAdvance, assessRisk, blocklistOnOrder, blockProposalOnOrder, bundleOnOrder, isOrdersError, linkIdentity, newCustomerOnOrder, phoneRiskCheck, refuserTermsOnOrder, placeInSection, screenOrder, transitDuplicateAnswer, transitDuplicateCheck, twoSizeCheck, type CourierFraudSource } from '@extas/orders';
import { body, errorResponse, fail, json, readCookie, requestContext, sameOrigin } from '../admin-auth';
import { BAG_COOKIE, bagCookie, COUNT_COOKIE, DEVICE_COOKIE } from './bag-model';
import { SUPPORT_REF_COOKIE, supportRefOf } from './support-ref-model';
import { hrefIn, isShopLang, type ShopLang } from './lang';
import { ROUTES } from './routes';
import { noteBotSignals } from '../security/bot-check';
import { ATTRIBUTION_COOKIE, keptTouch, orderAttributionOf } from '../tracking/attribution';
import { trackPurchase } from '../tracking/shop';
import { isSupportError, requestCallBack } from '@extas/support';
import { phoneNormalizeBD } from '../phone-bd';

/** The largest request body the checkout takes (the delivery details, a note, the choices). */
export const CHECKOUT_BODY_MAX = 8_192;

export interface CheckoutApiDeps {
  checkout: CheckoutDeps;
  storeId: number;
  /** PR 130 — the signed-in customer of the request (his wallet, his order), or null for a guest. */
  customerOf?: (request: Request) => Promise<string | null>;
  /** PR 170 — the payments service with the gateways ("Pay" opens the gateway's page); none: no gateway here. */
  payments?: () => Promise<PaymentsDeps | null>;
  /** PR 170 — our callback address for a provider on this request's host. */
  callbackBase?: (request: Request, provider: string, lang: string) => string;
  /** CN-020 (4): where voice recordings are kept and the speech-to-text connection; none: nothing kept or read. */
  voice?: () => VoiceHooks | null;
  /** PR 567 — the courier fraud checks connected and passed (lib/shop/courier-fraud.ts); none: nothing is asked. */
  fraudSources?: (storeId: number) => Promise<CourierFraudSource[]>;
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
  if (isPaymentsError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
  return errorResponse(e);
}

/**
 * Confirm's refusal (CN-029 Phase 3 qa-gate I3, PR 610): checkout paused while the ERP holds the shop's account is an
 * expected state of the shop, not a failed request — it answers 200 with `ok: false` and `PAUSED` (the browser logs
 * every 4xx as a console error; the page shows its calm notice). No order is made either way. Every other refusal keeps
 * its own status.
 */
export function placeRefusal(e: unknown): Response {
  if (e instanceof CheckoutError && e.code === 'PAUSED') return json({ ok: false, error: e.code }, { status: 200 });
  return refusal(e);
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
    const [{ cartId }, customerId, capture] = await Promise.all([bagOfRequest(request, deps), customerOf(request, deps), deps.checkout.settings.value('risk.capture', { storeId: deps.storeId })]);
    // PR 559 (SIM-F-015): this browser's device id, while the owner keeps device ids, so the look sees more than the number
    const had = capture.device ? readCookie(request, DEVICE_COOKIE) : null;
    const deviceId = had && visitorIdSchema.safeParse(had).success ? had : null;
    const q = await checkoutQuote(deps.checkout, { storeId: deps.storeId, cartId, customerId, lang: langOf(b.lang), address: (b.address ?? null) as never, payment: (b.payment ?? null) as never, useWallet: b.useWallet === true, ip: requestContext(request).ip ?? null, gift: b.gift === true, details: (b.details ?? null) as never, deviceId });
    if (q.flag) await keepFlagShown(deps, customerId, q);
    return json({ ok: true, view: viewOf(q) });
  } catch (e) {
    return refusal(e);
  }
}

/**
 * S06 · PR 562 — a bag a layer asked to pay ahead is kept once for the flag outcome report (only while the owner keeps
 * `risk.flagReport` on). A record only: it never fails or slows the customer's checkout past its own write (a problem is
 * logged).
 */
async function keepFlagShown(deps: CheckoutApiDeps, customerId: string | null, q: CheckoutQuote): Promise<void> {
  try {
    await noteFlagShown(deps.checkout, { storeId: deps.storeId, customerId, quote: q });
  } catch (e) {
    console.warn(`flag kept: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 519 — the order joins its customer's identity the moment it lands (off until the owner turns `risk.identity`
 * on): the same phone, the same device, or an alike name and address. First, so the duplicate rules and the risk score
 * read it. A record only: it never fails, holds or blocks the customer's order (a problem is logged).
 */
async function linkToIdentity(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await linkIdentity({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`identity link: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
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

/**
 * S05 · PR 146 — the two-size follow-up the moment the order lands (off until the owner turns `orders.twoSize` on): the
 * same piece in neighbouring sizes is asked about, a family's sizes (the bag's "for different people") are only a note
 * (SIM-F-036). Like the duplicate check, it never fails the customer's order.
 */
async function checkTwoSizes(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await twoSizeCheck({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`two-size check: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 156 — the risk score the moment the order lands (off until the owner turns `risk.score` on): stored once on
 * the order with its reasons, for the team only. It never fails, holds or blocks the customer's order: a problem is
 * logged and the order stays placed, unscored (a person can score it again from the order page).
 */
async function scoreRisk(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await assessRisk({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`risk score: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 545 — the new-customer call the moment the order lands (off until the owner turns `risk.newCustomer` on): a
 * customer with no earlier order anywhere gets one call task and a mark for the team. Never holds, declines or asks an
 * advance; a problem is logged and the order stays placed.
 */
async function checkNewCustomer(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await newCustomerOnOrder({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`new customer: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 162 — the blocklist the moment the order lands (off until the owner turns `risk.blocklist` on): a listed
 * number, or the same identity, is marked for the team, or held for a person. Never fails, cancels or tells the customer.
 */
async function checkBlocklist(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await blocklistOnOrder({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`blocklist: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 163 — a repeat refuser's terms the moment the order lands (off until the owner turns `risk.refusers` on): the
 * owner's terms for the number (or its identity) become the order's advance proposal, for a person to send. Never fails
 * the order, changes COD by itself or tells the customer.
 */
async function checkRefuserTerms(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await refuserTermsOnOrder({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`refuser terms: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 523 — the blocklist proposal the moment the order lands (off until the owner turns `risk.blockProposal` on and
 * sets the number): a person with enough rejections has the number proposed for the blocklist and the order marked, for
 * a person to decide. Nothing is blocked, held or cancelled; the customer is told nothing. Never stops the order.
 */
async function checkBlockProposal(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await blockProposalOnOrder({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`block proposal: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S06 · PR 522 — one parcel for one person's orders, the moment the order lands (off until the owner turns
 * `risk.bundling` on and sets its hours): the order is marked for a person to press "One parcel", or grouped with the same
 * person's other open orders to the same address. Lines, money and the status never change. Never stops the order.
 */
async function checkBundling(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await bundleOnOrder({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`bundling: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S05 · PR 541 — the order's section the moment it lands, after the duplicate screen and the score (`risk.sections`):
 * a duplicate, a re-order, a new identity, high risk, watch, prepaid or clear, with its note on the timeline; the strong
 * sections wait for a person. Marking only: nothing is cancelled, held or blocked, and the customer's order never fails.
 */
async function sectionRisk(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await placeInSection({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`risk section: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

/**
 * S04 · PR 560 — a checkout the owner's Parameter for Checkout flagged waits for its advance the moment it lands (the
 * order service's AWAITING_ADVANCE; the payment page pays it and puts it back in the queue). Never cancelled, held or
 * blocked by itself, and the customer's order never fails: a problem is logged and the order stays placed.
 */
async function waitForAdvance(deps: CheckoutApiDeps, orderId: string): Promise<void> {
  try {
    await askCheckoutAdvance({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, orderId });
  } catch (e) {
    console.warn(`checkout advance: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
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
    // PR 379: the page's quiet bot signals travel beside the order, never inside it (the order's own form is strict)
    const { human, ...b } = await body(request);
    const [{ visitor }, customerId] = await Promise.all([bagOfRequest(request, deps), customerOf(request, deps)]);
    if (!visitor) return fail(409, 'EMPTY');
    // PR 159: the device id this browser already has, or a new random one while the owner keeps device ids
    const capture = await deps.checkout.settings.value('risk.capture', { storeId: deps.storeId });
    const had = readCookie(request, DEVICE_COOKIE);
    const device = capture.device ? (had && visitorIdSchema.safeParse(had).success ? had : crypto.randomUUID()) : null;
    const ip = requestContext(request).ip ?? null;
    // PR 257 follow-up: the campaign tags of the visit (the shop's own cookie, within the owner's days)
    const attribution = orderAttributionOf(await keptTouch(readCookie(request, ATTRIBUTION_COOKIE), deps.storeId, deps.checkout.settings));
    // PR 429: a product link from a support chat this browser opened (the checkout checks it again and credits once)
    const supportRef = supportRefOf(readCookie(request, SUPPORT_REF_COOKIE));
    const r = await placeOrder(deps.checkout, { storeId: deps.storeId, visitorId: visitor, customerId, ip, deviceId: device, attribution, supportRef, input: b });
    if (!r.replay) {
      await noteBotSignals({ db: deps.checkout.db, settings: deps.checkout.settings }, { form: 'checkout', sent: human, storeId: deps.storeId, ip });
      await linkToIdentity(deps, r.orderId);
      await screenForDuplicates(deps, r.orderId);
      await checkTwoSizes(deps, r.orderId);
      await scoreRisk(deps, r.orderId);
      await checkBlocklist(deps, r.orderId);
      await checkRefuserTerms(deps, r.orderId);
      await checkBlockProposal(deps, r.orderId);
      await sectionRisk(deps, r.orderId);
      await checkNewCustomer(deps, r.orderId);
      await waitForAdvance(deps, r.orderId);
      await checkBundling(deps, r.orderId);
      // PR 257: the purchase goes to the ad platforms from the server while tracking is on (quiet, never stops the order)
      await trackPurchase(request, { storeId: deps.storeId, orderId: r.orderId });
    }
    const lang = langOf(b.lang);
    const days = await deps.checkout.settings.value('bag.keepDays', { storeId: deps.storeId });
    const headers = new Headers();
    headers.append('set-cookie', bagCookie(COUNT_COOKIE, '0', days));
    if (device) headers.append('set-cookie', bagCookie(DEVICE_COOKIE, device, capture.retentionDays));
    return json({ ok: true, number: r.number, replay: r.replay, next: nextHref(lang, r.next, r.number) }, { status: r.replay ? 200 : 201, headers });
  } catch (e) {
    return placeRefusal(e);
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
    // PR 170: "Pay" on a connected gateway — the visitor's own open payment gets the gateway's session
    if (input.action === 'start') {
      const view = typeof input.number === 'string' ? await payView(deps.checkout, { storeId: deps.storeId, visitorId: visitor, number: input.number }) : null;
      if (!view) return fail(404, 'NOT_FOUND', ['number']);
      const pd = deps.payments ? await deps.payments() : null;
      if (!pd || !deps.callbackBase) return fail(503, 'GATEWAY_ERROR');
      const s = await startPayment(pd, { storeId: deps.storeId, paymentId: view.paymentId, callbackBaseUrl: deps.callbackBase(request, view.provider ?? '', langOf(lang)) });
      return json({ ok: true, status: 'PENDING', next: s.redirectUrl });
    }
    const r = await payAction(deps.checkout, { storeId: deps.storeId, visitorId: visitor, input });
    return json({ ok: true, status: r.status, next: nextHref(langOf(lang), r.next, r.number) });
  } catch (e) {
    return refusal(e);
  }
}

/** The gateway's callback answered: the thank-you page once paid, the payment page otherwise (it shows the state). */
export const callbackNext = (lang: ShopLang, status: string | null, number: string): string => hrefIn(lang, status === 'PAID' ? ROUTES.thanks(number) : ROUTES.checkoutPay(number));

/**
 * POST /api/checkout/transit {phone, campaign?} — S06 · PR 556: the phone check of the in-transit duplicate notice (off
 * until the owner turns `checkout.transitDuplicate` on). The bag is this browser's own (the cookie), the customer this
 * browser, its device id and a signed-in account; the answer names the bag lines already on their way, with the earlier
 * order's number and link only for an order tied to them. A refused or failed check answers no notices: it never stops
 * the form.
 */
export async function transitHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = await body(request);
    const [{ visitor, cartId }, customerId] = await Promise.all([bagOfRequest(request, deps), customerOf(request, deps)]);
    const device = readCookie(request, DEVICE_COOKIE);
    const r = await transitDuplicateCheck(
      { db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now },
      { storeId: deps.storeId, cartId, visitorId: visitor, deviceId: device && visitorIdSchema.safeParse(device).success ? device : null, customerId, ip: requestContext(request).ip ?? null },
      b,
    );
    return json({ ok: true, ...r });
  } catch (e) {
    if (isOrdersError(e)) return fail(e.status, e.code, e.details);
    console.warn(`transit check: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return json({ ok: true, enabled: true, notices: [] });
  }
}

/**
 * POST /api/checkout/phone-risk {phone} — S06 · PR 559: the phone-entry risk check (off until the owner turns
 * `checkout.phoneRisk` on). The server asks the connected courier fraud checks in the background and keeps their answers
 * for the checkout's own look; the page reads nothing from the answer, which is always the same `{ok: true}` — nothing
 * about the number, a score or a reason ever goes back. A failure is logged and passes.
 */
export async function phoneRiskHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    // PR 567: the connected checks are looked up only while the owner keeps the check on
    const on = (await deps.checkout.settings.value('checkout.phoneRisk', { storeId: deps.storeId })).enabled;
    const sources = on && deps.fraudSources ? await deps.fraudSources(deps.storeId) : [];
    await phoneRiskCheck({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, { storeId: deps.storeId, ip: requestContext(request).ip ?? null }, await body(request), sources);
  } catch (e) {
    if (isOrdersError(e) && e.code === 'INVALID_INPUT') return fail(e.status, e.code, e.details);
    console.warn(`phone-risk check: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
  return json({ ok: true });
}

/** POST /api/checkout/transit/answer {eventId, action: 'removed' | 'kept'} — PR 556: what he chose on the notice (kept once). */
export async function transitAnswerHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const r = await transitDuplicateAnswer({ db: deps.checkout.db, settings: deps.checkout.settings, now: deps.checkout.now }, deps.storeId, await body(request));
    return json({ ok: true, ...r });
  } catch (e) {
    if (isOrdersError(e)) return fail(e.status, e.code, e.details);
    return errorResponse(e);
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

/**
 * POST /api/checkout/call-me — CN-020 (3), SIM-F-046: the customer who got stuck taps "Call me"; a call-back lands in
 * the Support inbox from his number (the store's `checkout.callMe` switch; off: CALLBACK_OFF). Needs the bag cookie (the
 * same tap twice is one call-back). Nothing changes an order and nothing is sent to him.
 */
export async function callMeHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const b = (await body(request)) as Record<string, unknown>;
    const { visitor } = await bagOfRequest(request, deps);
    if (!visitor) return fail(400, 'NO_BAG');
    const phone = phoneNormalizeBD(typeof b.phone === 'string' ? b.phone : '');
    if (!phone.ok) return fail(400, 'INVALID_INPUT', ['phone']);
    const r = await requestCallBack(
      { db: deps.checkout.db, settings: deps.checkout.settings },
      {
        storeId: deps.storeId,
        phone: phone.e164,
        ...(typeof b.name === 'string' && b.name.trim() ? { name: b.name.trim().slice(0, 120) } : {}),
        reason: b.reason === 'idle' ? 'idle' : 'tries',
        ...(typeof b.field === 'string' ? { field: (['name', 'phone', 'address'] as const).find((f) => f === b.field) ?? 'other' } : {}),
        visitorId: visitor,
        lang: langOf(b.lang),
      },
    );
    return json({ ok: true, duplicate: r.duplicate });
  } catch (e) {
    // switched off meanwhile, or already asked today: calm states of the shop (200, as PR 610's pause), not failures
    if (isSupportError(e)) return json({ ok: false, error: e.code }, { status: e.code === 'CALLBACK_OFF' || e.code === 'TOO_MANY' ? 200 : e.status });
    return refusal(e);
  }
}

const KB = 1024;
/** The form fields beside the recording (a few short words). */
const FORM_OVERHEAD = 16 * KB;

/**
 * POST /api/checkout/voice — CN-020 (4), SIM-F-047: one recording from the address box's mic (multipart: `audio`, and
 * `transcript` with `confidence` when the phone read it itself; `durationMs`). Saved for this browser's bag; the words
 * come back for the box, and whether the reading was unsure. Off as shipped: a calm `NOT_OPEN` (200). Same site only,
 * at most the owner's `maxKb`.
 */
export async function voiceHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  try {
    const cfg = await deps.checkout.settings.value('checkout.voice', { storeId: deps.storeId });
    if (!cfg.enabled) return json({ ok: false, error: 'NOT_OPEN' });
    if (Number(request.headers.get('content-length') ?? '0') > cfg.maxKb * KB + FORM_OVERHEAD) return fail(413, 'TOO_LARGE', [`max:${cfg.maxKb}`]);
    const { visitor } = await bagOfRequest(request, deps);
    if (!visitor) return fail(400, 'NO_BAG');
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, 'INVALID_INPUT', ['audio']);
    }
    const text = (k: string) => {
      const v = form.get(k);
      return typeof v === 'string' && v.trim() ? v.trim() : undefined;
    };
    const num = (k: string) => {
      const v = Number(text(k));
      return text(k) !== undefined && Number.isFinite(v) ? v : undefined;
    };
    const file = form.get('audio');
    const audio = file instanceof File && file.size > 0 ? { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type || 'application/octet-stream' } : undefined;
    const confidence = num('confidence');
    const durationMs = num('durationMs');
    const r = await saveVoiceAddress(deps.checkout, deps.voice?.() ?? null, {
      storeId: deps.storeId,
      visitorId: visitor,
      ...(text('transcript') ? { transcript: text('transcript') } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
      ...(audio ? { audio } : {}),
    });
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof CheckoutError && e.code === 'NOT_OPEN') return json({ ok: false, error: e.code });
    return refusal(e);
  }
}
