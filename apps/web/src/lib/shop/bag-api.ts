// PR 105–112 — the bag's public API (no sign-in: the bag belongs to the browser's random visitor id). Every write is
// same-site only and small; the answer carries the new piece count and refreshes both cookies (the visitor id for
// `bag.keepDays`, the badge number). Prices are never taken from the browser: the page reads them again from the
// engines after every change. Refusals are the engine's stable codes (OUT_OF_STOCK, TOO_MANY …) for the shop's words.
// PR 91: a whole set goes in (and is changed) through `/api/bag/sets`; a combo page's counts and prices through
// `/api/shop/combo`. PR 98: a set the customer built ("Build your own set") through `/api/bag/built-sets`.
import { randomBytes } from 'node:crypto';
import {
  addItem,
  bagCount,
  buyAgain,
  CartError,
  changeVariant,
  findBag,
  openBag,
  removeLine,
  restoreBag,
  restoreLine,
  saveForLater,
  setBagCode,
  setQuantity,
  setSizeAnswer,
  visitorIdSchema,
  type CartDeps,
} from '@extas/cart';
import { addBuiltSetToBag, addSetToBag, changeSetInBag, priceCell, priceSet, productFacts, recordColourPick, recordComboView, setSummary, type SlotChoice } from '@extas/combos';
import { body, errorResponse, fail, isUuid, json, readCookie, sameOrigin } from '../admin-auth';
import { BAG_COOKIE, bagCookie, COUNT_COOKIE } from './bag-model';
import { trackAddToBag } from '../tracking/shop';
import { BN_PREFIX } from './lang';
import { BOT } from '../experiments/edge';

/** The largest request body the bag takes (a code, an id, a number). */
export const BAG_BODY_MAX = 2_048;

export interface BagApiDeps {
  cart: CartDeps;
  storeId: number;
}

const newVisitorId = () => randomBytes(24).toString('base64url');

async function guard(request: Request, deps: BagApiDeps | null, methods: readonly string[]): Promise<Response | null> {
  if (!methods.includes(request.method.toUpperCase())) return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > BAG_BODY_MAX) return fail(413, 'TOO_LARGE');
  return null;
}

/** The visitor's open bag: made on the first add (`create`), otherwise only found. */
async function bagOf(request: Request, d: BagApiDeps, create: boolean): Promise<{ cartId: string; visitor: string } | null> {
  const sent = readCookie(request, BAG_COOKIE);
  const known = sent && visitorIdSchema.safeParse(sent).success ? sent : null;
  if (!create) {
    if (!known) return null;
    const cartId = await findBag(d.cart, { storeId: d.storeId, visitorId: known });
    return cartId ? { cartId, visitor: known } : null;
  }
  const visitor = known ?? newVisitorId();
  const { cartId } = await openBag(d.cart, { storeId: d.storeId, visitorId: visitor });
  return { cartId, visitor };
}

/** The answer to a write: its body plus the piece count, with both cookies set again. */
async function answer(d: BagApiDeps, bag: { cartId: string; visitor: string }, payload: Record<string, unknown>, status = 200): Promise<Response> {
  const [count, days] = await Promise.all([bagCount(d.cart.db, d.storeId, bag.cartId), d.cart.settings.value('bag.keepDays', { storeId: d.storeId })]);
  const headers = new Headers();
  headers.append('set-cookie', bagCookie(BAG_COOKIE, bag.visitor, days));
  headers.append('set-cookie', bagCookie(COUNT_COOKIE, String(count), days));
  return json({ ok: true, count, ...payload }, { status, headers });
}

function refusal(e: unknown): Response {
  if (e instanceof CartError) return fail(e.status, e.code, e.details);
  return errorResponse(e);
}

const noBag = () => fail(404, 'NOT_FOUND', ['cartId']);

/** POST /api/bag/lines — puts an item (one variant) in the bag; makes the bag on the first add. */
export async function addLineHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  const stop = await guard(request, deps, ['POST']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const b = await body(request);
    const bag = (await bagOf(request, deps, true))!;
    const quantity = (b.quantity as number | undefined) ?? 1;
    const r = await addItem(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, variantId: b.variantId as string, quantity, source: (b.source as string | undefined) || undefined });
    // PR 257: the ad platforms hear of it from the server while tracking is on (quiet, never stops the add)
    if (r.added) await trackAddToBag(request, { storeId: deps.storeId, lineId: r.lineId, quantity });
    return answer(deps, bag, { ...r }, r.added ? 201 : 200);
  } catch (e) {
    return refusal(e);
  }
}

/** PATCH /api/bag/lines/:id — one change: `quantity`, `variantId` (colour or size) or `saved` (save for later / back). */
export async function patchLineHandler(request: Request, deps: BagApiDeps | null, lineId: string): Promise<Response> {
  const stop = await guard(request, deps, ['PATCH']);
  if (stop || !deps) return stop ?? noBag();
  if (!isUuid(lineId)) return fail(400, 'INVALID_INPUT', ['lineId']);
  try {
    const b = await body(request);
    const bag = await bagOf(request, deps, false);
    if (!bag) return noBag();
    const ref = { storeId: deps.storeId, cartId: bag.cartId, lineId };
    const asked = ['quantity', 'variantId', 'saved'].filter((k) => k in b);
    if (asked.length !== 1) return fail(400, 'INVALID_INPUT', ['one of quantity, variantId, saved']);
    if ('quantity' in b) return answer(deps, bag, await setQuantity(deps.cart, { ...ref, quantity: b.quantity as number }));
    if ('variantId' in b) return answer(deps, bag, await changeVariant(deps.cart, { ...ref, variantId: b.variantId as string }));
    return answer(deps, bag, await saveForLater(deps.cart, { ...ref, saved: b.saved as boolean }));
  } catch (e) {
    return refusal(e);
  }
}

/** DELETE /api/bag/lines/:id — takes a line out (archived; a set goes whole). Undo is the restore route. */
export async function deleteLineHandler(request: Request, deps: BagApiDeps | null, lineId: string): Promise<Response> {
  const stop = await guard(request, deps, ['DELETE']);
  if (stop || !deps) return stop ?? noBag();
  if (!isUuid(lineId)) return fail(400, 'INVALID_INPUT', ['lineId']);
  try {
    const bag = await bagOf(request, deps, false);
    if (!bag) return noBag();
    return answer(deps, bag, await removeLine(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, lineId }));
  } catch (e) {
    return refusal(e);
  }
}

/** POST /api/bag/lines/:id/restore — "Undo": the line taken out comes back (when the stock still allows it). */
export async function restoreLineHandler(request: Request, deps: BagApiDeps | null, lineId: string): Promise<Response> {
  const stop = await guard(request, deps, ['POST']);
  if (stop || !deps) return stop ?? noBag();
  if (!isUuid(lineId)) return fail(400, 'INVALID_INPUT', ['lineId']);
  try {
    const bag = await bagOf(request, deps, false);
    if (!bag) return noBag();
    return answer(deps, bag, await restoreLine(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, lineId }));
  } catch (e) {
    return refusal(e);
  }
}

/** PUT /api/bag/sizes — PR 110: the answer to a "same product in two sizes" card (`answer: null` takes it back). */
export async function sizeAnswerHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  const stop = await guard(request, deps, ['PUT']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const b = await body(request);
    const bag = await bagOf(request, deps, false);
    if (!bag) return noBag();
    const answers = await setSizeAnswer(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, key: b.key as string, answer: (b.answer ?? null) as 'other' });
    return answer(deps, bag, { answers });
  } catch (e) {
    return refusal(e);
  }
}

/** POST / DELETE /api/bag/code — PR 112: keeps a typed code on the bag or takes it off. Whether it works is the page's. */
export async function codeHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  const stop = await guard(request, deps, ['POST', 'DELETE']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const remove = request.method.toUpperCase() === 'DELETE';
    const code = remove ? null : (await body(request)).code;
    const bag = await bagOf(request, deps, false);
    if (!bag) return noBag();
    return answer(deps, bag, await setBagCode(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, code: code as string | null }));
  } catch (e) {
    return refusal(e);
  }
}

/**
 * POST /api/bag/sets — PR 91: puts a set in the bag (one locked-price set, `addSetToBag`; makes the bag on the first
 * add; the page's `addKey` makes a resent tap the same add). PATCH — PR 95: changes the colours or sizes of a set already
 * in the bag (`changeSetInBag`, re-checked and re-priced). PR 573: a POST with `replaceGroupKey` puts another combo in
 * that set's place (a pair page's colour change while editing, the bag's "Add 1 more"). The set price is the engine's,
 * never the browser's.
 */
export async function setHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  const stop = await guard(request, deps, ['POST', 'PATCH']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const b = await body(request);
    const choices = b.choices as SlotChoice[];
    if (request.method.toUpperCase() === 'PATCH') {
      const bag = await bagOf(request, deps, false);
      if (!bag) return noBag();
      const r = await changeSetInBag(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, groupKey: b.groupKey as string, choices });
      return answer(deps, bag, { groupKey: r.groupKey, lineId: r.lines[0]?.id ?? null, setPriceMinor: r.setPriceMinor });
    }
    const bag = (await bagOf(request, deps, true))!;
    const replaceGroupKey = (b.replaceGroupKey as string | undefined) || undefined;
    const r = await addSetToBag(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, slug: b.slug as string, choices, addKey: (b.addKey as string | undefined) || undefined, replaceGroupKey });
    return answer(deps, bag, { added: r.added, groupKey: r.groupKey, lineId: r.lines[0]?.id ?? null, setPriceMinor: r.setPriceMinor }, r.added ? 201 : 200);
  } catch (e) {
    return refusal(e);
  }
}

/**
 * POST /api/bag/reorder — PR 622 (CN-034) "Buy again" ({number}): the past order's lines back in this browser's bag at
 * today's price and stock, for the signed-in customer whose order it is or the browser that placed it (`customerId`
 * is read from his sign-in cookie by the route). Answers what went in, what is sold out (with the sizes in stock) and
 * what is no longer sold; refuses NOT_FOUND (not his) and NOT_OFFERED (`account.reorder` off or not on this state).
 */
export async function reorderHandler(request: Request, deps: BagApiDeps | null, customerId: string | null): Promise<Response> {
  const stop = await guard(request, deps, ['POST']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const b = await body(request);
    if (typeof b.number !== 'string' || !b.number.trim() || b.number.length > 40) return fail(400, 'INVALID_INPUT', ['number']);
    const sent = readCookie(request, BAG_COOKIE);
    const known = sent && visitorIdSchema.safeParse(sent).success ? sent : null;
    // nobody to own the order: no sign-in and no bag cookie (nothing is made for him)
    if (!known && !customerId) return fail(404, 'NOT_FOUND', ['number']);
    const bag = (await bagOf(request, deps, true))!;
    const r = await buyAgain(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, number: b.number.trim(), visitorId: known, customerId });
    return answer(deps, bag, { reorder: r }, r.pieces > 0 ? 201 : 200);
  } catch (e) {
    return refusal(e);
  }
}

/**
 * POST /api/bag/built-sets — PR 98, 100: puts a set the customer built into the bag ({ruleId, picks, addKey}): one tap
 * one add, checked again against live stock and the bag, the pieces priced by the bag's own set tier rules (never by
 * the browser).
 */
export async function builtSetHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  const stop = await guard(request, deps, ['POST']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const b = await body(request);
    const bag = (await bagOf(request, deps, true))!;
    const r = await addBuiltSetToBag(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, ruleId: b.ruleId as string, picks: b.picks as string[], addKey: (b.addKey as string | undefined) || undefined });
    return answer(deps, bag, { added: r.added, pieces: r.pieces, lineId: r.lineIds[0] ?? null, payMinor: r.payMinor }, r.added ? 201 : 200);
  } catch (e) {
    return refusal(e);
  }
}

/**
 * POST /api/shop/combo — PR 91–95: what a combo page tells the shop. `view` (the page was opened) and `pick` (a full
 * set of colours was picked) count for the combo report (PR 104); `price` prices the exact picks with the one price
 * rule when the page carries no price table (too many price mixes). Nothing here changes a bag.
 */
export async function comboEventHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  const stop = await guard(request, deps, ['POST']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const b = await body(request);
    const ref = { storeId: deps.storeId, comboId: b.comboId as string };
    if (b.event === 'view') {
      await recordComboView(deps.cart, ref);
      return json({ ok: true });
    }
    if (b.event === 'pick') {
      await recordColourPick(deps.cart, { ...ref, colourIds: b.colourIds as (string | null)[] });
      return json({ ok: true });
    }
    if (b.event === 'price') {
      const bag = await bagOf(request, deps, false);
      const r = await priceSet(deps.cart, {
        storeId: deps.storeId,
        comboId: ref.comboId,
        choices: b.choices as SlotChoice[],
        ...(bag ? { cartId: bag.cartId } : {}),
        ...(typeof b.editGroupKey === 'string' ? { editGroupKey: b.editGroupKey } : {}),
      });
      return json({ ok: true, price: r.price ? priceCell(r.price) : null });
    }
    return fail(400, 'INVALID_INPUT', ['event']);
  } catch (e) {
    return refusal(e);
  }
}

/** The test pages and the sample-bag fill exist only when the server says so (never on the live shop). */
export const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/**
 * POST /api/bag/try — test servers only (EXTAS_SHOP_TEST_PAGES=1): fills this browser's bag with sample items the way
 * a customer would (two neighbouring sizes of one product, one other product, and a running set when there is one),
 * so the device gate, the smoke test and the screenshots see a bag with lines. Uses the shop's own add functions.
 * PR 574: `?sets=N` (at most TRY_SETS_MAX) puts the first N running sets in, so the bag templates' compact rows (B5,
 * from `combos.bag.compactFrom` sets) and "Add 1 more" (B3, a polo pair) are seen too.
 */
export const TRY_SETS_MAX = 6; // hardcode-ok: test-server fill only (EXTAS_SHOP_TEST_PAGES), not a shop limit
export async function tryFillHandler(request: Request, deps: BagApiDeps | null): Promise<Response> {
  if (!testPagesOn()) return fail(404, 'not-found');
  const stop = await guard(request, deps, ['POST']);
  if (stop || !deps) return stop ?? noBag();
  try {
    const bag = (await bagOf(request, deps, true))!;
    const db = deps.cart.db;
    const products = await db.product.findMany({ where: { storeId: deps.storeId, status: 'PUBLISHED', archivedAt: null }, orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }], select: { id: true }, take: 40 });
    const facts = await productFacts(deps.cart, deps.storeId, products.map((p) => p.id));
    const picks: string[] = [];
    for (const p of facts.values()) {
      const sizes = [...p.sizes].sort((a, b) => a.order - b.order);
      for (const c of p.colours) {
        const open = sizes.map((s) => p.variants.find((v) => v.colourId === c.id && v.sizeId === s.id && v.sellable > 1 && v.priceMinor !== null));
        const i = open.findIndex((v, n) => v && open[n + 1]);
        if (i >= 0 && picks.length === 0) picks.push(open[i]!.id, open[i + 1]!.id);
      }
      if (picks.length) break;
    }
    const first = picks.length ? [...facts.values()].find((p) => p.variants.some((v) => v.id === picks[0]))?.id : null;
    const other = [...facts.values()].find((p) => p.id !== first && p.variants.some((v) => v.sellable > 1 && v.priceMinor !== null));
    const otherVariant = other?.variants.find((v) => v.sellable > 1 && v.priceMinor !== null);
    if (otherVariant) picks.push(otherVariant.id);
    for (const variantId of picks) await addItem(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, variantId, source: 'try' }).catch(() => null);
    const wanted = Math.min(TRY_SETS_MAX, Math.max(1, Number(new URL(request.url).searchParams.get('sets')) || 1));
    const combos = await db.combo.findMany({ where: { storeId: deps.storeId, status: 'RUNNING', archivedAt: null }, orderBy: [{ sortRank: 'desc' }, { slug: 'asc' }], select: { slug: true }, take: wanted * 4 });
    let sets = 0;
    for (const combo of combos) {
      if (sets >= wanted) break;
      const sum = await setSummary(deps.cart, { storeId: deps.storeId, slug: combo.slug }).catch(() => null);
      const choices = sum?.pieces.map((p) => ({ colourId: p.defaultColourId, sizeId: (p.defaultColourId && p.openSizes[p.defaultColourId]?.[0]) || null }));
      if (choices?.every((c) => c.sizeId) && (await addSetToBag(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, slug: combo.slug, choices }).catch(() => null))) sets += 1;
    }
    return answer(deps, bag, { filled: picks.length });
  } catch (e) {
    return refusal(e);
  }
}

/** PR 275 — the follow-up link's code (CheckoutDraft.restoreCode): URL-safe, never long. */
const RESTORE_CODE = /^[A-Za-z0-9_-]{8,40}$/;

/** Follow-up 641: a robot fetching a link (a chat app's preview, a crawler), not a person's browser. */
export function isLinkRobot(ua: string | null | undefined): boolean {
  const u = ua ?? '';
  if (!u.trim()) return true;
  if (/^Mozilla\//.test(u) && /whatsapp|FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(u) && !/facebookexternalhit/i.test(u)) return false;
  return BOT.test(u);
}

/**
 * GET /api/bag/back/<code> — PR 275: the link in an unfinished checkout's follow-up (PR 276: or in a signed-in customer's
 * left-bag recovery message, Cart.restoreCode). Puts that checkout's bag (every
 * line still in it, at today's price and stock) into this browser's bag — the same browser's own bag needs nothing,
 * a second tap adds nothing — and, when the offer with a code went to him, puts the code on the bag; then opens the bag
 * in the message's language (`?l=en`, else Bengali). An unknown or finished checkout just opens the bag. Nothing is
 * ordered and nobody else's details are shown: the link carries only the bag.
 */
export async function bagBackHandler(request: Request, deps: BagApiDeps | null, code: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const lang = new URL(request.url).searchParams.get('l') === 'en' ? 'en' : 'bn';
  const go = (headers = new Headers()) => {
    headers.set('location', `${lang === 'bn' ? BN_PREFIX : ''}/bag`);
    headers.set('cache-control', 'no-store');
    headers.set('x-robots-tag', 'noindex');
    return new Response(null, { status: 303, headers });
  };
  if (!deps || !RESTORE_CODE.test(code)) return go();
  // Follow-up 641 (PR 275, 276): a chat app's link preview robot opening the link makes no bag and keeps no code (it
  // only follows to /bag); the customer's own tap does. An app's own browser (Mozilla/… with WhatsApp, Facebook or
  // Instagram in it) is a person, not the robot.
  if (isLinkRobot(request.headers.get('user-agent'))) return go();
  try {
    const d = await deps.cart.db.checkoutDraft.findFirst({ where: { storeId: deps.storeId, restoreCode: code }, select: { id: true, cartId: true, convertedOrderId: true } });
    // PR 276: or a signed-in customer's left bag (its recovery message's link), while that bag is still open
    const left = d ? null : await deps.cart.db.cart.findFirst({ where: { storeId: deps.storeId, restoreCode: code, status: 'ACTIVE' }, select: { id: true } });
    const from = d ? (d.convertedOrderId ? null : d.cartId) : (left?.id ?? null);
    if (!from) return go();
    const bag = (await bagOf(request, deps, true))!;
    await restoreBag(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, fromCartId: from }).catch((e: unknown) => {
      if (!(e instanceof CartError)) throw e;
    });
    const offer = await deps.cart.db.recoveryMessage.findFirst({ where: { storeId: deps.storeId, ...(d ? { checkoutDraftId: d.id } : { cartId: from, kind: 'CART' }), offerCouponId: { not: null }, sentAt: { not: null } }, orderBy: { sentAt: 'desc' }, select: { offerCouponId: true } });
    const coupon = offer?.offerCouponId ? await deps.cart.db.coupon.findFirst({ where: { id: offer.offerCouponId, storeId: deps.storeId, enabled: true }, select: { code: true } }) : null;
    if (coupon) await setBagCode(deps.cart, { storeId: deps.storeId, cartId: bag.cartId, code: coupon.code });
    const [count, days] = await Promise.all([bagCount(deps.cart.db, deps.storeId, bag.cartId), deps.cart.settings.value('bag.keepDays', { storeId: deps.storeId })]);
    const headers = new Headers();
    headers.append('set-cookie', bagCookie(BAG_COOKIE, bag.visitor, days));
    headers.append('set-cookie', bagCookie(COUNT_COOKIE, String(count), days));
    return go(headers);
  } catch {
    // the link never shows an error page: the bag opens as it is
    return go();
  }
}
