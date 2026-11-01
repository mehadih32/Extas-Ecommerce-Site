// PR 125 — placing the order (demo 51-checkout.js SUBMIT['co-place'], 02-core.js placeOrder), idempotent, with the
// failure path. The order stores exactly what the page showed (SIM-F-003): the page sends the fingerprint of the money
// it showed, the server prices the bag again with the same function and the same choices (checkoutQuote), and refuses
// with PRICE_CHANGED (and the checkout as it is now) when anything moved; the zone, band and charge come from that one
// read — never a second reading of the address text. An address nothing settles still becomes an order: flagged
// "address unclear", the charge not fixed, and a call task for the team (PR 563); a band with no charge yet likewise.
// PR 563 also never holds an order over an address: it is placed like any other (PLACED, confirmable), and a line that
// says nowhere where the house is (a landmark only, SIM-F-030: `checkout.address.check`) gets the "address check" flag
// and the same call task, so the confirmation call asks for directions. One call task per order, the weightiest reason.
// PR 565: where delivery is free none of the band machinery applies — no Inside/Outside flag or call over the band,
// the order marked `bandExempt` so no later band correction or band message touches it (@extas/delivery bandExempt).
// PR 561: the phone number goes with the address read (the silent backfill); what he typed is stored as he typed it,
// and the full address the shop holds goes in `backfilledAddress`, for packing (the ERP push already prefers it).
//
// One press = one order: the page makes an order key once and sends it with every retry (a slow network, a double
// tap). The key is claimed inside the order's own transaction, so a lost answer or a second press finds the order
// already placed and gets it back, never a second one. Everything is one transaction: the stock hold and its
// conversion (S09), the order number under the store's lock, the order and its lines, the bag closed, the wallet
// debited under its row lock, the consent records, the dated event, and — for a prepaid order — its payment, waiting.
//
// SIM-F-026: the failure path. A prepaid order's payment runs on the mock until the gateways of S07 are connected
// (A1.3): a failed payment is kept (FAILED, flagged on the order, a call task), and "Try again" makes a new payment for
// the same order — still one order. PR 165: the answer is written by the payments service's one outcome writer
// (@extas/payments applyOutcome), the same one a real gateway's callback uses. With the owner's switch on, what a customer typed and left is kept as a checkout
// draft for the team's follow-up (PR 274/275), and marked converted when he orders.
//
// PR 129: the order belongs to an account in the same transaction — the signed-in customer, else the customer with the
// order's phone number, else a new one made now (`account.autoCreate.enabled`), never with a password (SIM-F-039,
// @extas/accounts identity.ts). The placed event says which (`data.account`), for the thank-you page's account card.
//
// PR 605 — a gift (`checkout.gift` on, the page sent `gift`): the name, phone and address are the RECEIVER's and go on
// the order like any order's (the sticker, the booking and the courier read them, @extas/orders deliveryTarget); the
// sender's name and contact, the gift note, "deliver on or after" and "hide prices" are stored beside them. A gift makes
// no account for the receiver: only a signed-in sender's account gets the order. With the whole amount ahead the quote
// offers no Cash on Delivery; with a part ahead the order is flagged GIFT_ADVANCE, keeps that part in
// `advanceRequiredMinor` and asks the team to call for it (until S07's part payment).
import { createHash, randomBytes } from 'node:crypto';
import { linkOrderAccount } from '@extas/accounts';
import { applyOutcome, PAYMENT_CALL_REASON, PAYMENT_EVENTS, PAYMENT_FLAGS } from '@extas/payments';
import { findBag } from '@extas/cart';
import { redeemCoupon, RulesError } from '@extas/rules';
import type { Prisma } from '@extas/db/client';
import { hasAddressDetail } from '@extas/delivery';
import { convertCart, erpCheckoutPaused, holdCart, InventoryError, type InventoryDeps } from '@extas/inventory';
import { z } from 'zod';
import { addressInputSchema } from './address';
import { attributionData, type OrderAttribution } from './attribution';
import { ADVANCE_PURPOSE, CHECKOUT_PAY_PURPOSES, FLAG_OUTCOMES } from './advance';
import { consentInputSchema, consentOf, consentSettings, recordConsent } from './consent';
import { CheckoutError, checkStoreId, nowOf, parse, setting, TX, type CheckoutDeps, type Db, type Tx } from './context';
import { checkGift, storeToday } from './gift';
import { paymentInputSchema, isPrepaid, type PaymentChoice } from './payment';
import { checkForm, fieldOrder, phoneNormalizeBD, type FieldProblem } from './pure';
import { checkoutQuote, viewOf, WALLET_ACTIVE, type CheckoutQuote } from './quote';
import { isLow } from './voice';

const TEXT_MAX = 2_000;

/** The method an order and its payment are stored with (the database's own list). */
export type PaymentMethod = NonNullable<Prisma.OrderUncheckedCreateInput['paymentMethod']>;

/** PR 605: the gift card (checked by gift.ts checkGift, the same rules as the page). */
export const giftInputSchema = z
  .object({
    senderName: z.string().max(TEXT_MAX),
    senderContact: z.string().max(TEXT_MAX),
    note: z.string().max(TEXT_MAX).nullable().optional(),
    deliverAfter: z.string().max(20).nullable().optional(),
    hidePrices: z.boolean().optional(),
  })
  .strict();

/** What the page sends when the customer presses Confirm. */
export const placeInputSchema = z
  .object({
    /** Made once by the page and sent with every retry of the same order. */
    idempotencyKey: z.uuid(),
    lang: z.enum(['en', 'bn']).default('en'),
    form: z.object({ name: z.string().max(TEXT_MAX), phone: z.string().max(TEXT_MAX), address: z.string().max(TEXT_MAX) }).strict(),
    /** The band (and place) he picked when the page asked (PR 118). */
    confirmed: addressInputSchema.shape.confirmed,
    payment: paymentInputSchema.nullable().optional(),
    useWallet: z.boolean().optional(),
    consent: consentInputSchema.nullable().optional(),
    note: z.string().max(TEXT_MAX).nullable().optional(),
    /** PR 605: the order is a gift (ignored while gift mode is off). */
    gift: giftInputSchema.nullable().optional(),
    /** PR 159: the point the customer shared by tapping "Share my location" (kept rounded, only while the owner's button is on). */
    gps: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().nullable().optional(),
    /** CN-020 (4): the address was spoken into the mic (the recording saved by POST /api/checkout/voice). */
    voice: z.object({ id: z.uuid() }).strict().nullable().optional(),
    /** The fingerprint of the money the page showed (CheckoutView.fingerprint). */
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type PlaceInput = z.input<typeof placeInputSchema>;

export interface PlaceRequest {
  storeId: number;
  /** The browser's random visitor id (the bag cookie): the order belongs to it (the thank-you page, the pay page). */
  visitorId: string;
  /** The signed-in customer (PR 130); null for a guest. */
  customerId?: string | null;
  ip?: string | null;
  /** PR 159: the shop's own random device id (a first-party cookie the API keeps); never a fingerprint. */
  deviceId?: string | null;
  /** PR 257 follow-up: the campaign tags of the visit the shop read from its own cookie (`ads.attribution`); checked again here. */
  attribution?: Partial<OrderAttribution> | null;
  input: unknown;
}

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

/** PR 159: a coordinate kept only as finely as the owner allows (`risk.capture.gpsDecimals`). */
export function roundPoint(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * PR 159 (Blueprint B6.4, BACKEND-ARCHITECTURE §8.7): what this order keeps for the risk checks, by the owner's
 * `risk.capture`: the connection (IP), the device id, and the shared point (never for a gift — the buyer is not where the
 * parcel goes), each only while its switch is on, all with the day they are cleared (`piiExpiresAt`).
 */
export function captureOf(cap: { ip: boolean; device: boolean; gpsButton: boolean; gpsDecimals: number; retentionDays: number }, sent: { ip?: string | null; deviceId?: string | null; gps?: { lat: number; lng: number } | null; gift: boolean }, now: Date) {
  const ip = cap.ip && sent.ip ? sent.ip : null;
  const deviceId = cap.device && sent.deviceId && DEVICE_ID.test(sent.deviceId) ? sent.deviceId.toLowerCase() : null;
  const point = cap.gpsButton && sent.gps && !sent.gift ? { lat: roundPoint(sent.gps.lat, cap.gpsDecimals), lng: roundPoint(sent.gps.lng, cap.gpsDecimals) } : null;
  const piiExpiresAt = ip || deviceId || point ? new Date(now.getTime() + cap.retentionDays * DAY_MS) : null;
  return { ip, deviceId, gpsLat: point?.lat ?? null, gpsLng: point?.lng ?? null, piiExpiresAt };
}

/** Where the page goes next: the payment (a prepaid order with something to pay) or the thank-you page. */
export type PlaceNext = 'pay' | 'thanks';

export interface PlaceResult {
  orderId: string;
  number: string;
  next: PlaceNext;
  /** The order was placed before with this key (a second press, a retry after a lost answer). */
  replay: boolean;
}

/** The order's flags the team's screens read (PR 563 address queue, the payment follow-up). */
export const ORDER_FLAGS = {
  addressUnclear: 'ADDRESS_UNCLEAR',
  chargeNotSet: 'CHARGE_NOT_SET',
  addressCheck: 'ADDRESS_CHECK',
  paymentPending: PAYMENT_FLAGS.pending,
  paymentFailed: PAYMENT_FLAGS.failed,
  giftAdvance: 'GIFT_ADVANCE',
  /** PR 193: an Eid pre-order — placed past its place's order-by date with the owner's pre-order on; ships after Eid. */
  preorder: 'EID_PREORDER',
  /** CN-020 (4): the address was spoken into the checkout's mic; the recording is kept with the order. */
  voiceEntered: 'VOICE_ENTERED',
  /** CN-020 (4): the voice reading was unsure (or nothing was heard): "voice — please call". */
  voiceCall: 'VOICE_CALL',
} as const;
/** Why the team calls (CallTask.reason). */
export const CALL_REASONS = { addressUnclear: 'ADDRESS_UNCLEAR', chargeNotSet: 'CHARGE_NOT_SET', addressCheck: 'ADDRESS_CHECK', paymentFailed: PAYMENT_CALL_REASON, giftAdvance: 'GIFT_ADVANCE', voiceCall: 'VOICE_CALL' } as const;
/** What the order's events are called (the payment's own are the payments service's). */
export const ORDER_EVENTS = { placed: 'order.placed', paid: PAYMENT_EVENTS.paid, failed: PAYMENT_EVENTS.failed, retry: PAYMENT_EVENTS.retry } as const;
/** Where the order came from (OrderEvent.source, ConsentRecord.source). */
export const CHECKOUT_SOURCE = 'checkout';
/** A prepaid payment runs on the mock until the gateways of S07 (PR 167–169) are connected. */
export const MOCK_PROVIDER = 'mock';

const scopeOf = (storeId: number) => `checkout.place:${storeId}`;
const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** The method the order and its payment are stored with. */
export function paymentMethodOf(c: PaymentChoice | null, dueMinor: number): PaymentMethod {
  if (!c || dueMinor <= 0) return c?.method === 'cod' ? 'COD' : 'WALLET';
  switch (c.method) {
    case 'cod':
      return 'COD';
    case 'online':
      return 'ONLINE';
    case 'card':
      return c.option === 'bank' ? 'BANK_TRANSFER' : 'CARD';
    case 'mobile':
      return c.option === 'nagad' ? 'NAGAD' : c.option === 'rocket' ? 'ROCKET' : c.option === 'upay' ? 'UPAY' : 'BKASH';
  }
}

/** The order lines from the priced bag: loose items at their quote; a set's pieces at their own price, the set's saving split over them. */
export function orderLinesOf(
  q: Pick<CheckoutQuote, 'bag'>,
  cartLines: readonly { id: string; variantId: string; quantity: number; unitPriceMinor: number; comboId: string | null; comboGroupKey: string | null; source: string | null }[],
): { lineId: string; variantId: string; productId: string | null; nameEn: string; colourEn: string | null; size: string | null; quantity: number; unitPriceMinor: number; discountMinor: number; lineTotalMinor: number; comboId: string | null; comboGroupKey: string | null; source: string | null }[] {
  const byId = new Map(cartLines.map((l) => [l.id, l]));
  const out: ReturnType<typeof orderLinesOf> = [];
  for (const i of q.bag.items) {
    const own = byId.get(i.lineId);
    const regular = i.unitPriceMinor * i.quantity;
    out.push({
      lineId: i.lineId,
      variantId: i.variantId,
      productId: i.productId,
      nameEn: i.nameEn,
      colourEn: i.colour?.nameEn ?? null,
      size: i.size?.label ?? null,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      discountMinor: Math.max(0, regular - i.lineMinor),
      lineTotalMinor: i.lineMinor,
      comboId: null,
      comboGroupKey: null,
      source: own?.source ?? null,
    });
  }
  for (const s of q.bag.sets) {
    const pieces = s.pieces.map((p) => ({ p, l: byId.get(p.lineId) })).filter((x): x is { p: (typeof s.pieces)[number]; l: NonNullable<typeof x.l> } => !!x.l);
    const regular = pieces.reduce((t, x) => t + x.l.unitPriceMinor * x.l.quantity, 0);
    let left = s.payMinor;
    pieces.forEach(({ p, l }, k) => {
      const own = l.unitPriceMinor * l.quantity;
      const share = k === pieces.length - 1 ? left : regular > 0 ? Math.floor((own * s.payMinor) / regular) : 0;
      left -= share;
      out.push({
        lineId: l.id,
        variantId: l.variantId,
        productId: p.productId,
        nameEn: p.nameEn,
        colourEn: p.colour?.nameEn ?? null,
        size: p.size,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountMinor: Math.max(0, own - share),
        lineTotalMinor: share,
        comboId: l.comboId,
        comboGroupKey: l.comboGroupKey ?? s.groupKey,
        source: l.source,
      });
    });
  }
  return out;
}

/** The bag's lines as they stand (what is ordered): the stamp tells placement the bag did not change under it. */
async function bagLines(db: Db, storeId: number, cartId: string) {
  return db.cartItem.findMany({
    where: { storeId, cartId, removedAt: null, savedForLater: false },
    orderBy: { id: 'asc' },
    select: { id: true, variantId: true, quantity: true, unitPriceMinor: true, comboId: true, comboGroupKey: true, source: true },
  });
}
const stampOf = (lines: readonly { id: string; variantId: string; quantity: number }[]) => hashOf(lines.map((l) => [l.id, l.variantId, l.quantity]));

/** The inventory's dependencies for the hold (the hold and its conversion never reach the ERP connection). */
function inventoryDeps(deps: CheckoutDeps): InventoryDeps {
  const noConnections = {
    use: () => {
      throw new CheckoutError('INVALID_INPUT', 'the checkout does not reach the ERP');
    },
  } as unknown as InventoryDeps['connections'];
  return { db: deps.db, settings: deps.settings, now: deps.now, connections: noConnections };
}

/** The next order number of the store, under the store's own lock: the prefix, then one more than the highest yet. */
export async function nextOrderNumber(tx: Tx, storeId: number, prefix: string, start: number): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`order-number:${storeId}`}, 0))`;
  const rows = await tx.$queryRaw<{ n: bigint | null }[]>`
    SELECT MAX(CAST(substring("number" FROM ${prefix.length + 1}::int) AS BIGINT)) AS n
    FROM "Order" WHERE "storeId" = ${storeId} AND "number" ~ ${`^${prefix}[0-9]{1,15}$`}`;
  const top = rows[0]?.n ?? null;
  return `${prefix}${Math.max(start, top === null ? start : Number(top) + 1)}`;
}

const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';

/**
 * The order a key already placed, for this visitor only.
 * Review R2 (m5): and only for the same checkout — the money fingerprint the page sent must be the one the order stored.
 * A lost answer followed by a new bag in the same tab sends the old key with a new fingerprint: that is refused
 * (IDEMPOTENCY; the page then drops the key and asks him to press again), never answered with the old order.
 */
async function replayOf(deps: CheckoutDeps, storeId: number, visitorId: string, key: string, fingerprint: string): Promise<PlaceResult | null> {
  const o = await deps.db.order.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } }, select: { id: true, number: true, visitorId: true, addressResolution: true } });
  if (!o) return null;
  if (o.visitorId !== visitorId) throw new CheckoutError('IDEMPOTENCY', 'this order key belongs to another order', ['idempotencyKey']);
  const stored = (o.addressResolution as { fingerprint?: unknown } | null)?.fingerprint;
  if (typeof stored === 'string' && stored !== fingerprint) throw new CheckoutError('IDEMPOTENCY', 'this order key placed a different checkout', ['idempotencyKey']);
  return { orderId: o.id, number: o.number, next: (await openPayment(deps.db, storeId, o.id)) ? 'pay' : 'thanks', replay: true };
}

/** The order's payment still waiting (INITIATED or PENDING), if any. */
async function openPayment(db: Db, storeId: number, orderId: string) {
  return db.payment.findFirst({ where: { storeId, orderId, purpose: { in: CHECKOUT_PAY_PURPOSES }, status: { in: ['INITIATED', 'PENDING'] }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' } });
}

/**
 * PR 610 (CN-028, ERP contract v6): is checkout paused for this store now (the ERP holds the account and
 * `erp.hold.pauseCheckout` is on)? The one rule: Confirm is refused by it, and the bag and the checkout read it to tell
 * the customer as soon as they open (CN-029 Phase 3 qa-gate I3).
 */
export async function checkoutPaused(deps: Pick<CheckoutDeps, 'db' | 'settings'>, storeId: number): Promise<boolean> {
  return (await erpCheckoutPaused(deps, storeId)).paused;
}

/** Places the order the customer confirmed. Idempotent on `idempotencyKey`; refuses with the checkout's codes. */
export async function placeOrder(deps: CheckoutDeps, req: PlaceRequest): Promise<PlaceResult> {
  checkStoreId(req.storeId);
  const { storeId, visitorId } = req;
  const d = parse(placeInputSchema, req.input, 'order');
  const customerId = req.customerId ?? null;

  // A second press, or a retry after a lost answer: the order this key placed.
  const again = await replayOf(deps, storeId, visitorId, d.idempotencyKey, d.fingerprint);
  if (again) return again;
  // PR 610 (CN-028, ERP contract v6): while the ERP holds Retail's account (409 ACCOUNT_ON_HOLD) it keeps no stock for
  // new orders, so checkout pauses by itself (`erp.hold.pauseCheckout`, on) until the ERP releases it. Nothing is lost:
  // an order placed before the pause is queued and goes when the account is released.
  if (await checkoutPaused(deps, storeId)) throw new CheckoutError('PAUSED', 'checkout is paused while the ERP holds the account');

  const s = <K extends Parameters<typeof setting>[2]>(k: K) => setting(deps, storeId, k);
  const [nameMin, addressMin, order, noteOn, noteMax, prefix, start, replayHours, currency, cs, autoCreate, detailCheck, giftCfg, timeZone, capture] = await Promise.all([
    s('checkout.form.nameMin'),
    s('checkout.form.addressMin'),
    s('checkout.fieldOrder'),
    s('checkout.note.enabled'),
    s('checkout.note.maxChars'),
    s('checkout.order.numberPrefix'),
    s('checkout.order.numberStart'),
    s('checkout.order.replayHours'),
    s('store.currency'),
    consentSettings(deps, storeId),
    s('account.autoCreate.enabled'),
    s('checkout.address.check'),
    d.gift ? s('checkout.gift') : Promise.resolve(null),
    d.gift ? s('store.timeZone') : Promise.resolve(null),
    s('risk.capture'),
  ]);
  // CN-020 (4): the recording he made on this page (his own, this store's, not on an order yet), while the mic is on
  const voiceCfg = d.voice ? await s('checkout.voice') : null;
  const voice = d.voice && voiceCfg?.enabled ? await deps.db.checkoutVoice.findFirst({ where: { id: d.voice.id, storeId, visitorId, orderId: null }, select: { id: true, transcript: true, confidence: true, engine: true } }) : null;
  const voiceLow = voice ? isLow(voice.transcript, voice.confidence, voiceCfg!.minConfidence) : false;
  const check = checkForm(d.form, { nameMin, addressMin }, fieldOrder(order));
  if (!check.ok) throw new CheckoutError('FORM', 'a field is not finished', [check.field], { field: check.field, problem: check.problem satisfies FieldProblem });
  const note = noteOn ? (d.note ?? '').trim() : '';
  if ([...note].length > noteMax) throw new CheckoutError('INVALID_INPUT', 'the delivery note is too long', ['note']);
  // PR 605: the gift card, only while the owner has gift mode on (else the order is an ordinary one)
  const giftOn = d.gift && giftCfg?.enabled ? giftCfg : null;
  let gift = null;
  if (giftOn && d.gift) {
    const today = storeToday(nowOf(deps), timeZone ?? 'UTC');
    const g = checkGift(d.gift, { nameMin, noteMax: giftOn.noteMaxChars, maxDays: giftOn.deliverAfterMaxDays }, today, giftOn.hidePricesDefault);
    if (!g.ok) throw new CheckoutError('FORM', 'a gift field is not finished', [g.field], { field: g.field, problem: g.problem, gift: true });
    gift = g.gift;
  }

  const cartId = await findBag(deps, { storeId, visitorId });
  if (!cartId) throw new CheckoutError('EMPTY', 'there is no bag to order');
  const before = stampOf(await bagLines(deps.db, storeId, cartId));
  const quoteNow = () => checkoutQuote(deps, {
    storeId,
    cartId,
    lang: d.lang,
    customerId,
    address: { line: d.form.address, confirmed: d.confirmed ?? null, phone: check.phone.e164 },
    payment: d.payment ?? null,
    useWallet: d.useWallet === true,
    ip: req.ip ?? null,
    gift: gift !== null,
    // PR 560: the finished details, so the owner's Parameter for Checkout looks at exactly what the page showed
    details: { name: d.form.name, phone: check.phone.e164 },
    // PR 559 (SIM-F-015): and this browser's device, as the page's own quote had it
    deviceId: req.deviceId ?? null,
  });
  const q = await quoteNow();
  if (!q.bag.items.length && !q.bag.sets.length) throw new CheckoutError('EMPTY', 'the bag has nothing to order');
  if (q.bag.blocked.length) throw new CheckoutError('OUT_OF_STOCK', 'a line cannot be ordered now', q.bag.blocked.map((b) => `${b.lineId}:${b.free}`));
  // SIM-F-003: the money stored is the money shown, or nothing is stored.
  if (q.fingerprint !== d.fingerprint) throw new CheckoutError('PRICE_CHANGED', 'the checkout changed since the page showed it', [], { view: viewOf(q) });
  const t = q.totals;
  const choice = q.pay.chosen;
  if (t.dueMinor > 0 && !choice) throw new CheckoutError('NO_PAYMENT', 'no payment method is open for this order');

  const now = nowOf(deps);
  const kept = captureOf(capture, { ip: req.ip ?? null, deviceId: req.deviceId ?? null, gps: d.gps ?? null, gift: gift !== null }, now);
  const prepaid = isPrepaid(choice) && t.dueMinor > 0;
  // PR 560: a part or the delivery charge ahead is a Cash on Delivery order with that much paid now by his method
  const adv = q.advance;
  const flagged = adv && q.flag ? q.flag : null;
  const partAhead = adv !== null && adv.kind !== 'full';
  const payMethod = paymentMethodOf(choice, t.dueMinor);
  const method = partAhead ? 'COD' : payMethod;
  const resolved = q.address.status === 'resolved' ? q.address : null;
  const charged = resolved?.line.status === 'resolved' ? resolved.line : null;
  // PR 565: free delivery is exempt from the band machinery — a band nobody settled is no question and no flag; only
  // a line with no place in it at all still gets the directions call (the courier needs to find the house).
  const free = q.charge.state === 'free';
  const unclear = !resolved && !free;
  const notSet = q.charge.state === 'not-set';
  const lost = free && q.address.status === 'ask' && q.address.read.reason === 'no-place';
  // SIM-F-030: a landmark-only line ("bazar er pashe, Kurigram") — the band is settled, the house is not
  const noDetail = lost || (detailCheck.enabled && !hasAddressDetail(d.form.address, detailCheck.words));
  const flags: string[] = [];
  if (unclear) flags.push(ORDER_FLAGS.addressUnclear);
  if (notSet) flags.push(ORDER_FLAGS.chargeNotSet);
  if (noDetail) flags.push(ORDER_FLAGS.addressCheck);
  if (prepaid) flags.push(ORDER_FLAGS.paymentPending);
  // PR 605: a part of the gift paid ahead — the team calls for it until S07's part payment
  const giftPart = q.gift?.partMinor ?? null;
  if (giftPart) flags.push(ORDER_FLAGS.giftAdvance);
  // PR 193: an Eid pre-order, its advance taken like PR 560's (the order service's AWAITING_ADVANCE)
  const preorder = adv !== null && q.preorder;
  if (preorder) flags.push(ORDER_FLAGS.preorder);
  if (voice) flags.push(ORDER_FLAGS.voiceEntered);
  if (voiceLow) flags.push(ORDER_FLAGS.voiceCall);
  const consent = consentOf(cs, d.consent ?? null);
  const discountMinor = q.bag.summary.offers.reduce((a, o) => a + o.amountMinor, 0) + t.rewardMinor;
  // Review R1 (B1): the code the order uses is redeemed in the order's own transaction (its limits hold under load)
  const coupon = q.bag.summary.offers.find((x) => x.code) ?? null;
  const couponMinor = q.bag.summary.offers.filter((x) => x.code).reduce((a, o) => a + o.amountMinor, 0);
  const scope = scopeOf(storeId);
  const inv = inventoryDeps(deps);

  try {
    return await deps.db.$transaction(async (tx) => {
      // The key first: a second press waits here until the first one's order is in, then gets that order back.
      await tx.idempotencyKey.create({
        data: { scope, key: d.idempotencyKey, requestHash: hashOf({ visitorId, d }), expiresAt: new Date(now.getTime() + replayHours * 3_600_000) },
      });
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "Cart" WHERE "id" = ${cartId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
      if (locked[0]?.status !== 'ACTIVE') throw new CheckoutError('CART_NOT_OPEN', 'the bag became an order already');
      const lines = await bagLines(tx, storeId, cartId);
      if (stampOf(lines) !== before) throw new CheckoutError('PRICE_CHANGED', 'the bag changed while the order was being placed');

      try {
        await holdCart(inv, { storeId, cartId, lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), signedIn: customerId !== null }, { tx });
      } catch (e) {
        if (e instanceof InventoryError && e.code === 'OUT_OF_STOCK') throw new CheckoutError('OUT_OF_STOCK', 'not enough pieces are free now', e.details);
        throw e;
      }

      const number = await nextOrderNumber(tx, storeId, prefix, start);
      // PR 129: the account it belongs to (SIM-F-039: a new one has no password; the browser is not signed in).
      // PR 605: the phone of a gift is the receiver's — no account is made or found for him; a signed-in sender keeps it
      const account = await linkOrderAccount(tx, { storeId, phone: check.phone.e164, name: d.form.name, placedAt: now, signedInCustomerId: customerId, autoCreate: autoCreate && !gift });
      const ownerId = account?.customerId ?? null;
      const rows = orderLinesOf(q, lines);
      const variants = await tx.productVariant.findMany({ where: { storeId, id: { in: [...new Set(rows.map((r) => r.variantId))] } }, select: { id: true, sku: true } });
      const sku = new Map(variants.map((v) => [v.id, v.sku]));
      const o = await tx.order.create({
        data: {
          storeId,
          number,
          customerId: ownerId,
          status: 'PLACED',
          source: 'WEBSITE',
          currency,
          placedAt: now,
          // PR 505 follow-up (SIM-F-025): the language he ordered in; his messages follow it
          lang: d.lang,
          phone: check.phone.e164,
          customerName: d.form.name.trim(),
          shippingAddressText: d.form.address.trim(),
          backfilledAddress: resolved?.backfill?.line ?? null,
          areaId: charged?.area.areaId ?? null,
          deliveryBandId: charged?.quote.band.id ?? null,
          addressResolution: {
            status: q.address.status,
            ...(resolved ? { via: resolved.read.via, placeSure: resolved.read.placeSure, band: resolved.read.band.key, charged: charged?.quote.band.key ?? null, clues: resolved.read.clues } : {}),
            ...(q.address.status === 'ask' ? { reason: q.address.read.reason } : {}),
            charge: q.charge,
            ...(free ? { bandExempt: true } : {}),
            ...(resolved?.backfill ? { backfill: resolved.backfill.from } : {}),
            detail: !noDetail,
            fingerprint: q.fingerprint,
          },
          addressUnclear: unclear,
          chargeFixed: q.charge.state === 'free' || q.charge.state === 'charge',
          subtotalMinor: q.bag.summary.subtotalMinor,
          discountMinor,
          deliveryChargeMinor: t.deliveryMinor ?? 0,
          walletAppliedMinor: t.walletMinor,
          totalMinor: t.totalMinor,
          codAmountMinor: method === 'COD' ? t.dueMinor : 0,
          paidMinor: 0,
          paymentMethod: method,
          couponCode: coupon?.code ?? null,
          smsMarketingConsent: consent.sms,
          whatsappMarketingConsent: consent.whatsapp,
          visitorId,
          // PR 159: the IP, the device id and the shared point, by the owner's switches, cleared after his days
          ...kept,
          // PR 257 follow-up: the campaign tags and ad platform of the visit, for Profit & loss by channel and the export
          ...attributionData(req.attribution),
          idempotencyKey: d.idempotencyKey,
          note: note || null,
          flags,
          ...(gift
            ? {
                isGift: true,
                giftSenderName: gift.senderName,
                giftSenderContact: gift.senderContact,
                giftNote: gift.note,
                giftDeliverAfter: gift.deliverAfter ? new Date(`${gift.deliverAfter}T00:00:00Z`) : null,
                giftHidePrices: gift.hidePrices,
                advanceRequiredMinor: giftPart,
              }
            : {}),
          ...(adv && flagged ? { advanceRequirement: flagged.requirement, advanceRequiredMinor: adv.amountMinor } : {}),
          ...(preorder ? { advanceRequirement: adv.kind === 'full' ? 'FULL_AMOUNT' : 'PART_AMOUNT', advanceRequiredMinor: adv.amountMinor } : {}),
        },
        select: { id: true },
      });
      await tx.orderItem.createMany({
        data: rows.map((r) => ({
          storeId,
          orderId: o.id,
          variantId: r.variantId,
          productId: r.productId,
          sku: sku.get(r.variantId) ?? r.variantId,
          productName: r.nameEn,
          colourName: r.colourEn,
          sizeLabel: r.size,
          quantity: r.quantity,
          unitPriceMinor: r.unitPriceMinor,
          discountMinor: r.discountMinor,
          lineTotalMinor: r.lineTotalMinor,
          comboId: r.comboId,
          comboGroupKey: r.comboGroupKey,
          addedVia: r.source,
        })),
      });
      // who may use it is judged as the quote judged it: the signed-in customer (a guest is counted by his phone)
      if (coupon?.code) await redeemCoupon(tx, { storeId, code: coupon.code, orderId: o.id, phone: check.phone.e164, customerId, discountMinor: couponMinor, now });
      await convertCart(inv, { storeId, cartId, orderId: o.id }, { tx });
      const closed = await tx.cart.updateMany({ where: { id: cartId, storeId, status: 'ACTIVE' }, data: { status: 'CONVERTED', convertedOrderId: o.id, lastActivityAt: now } });
      if (closed.count !== 1) throw new CheckoutError('CART_NOT_OPEN', 'the bag became an order already');
      await tx.orderEvent.create({
        data: {
          storeId,
          orderId: o.id,
          type: ORDER_EVENTS.placed,
          toStatus: 'PLACED',
          actorType: 'CUSTOMER',
          actorId: customerId,
          source: CHECKOUT_SOURCE,
          data: {
            payment: choice ? { method: choice.method, option: choice.option } : null,
            reward: q.pay.reward?.kind ?? null,
            // PR 566: why Cash on Delivery was not offered, if it was not (the support explanation reads it back)
            codOff: q.pay.codOff,
            charge: q.charge.state,
            account: account?.kind ?? null,
            ...(gift ? { gift: { advance: q.gift?.advance ?? 'none', partMinor: giftPart, deliverAfter: gift.deliverAfter, hidePrices: gift.hidePrices } } : {}),
            // PR 560: what the checkout asked ahead (the layer is on the flag event, for the team only)
            ...(adv ? { advance: { kind: adv.kind, amountMinor: adv.amountMinor } } : {}),
            // PR 193: an Eid pre-order (the reason the advance was asked; no risk layer involved)
            ...(preorder ? { preorder: true } : {}),
            // CN-020 (4): the address was spoken (who read it, how sure; the recording is on the CheckoutVoice row)
            ...(voice ? { voice: { engine: voice.engine, confidence: voice.confidence, low: voiceLow } } : {}),
          },
        },
      });
      // PR 560: the flag, kept for the team and the outcome report (PR 562): which layer, what it asked, the score
      if (adv && flagged)
        await tx.checkoutFlagEvent.create({
          data: { storeId, layerId: flagged.layerId, orderId: o.id, customerId: ownerId, requirement: flagged.requirement, outcome: FLAG_OUTCOMES.asked, explanation: { layer: flagged.layerName, score: flagged.score, band: flagged.band, kind: adv.kind, amountMinor: adv.amountMinor, restMinor: adv.restMinor } },
        });
      await recordConsent(tx, { storeId, orderId: o.id, customerId: ownerId, phone: check.phone.e164, ip: req.ip ?? null, answer: consent, source: CHECKOUT_SOURCE });

      if (t.walletMinor > 0) {
        if (!customerId) throw new CheckoutError('PRICE_CHANGED', 'the wallet needs a signed-in customer');
        const w = await tx.$queryRaw<{ id: string; balanceMinor: number }[]>`
          SELECT "id"::text AS id, "balanceMinor" FROM "WalletAccount"
          WHERE "storeId" = ${storeId} AND "customerId" = ${customerId}::uuid AND "status" = ${WALLET_ACTIVE} FOR UPDATE`;
        const wallet = w[0];
        if (!wallet || wallet.balanceMinor < t.walletMinor) throw new CheckoutError('PRICE_CHANGED', 'the wallet balance changed');
        const after = wallet.balanceMinor - t.walletMinor;
        await tx.walletAccount.update({ where: { id: wallet.id }, data: { balanceMinor: after } });
        await tx.walletEntry.create({
          data: { storeId, walletId: wallet.id, direction: 'DEBIT', amountMinor: t.walletMinor, balanceAfterMinor: after, reason: 'ORDER', orderId: o.id, idempotencyKey: `order:${o.id}` },
        });
      }
      if (prepaid) {
        await tx.payment.create({
          data: { storeId, orderId: o.id, method: payMethod, provider: choice!.option ?? choice!.method, purpose: adv ? ADVANCE_PURPOSE[adv.kind] : 'ORDER', status: 'INITIATED', amountMinor: adv ? adv.amountMinor : t.dueMinor, currency, idempotencyKey: `${d.idempotencyKey}:pay:1`, attempt: 1, statusAt: now },
        });
      }
      const reason = unclear ? CALL_REASONS.addressUnclear : notSet ? CALL_REASONS.chargeNotSet : noDetail ? CALL_REASONS.addressCheck : giftPart ? CALL_REASONS.giftAdvance : voiceLow ? CALL_REASONS.voiceCall : null;
      if (reason) await tx.callTask.create({ data: { storeId, orderId: o.id, customerId: ownerId, reason } });
      if (voice) {
        const linked = await tx.checkoutVoice.updateMany({ where: { id: voice.id, storeId, orderId: null }, data: { orderId: o.id } });
        if (linked.count !== 1) throw new CheckoutError('INVALID_INPUT', 'the recording went into another order', ['voice']);
      }
      await tx.checkoutDraft.updateMany({ where: { storeId, visitorId, convertedOrderId: null }, data: { convertedOrderId: o.id, cartId, lastStep: 'placed', lastActivityAt: now } });
      await tx.idempotencyKey.update({
        where: { scope_key: { scope, key: d.idempotencyKey } },
        data: { completedAt: now, responseStatus: 201, responseBody: { orderId: o.id, number } },
      });
      return { orderId: o.id, number, next: prepaid ? 'pay' : 'thanks', replay: false } satisfies PlaceResult;
    }, TX);
  } catch (e) {
    // Two presses at the same moment: the second waited for the first and finds its order.
    if (isUnique(e)) {
      const r = await replayOf(deps, storeId, visitorId, d.idempotencyKey, d.fingerprint);
      if (r) return r;
    }
    // Review R1 (B1): the code was used up (or used by him already) a moment ago — nothing was stored; he sees the
    // checkout as it is now (the code refused, the price without it) and confirms again.
    if (e instanceof RulesError && e.code === 'COUPON_NOT_USABLE') throw new CheckoutError('PRICE_CHANGED', 'the code cannot be used any more', e.details, { view: viewOf(await quoteNow()) });
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The payment of a prepaid order (the mock until S07) and its failure path
// ---------------------------------------------------------------------------------------------------------------------

/** The visitor's own order by its number (anything else is "no such order"). */
async function ownOrder(db: Db, storeId: number, visitorId: string, number: string) {
  const o = await db.order.findUnique({ where: { storeId_number: { storeId, number } }, select: { id: true, visitorId: true, idempotencyKey: true, flags: true, paidMinor: true, currency: true, status: true } });
  if (!o || o.visitorId !== visitorId) throw new CheckoutError('NOT_FOUND', 'no such order for this visitor', ['number']);
  return o;
}

export const PAY_ACTIONS = ['approve', 'fail', 'retry'] as const;
export type PayAction = (typeof PAY_ACTIONS)[number];
export const payActionSchema = z.object({ number: z.string().trim().min(1).max(40), action: z.enum(PAY_ACTIONS) }).strict();

export interface PayActionResult {
  number: string;
  status: 'PAID' | 'FAILED' | 'INITIATED';
  next: PlaceNext;
}

/** Follow-up 50 — how a payment of this provider may be paid now. */
export interface PayModes {
  /** The test page's "paid" and "fail" may answer: the owner's test payments are on and no real gateway is connected. */
  test: boolean;
  /** A real gateway (sandbox or live) is connected: "Pay" opens its page, and only its own answer pays the order. */
  gateway: boolean;
}

/**
 * Follow-up 50 — the go-live guard of the test payment page: "paid" and "fail" answer only while `payments.testPayments`
 * is on (switched off on go-live day, PR 587) and the provider's gateway is the practice one. Once a real gateway is
 * connected, nobody can mark an order paid from the shop's own page. A gateway that cannot be read is neither.
 */
export async function payModes(deps: CheckoutDeps, storeId: number, provider: string | null): Promise<PayModes> {
  try {
    const [testOn, mode] = await Promise.all([setting(deps, storeId, 'payments.testPayments'), deps.paymentMode && provider ? deps.paymentMode(storeId, provider) : Promise.resolve('MOCK' as const)]);
    const real = mode === 'SANDBOX' || mode === 'LIVE';
    return { test: testOn && !real, gateway: real };
  } catch {
    return { test: false, gateway: false };
  }
}

/**
 * The test payment page's answer (A1.3: a mock until the gateway's key arrives): approve marks the payment paid and the
 * order paid that much; fail keeps the failure (FAILED, the order flagged, one call task); retry makes a new payment
 * for the same order. No money moves here. Approve and fail answer only under `payModes(...).test` (follow-up 50).
 */
export async function payAction(deps: CheckoutDeps, req: { storeId: number; visitorId: string; input: unknown }): Promise<PayActionResult> {
  checkStoreId(req.storeId);
  const { storeId } = req;
  const d = parse(payActionSchema, req.input, 'payment');
  const now = nowOf(deps);
  if (d.action !== 'retry') {
    const mine = await ownOrder(deps.db, storeId, req.visitorId, d.number);
    const last = await deps.db.payment.findFirst({ where: { storeId, orderId: mine.id, purpose: { in: CHECKOUT_PAY_PURPOSES }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' }, select: { provider: true } });
    if (last && !(await payModes(deps, storeId, last.provider)).test) throw new CheckoutError('TEST_PAYMENT_OFF', 'the test payment page is off here; the payment service answers for this payment', ['action']);
  }
  /** PR 560: the order whose advance this payment completed (the order service moves it back to the queue). */
  let met: string | null = null;
  const result = await deps.db.$transaction(async (tx): Promise<PayActionResult> => {
    const mine = await ownOrder(tx, storeId, req.visitorId, d.number);
    await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${mine.id}::uuid FOR UPDATE`;
    // read again under the lock: an order command (S05, @extas/orders) may have changed it in between
    const o = await ownOrder(tx, storeId, req.visitorId, d.number);
    const last = await tx.payment.findFirst({ where: { storeId, orderId: o.id, purpose: { in: CHECKOUT_PAY_PURPOSES }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' } });
    if (!last) throw new CheckoutError('NOT_FOUND', 'this order has no payment to make', ['number']);
    const event = (type: string, data: Record<string, unknown>) => tx.orderEvent.create({ data: { storeId, orderId: o.id, type, actorType: 'CUSTOMER', source: CHECKOUT_SOURCE, data: { paymentId: last.id, provider: MOCK_PROVIDER, ...data } } });
    const open = last.status === 'INITIATED' || last.status === 'PENDING';
    const without = (...f: string[]) => o.flags.filter((x) => !f.includes(x));
    // PR 165: the mock's answer is written like a gateway's (the one outcome writer); the customer stands behind it
    const answer = (outcome: 'PAID' | 'FAILED') =>
      applyOutcome(tx, storeId, { paymentId: last.id, outcome, from: 'gateway', providerTrxId: outcome === 'PAID' ? `${MOCK_PROVIDER}-${randomBytes(6).toString('hex')}` : null, by: { actorType: 'CUSTOMER', actorId: null, source: CHECKOUT_SOURCE }, eventData: { provider: MOCK_PROVIDER } }, now);

    if (d.action === 'approve') {
      if (last.status === 'PAID') return { number: d.number, status: 'PAID', next: 'thanks' };
      if (!open) throw new CheckoutError('CART_NOT_OPEN', 'this payment is closed; try again makes a new one', ['action']);
      const r = await answer('PAID');
      if (r.advanceMet) met = o.id;
      return { number: d.number, status: 'PAID', next: 'thanks' };
    }
    if (d.action === 'fail') {
      if (last.status === 'FAILED') return { number: d.number, status: 'FAILED', next: 'thanks' };
      if (!open) throw new CheckoutError('CART_NOT_OPEN', 'this payment is closed', ['action']);
      await answer('FAILED');
      return { number: d.number, status: 'FAILED', next: 'thanks' };
    }
    // retry — never on a cancelled order (its payment was closed by the cancel, PR 144)
    if (o.status === 'CANCELLED') throw new CheckoutError('CART_NOT_OPEN', 'this order is cancelled', ['number']);
    if (open) return { number: d.number, status: 'INITIATED', next: 'pay' };
    if (last.status === 'PAID') return { number: d.number, status: 'PAID', next: 'thanks' };
    const tries = await tx.payment.count({ where: { storeId, orderId: o.id, purpose: { in: CHECKOUT_PAY_PURPOSES } } });
    // review R1 (m2): the new try asks what is due now (an edit may have changed the total since the first try): the
    // order's amount due, or for an advance what of it is still missing
    const money = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { totalMinor: true, walletAppliedMinor: true, paidMinor: true, advanceRequiredMinor: true } });
    const dueNow = last.purpose === 'ORDER' ? Math.max(0, money.totalMinor - money.walletAppliedMinor - money.paidMinor) : Math.max(0, (money.advanceRequiredMinor ?? last.amountMinor) - money.paidMinor);
    if (dueNow <= 0) return { number: d.number, status: 'PAID', next: 'thanks' };
    await tx.payment.create({
      data: { storeId, orderId: o.id, method: last.method, provider: last.provider, purpose: last.purpose, status: 'INITIATED', amountMinor: dueNow, currency: last.currency, idempotencyKey: `${o.idempotencyKey}:pay:${tries + 1}`, attempt: tries + 1, statusAt: now },
    });
    await tx.order.update({ where: { id: o.id }, data: { flags: [...without(ORDER_FLAGS.paymentPending, ORDER_FLAGS.paymentFailed), ORDER_FLAGS.paymentPending], version: { increment: 1 } } });
    await event(ORDER_EVENTS.retry, { tries: tries + 1 });
    return { number: d.number, status: 'INITIATED', next: 'pay' };
  }, TX);
  // PR 560: an advance paid in full puts the order back in the queue (never fails the customer's payment answer)
  if (met && deps.advancePaid) await deps.advancePaid(storeId, met).catch((e: unknown) => console.warn(`advance paid: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`));
  return result;
}

/** What the payment page shows: the order's number, what is to be paid now and how, and how it can be paid. */
export interface PayView extends PayModes {
  /** PR 170: the payment the page pays (the gateway session is opened for it). */
  paymentId: string;
  number: string;
  amountMinor: number;
  method: PaymentMethod;
  provider: string | null;
  status: 'INITIATED' | 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
}

export async function payView(deps: CheckoutDeps, req: { storeId: number; visitorId: string; number: string }): Promise<PayView | null> {
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: req.storeId, number: req.number } }, select: { id: true, number: true, visitorId: true } });
  if (!o || o.visitorId !== req.visitorId) return null;
  const p = await deps.db.payment.findFirst({ where: { storeId: req.storeId, orderId: o.id, purpose: { in: CHECKOUT_PAY_PURPOSES }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' } });
  if (!p || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'AUTHORIZED') return null;
  return { paymentId: p.id, number: o.number, amountMinor: p.amountMinor, method: p.method, provider: p.provider, status: p.status, ...(await payModes(deps, req.storeId, p.provider)) };
}

// ---------------------------------------------------------------------------------------------------------------------
// SIM-F-026 — the unfinished checkout, kept for the team's follow-up (only with the owner's switch on)
// ---------------------------------------------------------------------------------------------------------------------

export const draftInputSchema = z
  .object({
    form: placeInputSchema.shape.form,
    payment: paymentInputSchema.nullable().optional(),
    note: z.string().max(TEXT_MAX).nullable().optional(),
    /** How far he got: details, delivery, payment. */
    step: z.enum(['details', 'delivery', 'payment']).optional(),
  })
  .strict();

/**
 * Keeps what the customer typed (once his phone number is a real Bangladeshi mobile — nothing to follow up without it)
 * as his one open checkout draft; the order marks it converted. Off by default (`checkout.capture.enabled`).
 */
export async function captureDraft(deps: CheckoutDeps, req: { storeId: number; visitorId: string; customerId?: string | null; input: unknown }): Promise<{ kept: boolean }> {
  checkStoreId(req.storeId);
  const { storeId, visitorId } = req;
  const d = parse(draftInputSchema, req.input, 'draft');
  if (!(await setting(deps, storeId, 'checkout.capture.enabled'))) return { kept: false };
  const phone = phoneNormalizeBD(d.form.phone);
  if (!phone.ok) return { kept: false };
  const now = nowOf(deps);
  const cartId = await findBag(deps, { storeId, visitorId });
  const data = {
    cartId,
    customerId: req.customerId ?? null,
    phone: phone.e164,
    name: d.form.name.trim() || null,
    addressText: d.form.address.trim() || null,
    data: { payment: d.payment ?? null, note: d.note?.trim() || null },
    lastStep: d.step ?? 'details',
    lastActivityAt: now,
  };
  await deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-draft:${storeId}:${visitorId}`}, 0))`;
    const open = await tx.checkoutDraft.findFirst({ where: { storeId, visitorId, convertedOrderId: null }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (open) await tx.checkoutDraft.update({ where: { id: open.id }, data });
    else await tx.checkoutDraft.create({ data: { storeId, visitorId, ...data } });
  }, TX);
  return { kept: true };
}
