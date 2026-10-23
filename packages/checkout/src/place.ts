// PR 125 — placing the order (demo 51-checkout.js SUBMIT['co-place'], 02-core.js placeOrder), idempotent, with the
// failure path. The order stores exactly what the page showed (SIM-F-003): the page sends the fingerprint of the money
// it showed, the server prices the bag again with the same function and the same choices (checkoutQuote), and refuses
// with PRICE_CHANGED (and the checkout as it is now) when anything moved; the zone, band and charge come from that one
// read — never a second reading of the address text. An address nothing settles still becomes an order: flagged
// "address unclear", the charge not fixed, and a call task for the team (PR 563); a band with no charge yet likewise.
// PR 563 also never holds an order over an address: it is placed like any other (PLACED, confirmable), and a line that
// says nowhere where the house is (a landmark only, SIM-F-030: `checkout.address.check`) gets the "address check" flag
// and the same call task, so the confirmation call asks for directions. One call task per order, the weightiest reason.
//
// One press = one order: the page makes an order key once and sends it with every retry (a slow network, a double
// tap). The key is claimed inside the order's own transaction, so a lost answer or a second press finds the order
// already placed and gets it back, never a second one. Everything is one transaction: the stock hold and its
// conversion (S09), the order number under the store's lock, the order and its lines, the bag closed, the wallet
// debited under its row lock, the consent records, the dated event, and — for a prepaid order — its payment, waiting.
//
// SIM-F-026: the failure path. A prepaid order's payment runs on the mock until the gateways of S07 are connected
// (A1.3): a failed payment is kept (FAILED, flagged on the order, a call task), and "Try again" makes a new payment for
// the same order — still one order. With the owner's switch on, what a customer typed and left is kept as a checkout
// draft for the team's follow-up (PR 274/275), and marked converted when he orders.
//
// PR 129: the order belongs to an account in the same transaction — the signed-in customer, else the customer with the
// order's phone number, else a new one made now (`account.autoCreate.enabled`), never with a password (SIM-F-039,
// @extas/accounts identity.ts). The placed event says which (`data.account`), for the thank-you page's account card.
import { createHash, randomBytes } from 'node:crypto';
import { linkOrderAccount } from '@extas/accounts';
import { findBag } from '@extas/cart';
import type { Prisma } from '@extas/db/client';
import { hasAddressDetail } from '@extas/delivery';
import { convertCart, holdCart, InventoryError, type InventoryDeps } from '@extas/inventory';
import { z } from 'zod';
import { addressInputSchema } from './address';
import { consentInputSchema, consentOf, consentSettings, recordConsent } from './consent';
import { CheckoutError, checkStoreId, nowOf, parse, setting, TX, type CheckoutDeps, type Db, type Tx } from './context';
import { paymentInputSchema, isPrepaid, type PaymentChoice } from './payment';
import { checkForm, fieldOrder, phoneNormalizeBD, type FieldProblem } from './pure';
import { checkoutQuote, viewOf, WALLET_ACTIVE, type CheckoutQuote } from './quote';

const TEXT_MAX = 2_000;

/** The method an order and its payment are stored with (the database's own list). */
export type PaymentMethod = NonNullable<Prisma.OrderUncheckedCreateInput['paymentMethod']>;

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
  input: unknown;
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
export const ORDER_FLAGS = { addressUnclear: 'ADDRESS_UNCLEAR', chargeNotSet: 'CHARGE_NOT_SET', addressCheck: 'ADDRESS_CHECK', paymentPending: 'PAYMENT_PENDING', paymentFailed: 'PAYMENT_FAILED' } as const;
/** Why the team calls (CallTask.reason). */
export const CALL_REASONS = { addressUnclear: 'ADDRESS_UNCLEAR', chargeNotSet: 'CHARGE_NOT_SET', addressCheck: 'ADDRESS_CHECK', paymentFailed: 'PAYMENT_FAILED' } as const;
/** What the order's events are called. */
export const ORDER_EVENTS = { placed: 'order.placed', paid: 'payment.paid', failed: 'payment.failed', retry: 'payment.retry' } as const;
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

/** The order a key already placed, for this visitor only. */
async function replayOf(deps: CheckoutDeps, storeId: number, visitorId: string, key: string): Promise<PlaceResult | null> {
  const o = await deps.db.order.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } }, select: { id: true, number: true, visitorId: true } });
  if (!o) return null;
  if (o.visitorId !== visitorId) throw new CheckoutError('IDEMPOTENCY', 'this order key belongs to another order', ['idempotencyKey']);
  return { orderId: o.id, number: o.number, next: (await openPayment(deps.db, storeId, o.id)) ? 'pay' : 'thanks', replay: true };
}

/** The order's payment still waiting (INITIATED or PENDING), if any. */
async function openPayment(db: Db, storeId: number, orderId: string) {
  return db.payment.findFirst({ where: { storeId, orderId, purpose: 'ORDER', status: { in: ['INITIATED', 'PENDING'] }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' } });
}

/** Places the order the customer confirmed. Idempotent on `idempotencyKey`; refuses with the checkout's codes. */
export async function placeOrder(deps: CheckoutDeps, req: PlaceRequest): Promise<PlaceResult> {
  checkStoreId(req.storeId);
  const { storeId, visitorId } = req;
  const d = parse(placeInputSchema, req.input, 'order');
  const customerId = req.customerId ?? null;

  // A second press, or a retry after a lost answer: the order this key placed.
  const again = await replayOf(deps, storeId, visitorId, d.idempotencyKey);
  if (again) return again;

  const s = <K extends Parameters<typeof setting>[2]>(k: K) => setting(deps, storeId, k);
  const [nameMin, addressMin, order, noteOn, noteMax, prefix, start, replayHours, currency, cs, autoCreate, detailCheck] = await Promise.all([
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
  ]);
  const check = checkForm(d.form, { nameMin, addressMin }, fieldOrder(order));
  if (!check.ok) throw new CheckoutError('FORM', 'a field is not finished', [check.field], { field: check.field, problem: check.problem satisfies FieldProblem });
  const note = noteOn ? (d.note ?? '').trim() : '';
  if ([...note].length > noteMax) throw new CheckoutError('INVALID_INPUT', 'the delivery note is too long', ['note']);

  const cartId = await findBag(deps, { storeId, visitorId });
  if (!cartId) throw new CheckoutError('EMPTY', 'there is no bag to order');
  const before = stampOf(await bagLines(deps.db, storeId, cartId));
  const q = await checkoutQuote(deps, {
    storeId,
    cartId,
    lang: d.lang,
    customerId,
    address: { line: d.form.address, confirmed: d.confirmed ?? null },
    payment: d.payment ?? null,
    useWallet: d.useWallet === true,
  });
  if (!q.bag.items.length && !q.bag.sets.length) throw new CheckoutError('EMPTY', 'the bag has nothing to order');
  if (q.bag.blocked.length) throw new CheckoutError('OUT_OF_STOCK', 'a line cannot be ordered now', q.bag.blocked.map((b) => `${b.lineId}:${b.free}`));
  // SIM-F-003: the money stored is the money shown, or nothing is stored.
  if (q.fingerprint !== d.fingerprint) throw new CheckoutError('PRICE_CHANGED', 'the checkout changed since the page showed it', [], { view: viewOf(q) });
  const t = q.totals;
  const choice = q.pay.chosen;
  if (t.dueMinor > 0 && !choice) throw new CheckoutError('NO_PAYMENT', 'no payment method is open for this order');

  const now = nowOf(deps);
  const prepaid = isPrepaid(choice) && t.dueMinor > 0;
  const method = paymentMethodOf(choice, t.dueMinor);
  const resolved = q.address.status === 'resolved' ? q.address : null;
  const charged = resolved?.line.status === 'resolved' ? resolved.line : null;
  const unclear = !resolved;
  const notSet = q.charge.state === 'not-set';
  // SIM-F-030: a landmark-only line ("bazar er pashe, Kurigram") — the band is settled, the house is not
  const noDetail = detailCheck.enabled && !hasAddressDetail(d.form.address, detailCheck.words);
  const flags: string[] = [];
  if (unclear) flags.push(ORDER_FLAGS.addressUnclear);
  if (notSet) flags.push(ORDER_FLAGS.chargeNotSet);
  if (noDetail) flags.push(ORDER_FLAGS.addressCheck);
  if (prepaid) flags.push(ORDER_FLAGS.paymentPending);
  const consent = consentOf(cs, d.consent ?? null);
  const discountMinor = q.bag.summary.offers.reduce((a, o) => a + o.amountMinor, 0) + t.rewardMinor;
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
      const account = await linkOrderAccount(tx, { storeId, phone: check.phone.e164, name: d.form.name, placedAt: now, signedInCustomerId: customerId, autoCreate });
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
          phone: check.phone.e164,
          customerName: d.form.name.trim(),
          shippingAddressText: d.form.address.trim(),
          areaId: charged?.area.areaId ?? null,
          deliveryBandId: charged?.quote.band.id ?? null,
          addressResolution: {
            status: q.address.status,
            ...(resolved ? { via: resolved.read.via, placeSure: resolved.read.placeSure, band: resolved.read.band.key, charged: charged?.quote.band.key ?? null, clues: resolved.read.clues } : {}),
            ...(q.address.status === 'ask' ? { reason: q.address.read.reason } : {}),
            charge: q.charge,
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
          couponCode: q.bag.summary.offers.find((x) => x.code)?.code ?? null,
          smsMarketingConsent: consent.sms,
          whatsappMarketingConsent: consent.whatsapp,
          visitorId,
          ip: req.ip ?? null,
          idempotencyKey: d.idempotencyKey,
          note: note || null,
          flags,
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
          data: { payment: choice ? { method: choice.method, option: choice.option } : null, reward: q.pay.reward?.kind ?? null, charge: q.charge.state, account: account?.kind ?? null },
        },
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
          data: { storeId, orderId: o.id, method, provider: choice!.option ?? choice!.method, purpose: 'ORDER', status: 'INITIATED', amountMinor: t.dueMinor, currency, idempotencyKey: `${d.idempotencyKey}:pay:1` },
        });
      }
      const reason = unclear ? CALL_REASONS.addressUnclear : notSet ? CALL_REASONS.chargeNotSet : noDetail ? CALL_REASONS.addressCheck : null;
      if (reason) await tx.callTask.create({ data: { storeId, orderId: o.id, customerId: ownerId, reason } });
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
      const r = await replayOf(deps, storeId, visitorId, d.idempotencyKey);
      if (r) return r;
    }
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

/**
 * The mock payment page's answer (A1.3: a mock until the gateway's key arrives): approve marks the payment paid and the
 * order paid that much; fail keeps the failure (FAILED, the order flagged, one call task); retry makes a new payment
 * for the same order. No money moves here.
 */
export async function payAction(deps: CheckoutDeps, req: { storeId: number; visitorId: string; input: unknown }): Promise<PayActionResult> {
  checkStoreId(req.storeId);
  const { storeId } = req;
  const d = parse(payActionSchema, req.input, 'payment');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const mine = await ownOrder(tx, storeId, req.visitorId, d.number);
    await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${mine.id}::uuid FOR UPDATE`;
    // read again under the lock: an order command (S05, @extas/orders) may have changed it in between
    const o = await ownOrder(tx, storeId, req.visitorId, d.number);
    const last = await tx.payment.findFirst({ where: { storeId, orderId: o.id, purpose: 'ORDER', method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' } });
    if (!last) throw new CheckoutError('NOT_FOUND', 'this order has no payment to make', ['number']);
    const event = (type: string, data: Record<string, unknown>) => tx.orderEvent.create({ data: { storeId, orderId: o.id, type, actorType: 'CUSTOMER', source: CHECKOUT_SOURCE, data: { paymentId: last.id, provider: MOCK_PROVIDER, ...data } } });
    const open = last.status === 'INITIATED' || last.status === 'PENDING';
    const without = (...f: string[]) => o.flags.filter((x) => !f.includes(x));

    if (d.action === 'approve') {
      if (last.status === 'PAID') return { number: d.number, status: 'PAID', next: 'thanks' };
      if (!open) throw new CheckoutError('CART_NOT_OPEN', 'this payment is closed; try again makes a new one', ['action']);
      await tx.payment.update({ where: { id: last.id }, data: { status: 'PAID', paidAt: now, providerTrxId: `${MOCK_PROVIDER}-${randomBytes(6).toString('hex')}` } });
      await tx.order.update({ where: { id: o.id }, data: { paidMinor: o.paidMinor + last.amountMinor, flags: without(ORDER_FLAGS.paymentPending, ORDER_FLAGS.paymentFailed), version: { increment: 1 } } });
      await event(ORDER_EVENTS.paid, { amountMinor: last.amountMinor });
      return { number: d.number, status: 'PAID', next: 'thanks' };
    }
    if (d.action === 'fail') {
      if (last.status === 'FAILED') return { number: d.number, status: 'FAILED', next: 'thanks' };
      if (!open) throw new CheckoutError('CART_NOT_OPEN', 'this payment is closed', ['action']);
      await tx.payment.update({ where: { id: last.id }, data: { status: 'FAILED' } });
      await tx.order.update({ where: { id: o.id }, data: { flags: [...without(ORDER_FLAGS.paymentPending, ORDER_FLAGS.paymentFailed), ORDER_FLAGS.paymentFailed], version: { increment: 1 } } });
      await event(ORDER_EVENTS.failed, { amountMinor: last.amountMinor });
      const task = await tx.callTask.findFirst({ where: { storeId, orderId: o.id, reason: CALL_REASONS.paymentFailed, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
      if (!task) await tx.callTask.create({ data: { storeId, orderId: o.id, reason: CALL_REASONS.paymentFailed } });
      return { number: d.number, status: 'FAILED', next: 'thanks' };
    }
    // retry — never on a cancelled order (its payment was closed by the cancel, PR 144)
    if (o.status === 'CANCELLED') throw new CheckoutError('CART_NOT_OPEN', 'this order is cancelled', ['number']);
    if (open) return { number: d.number, status: 'INITIATED', next: 'pay' };
    if (last.status === 'PAID') return { number: d.number, status: 'PAID', next: 'thanks' };
    const tries = await tx.payment.count({ where: { storeId, orderId: o.id, purpose: 'ORDER' } });
    await tx.payment.create({
      data: { storeId, orderId: o.id, method: last.method, provider: last.provider, purpose: 'ORDER', status: 'INITIATED', amountMinor: last.amountMinor, currency: last.currency, idempotencyKey: `${o.idempotencyKey}:pay:${tries + 1}` },
    });
    await tx.order.update({ where: { id: o.id }, data: { flags: [...without(ORDER_FLAGS.paymentPending, ORDER_FLAGS.paymentFailed), ORDER_FLAGS.paymentPending], version: { increment: 1 } } });
    await event(ORDER_EVENTS.retry, { tries: tries + 1 });
    return { number: d.number, status: 'INITIATED', next: 'pay' };
  }, TX);
}

/** What the mock payment page shows: the order's number, what is to be paid now and how. */
export interface PayView {
  number: string;
  amountMinor: number;
  method: PaymentMethod;
  provider: string | null;
  status: 'INITIATED' | 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
}

export async function payView(deps: CheckoutDeps, req: { storeId: number; visitorId: string; number: string }): Promise<PayView | null> {
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: req.storeId, number: req.number } }, select: { id: true, number: true, visitorId: true } });
  if (!o || o.visitorId !== req.visitorId) return null;
  const p = await deps.db.payment.findFirst({ where: { storeId: req.storeId, orderId: o.id, purpose: 'ORDER', method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' } });
  if (!p || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'AUTHORIZED') return null;
  return { number: o.number, amountMinor: p.amountMinor, method: p.method, provider: p.provider, status: p.status };
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
