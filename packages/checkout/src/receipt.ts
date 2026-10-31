// PR 126 — the thank-you page's receipt (demo 52-thanks.js): the order as it was stored — its number, the band's
// delivery promise in hours, what is still to pay (Cash on Delivery due, paid, waiting for the payment, or a payment
// that failed), its lines and money. Only the browser that placed the order can read it (the bag cookie's visitor id):
// anyone else gets nothing, as if there were no such order. Names and colours are shown in the page's language (the
// order keeps the English snapshot; Bengali comes from the product as it is now, when it has one).
//
// PR 129: the account the order belongs to (made with this order, already there, or the signed-in customer's), for the
// "Your account is ready" card: the number to sign in with — never a password (SIM-F-039).
// PR 134: the order page of My account reads the same receipt — for the browser that placed it, or for the signed-in
// customer whose order it is (any of his devices) — with the order's stored state and times, the add-on mark of each
// line and the name it goes to.
// PR 135: the tracking page adds the courier and its tracking code of the order's booked shipment (as stored).
// PR 184: and the parcel's state, as the courier last told us (the courier news line).
// PR 407: and the courier's own consignment id, for the printed invoice's barcode.
// PR 136: the invoice adds each line's stored unit price, its stored saving and its SKU — read, never worked out again;
// and a staff member the caller has checked (the `orders.read` permission) reads any placed order of the store.
// PR 565: `freeDelivery` — a free order shows no band and no band promise (@extas/delivery bandExempt).
// SIM-F-048 (PR 550 follow-up): the band's hours are the district's own when the owner set them
// (`delivery.promise.districts`, off) — the thank-you page, the order page and its late flag read them from here.
// PR 605: `gift` — a gift order thanks the sender by his name; the name, phone and address are the receiver's; the
// invoice hides the prices when the sender asked for it.
import type { OrderAccountKind } from '@extas/accounts';
import { bandExempt } from '@extas/delivery/exempt';
import { districtHours, districtPromises, orderPromises } from '@extas/delivery/promise';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { CHECKOUT_PAY_PURPOSES } from './advance';
import type { CheckoutDeps } from './context';
import { checkoutEta } from '@extas/rules';
import { MOCK_PROVIDER, ORDER_EVENTS, type PaymentMethod } from './place';

export interface ReceiptLine {
  id: string;
  productId: string | null;
  nameEn: string;
  nameBn: string | null;
  colour: { key: string; hex: string; nameEn: string; nameBn: string | null } | null;
  size: string | null;
  quantity: number;
  /** What the line costs on this order (a set's piece: its share of the set price). */
  amountMinor: number;
  /** The set it belongs to, if any. */
  setKey: string | null;
  /** PR 134: added as an add-on (the bag's or the checkout's "add this too"). */
  isAddOn: boolean;
  /** PR 136: one piece's price on the order, as stored. */
  unitMinor: number;
  /** PR 136: what the line saves on its pieces' own price (a set's share of its saving), as stored. */
  lineDiscountMinor: number;
  /** PR 136: the stock code the line was sold as. */
  sku: string;
}

/** PR 134: when the order reached each stored state (null: not yet). Shown, never moved here (S05, CN-022). */
export interface ReceiptTimes {
  confirmedAt: string | null;
  packedAt: string | null;
  handedOverAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  returnedAt: string | null;
}

export type ReceiptPay =
  /** Cash on Delivery: this much to the rider. */
  | { kind: 'cod'; dueMinor: number }
  /** Nothing left to pay (the wallet paid it all, or the payment went through). */
  | { kind: 'paid'; paidMinor: number; method: PaymentMethod | null; provider: string | null; mock: boolean }
  /** A prepaid order still waiting for its payment ("Pay now"). */
  | { kind: 'due'; dueMinor: number; method: PaymentMethod | null; provider: string | null }
  /** The payment failed: the order is kept, "Try again". */
  | { kind: 'failed'; dueMinor: number; method: PaymentMethod | null; provider: string | null };

export interface Receipt {
  number: string;
  /** The first word of the name he typed ("Thank you, Rahim!"). */
  firstName: string;
  /** The phone as said back to him (01712-345678). */
  phone: string | null;
  address: string | null;
  /** The delivery note he wrote at checkout (PR 125), said back on the thank-you page (follow-up 58). */
  note: string | null;
  placedAt: string;
  /** The band the order is charged as, with its promise in hours (null: the address is being checked). */
  band: { nameEn: string; nameBn: string | null; hoursMin: number | null; hoursMax: number | null } | null;
  addressUnclear: boolean;
  chargeFixed: boolean;
  /** PR 565: the delivery was free — no band, no band promise, no "we call about the area" (@extas/delivery bandExempt). */
  freeDelivery: boolean;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  walletMinor: number;
  totalMinor: number;
  pay: ReceiptPay;
  /** PR 129: how the order found its account (null: no account, the owner switched the automatic one off). */
  account: OrderAccountKind | null;
  /** PR 134: the whole name it goes to. */
  name: string | null;
  /** PR 134: the order's stored state (Prisma OrderStatus) and its times. */
  status: string;
  times: ReceiptTimes;
  /** PR 135: the courier carrying it and its tracking code, once a shipment is booked (null before). */
  /** PR 184: `status` the parcel's state as the courier last told us (the order page's courier news, `account.track.courier`). */
  /** PR 407: `consignmentId` the courier's own consignment id (the invoice's barcode; null until the courier gives one). */
  shipment: { courier: string; tracking: string | null; consignmentId: string | null; status: string } | null;
  /** PR 605: a gift (null: an ordinary order) — the sender, the note, "deliver on or after" (YYYY-MM-DD), hidden prices. */
  gift: ReceiptGift | null;
}

/** PR 605: a gift order's own part of the receipt. */
export interface ReceiptGift {
  senderName: string;
  note: string | null;
  deliverAfter: string | null;
  hidePrices: boolean;
}

const ACCOUNT_KINDS: readonly OrderAccountKind[] = ['created', 'existing', 'signedIn'];

/**
 * The visitor's own order, as the thank-you page shows it; null for anyone else's, or no such order. PR 134: also the
 * signed-in customer's own order (`customerId`), from any device. PR 136: `staff` — the caller has checked that a staff
 * member with `orders.read` asks (the invoice for the shop's own use): any placed order of this store.
 */
export async function orderReceipt(
  deps: Pick<CheckoutDeps, 'db'> & { settings?: CheckoutDeps['settings'] },
  req: { storeId: number; visitorId: string | null; number: string; customerId?: string | null; staff?: boolean },
): Promise<Receipt | null> {
  const o = await deps.db.order.findUnique({
    where: { storeId_number: { storeId: req.storeId, number: req.number } },
    include: {
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      deliveryBand: { select: { nameEn: true, nameBn: true, hoursMin: true, hoursMax: true } },
      // PR 560: the checkout's own payment, the order's or its advance's
      payments: { where: { purpose: { in: CHECKOUT_PAY_PURPOSES }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
      events: { where: { type: ORDER_EVENTS.placed }, orderBy: { createdAt: 'asc' }, take: 1, select: { data: true } },
      shipments: { where: { isExchangeLeg: false }, orderBy: { createdAt: 'desc' }, take: 1, select: { trackingCode: true, consignmentId: true, status: true, courierAccount: { select: { name: true } } } },
    },
  });
  const placedHere = !!req.visitorId && o?.visitorId === req.visitorId;
  // his account's order: a placed one (a started checkout's draft is not an order yet), not archived
  const his = !!req.customerId && o?.customerId === req.customerId && o.status !== 'DRAFT' && !o.archivedAt;
  const staff = req.staff === true && o?.status !== 'DRAFT';
  if (!o || !(placedHere || his || staff)) return null;
  const variants = await deps.db.productVariant.findMany({
    where: { storeId: req.storeId, id: { in: o.items.map((i) => i.variantId).filter((x): x is string => !!x) } },
    select: { id: true, product: { select: { nameBn: true } }, colour: { select: { key: true, hex: true, nameEn: true, nameBn: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const promise = deps.settings && o.deliveryBand && o.areaId ? await districtPromises({ db: deps.db, settings: deps.settings }, req.storeId, [o.areaId]) : null;
  const lines: ReceiptLine[] = o.items.map((i) => {
    const v = i.variantId ? byId.get(i.variantId) : undefined;
    return {
      id: i.id,
      productId: i.productId,
      nameEn: i.productName,
      nameBn: v?.product.nameBn ?? null,
      colour: v?.colour ? { ...v.colour } : i.colourName ? { key: '', hex: '', nameEn: i.colourName, nameBn: null } : null,
      size: i.sizeLabel,
      quantity: i.quantity,
      amountMinor: i.lineTotalMinor,
      setKey: i.comboGroupKey,
      isAddOn: i.isAddOn,
      unitMinor: i.unitPriceMinor,
      lineDiscountMinor: i.discountMinor,
      sku: i.sku,
    };
  });
  const due = Math.max(0, o.totalMinor - o.walletAppliedMinor - o.paidMinor);
  const last = o.payments[0] ?? null;
  const pay: ReceiptPay =
    o.paymentMethod === 'COD'
      ? { kind: 'cod', dueMinor: o.codAmountMinor }
      : due === 0
        ? { kind: 'paid', paidMinor: o.paidMinor, method: o.paymentMethod, provider: last?.provider ?? null, mock: last?.providerTrxId?.startsWith(`${MOCK_PROVIDER}-`) ?? false }
        : last?.status === 'FAILED' || last?.status === 'CANCELLED'
          ? { kind: 'failed', dueMinor: due, method: o.paymentMethod, provider: last.provider }
          : { kind: 'due', dueMinor: due, method: o.paymentMethod, provider: last?.provider ?? null };
  const phone = phoneNormalizeBD(o.phone ?? '');
  const placed = o.events[0]?.data as { account?: unknown } | null | undefined;
  const kind = ACCOUNT_KINDS.find((k) => k === placed?.account) ?? null;
  const gift: ReceiptGift | null = o.isGift
    ? { senderName: o.giftSenderName ?? '', note: o.giftNote, deliverAfter: o.giftDeliverAfter?.toISOString().slice(0, 10) ?? null, hidePrices: o.giftHidePrices }
    : null;
  return {
    account: o.customerId ? kind : null,
    name: o.customerName,
    status: o.status,
    times: {
      confirmedAt: o.confirmedAt?.toISOString() ?? null,
      packedAt: o.packedAt?.toISOString() ?? null,
      handedOverAt: o.handedOverAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      returnedAt: o.returnedAt?.toISOString() ?? null,
    },
    shipment: o.shipments[0] ? { courier: o.shipments[0].courierAccount.name, tracking: o.shipments[0].trackingCode ?? o.shipments[0].consignmentId, consignmentId: o.shipments[0].consignmentId, status: o.shipments[0].status } : null,
    number: o.number,
    firstName: ((gift ? gift.senderName : o.customerName) ?? '').trim().split(/\s+/)[0] ?? '',
    phone: phone.ok ? phone.nice : o.phone,
    address: o.shippingAddressText,
    note: o.note?.trim() || null,
    placedAt: o.placedAt.toISOString(),
    band: o.deliveryBand && promise ? districtHours(promise.config, o.areaId ? promise.districtOf.get(o.areaId) : null, o.deliveryBand) : o.deliveryBand,
    addressUnclear: o.addressUnclear,
    chargeFixed: o.chargeFixed,
    freeDelivery: bandExempt(o.addressResolution),
    lines,
    subtotalMinor: o.subtotalMinor,
    discountMinor: o.discountMinor,
    deliveryMinor: o.deliveryChargeMinor,
    walletMinor: o.walletAppliedMinor,
    totalMinor: o.totalMinor,
    pay,
    gift,
  };
}

/**
 * PR 193 — what the thank-you page says about when this order comes, as the checkout said it when he placed it (the
 * clock is the order's own `placedAt`): "ships from …" placed during the shop's holiday, "may arrive after Eid" placed
 * past its place's Eid date (SIM-F-019). Empty: the usual hours promise stands. Read for an order the caller already
 * showed him (orderReceipt decided that).
 */
export async function receiptEta(deps: Pick<CheckoutDeps, 'db' | 'settings' | 'now'>, storeId: number, number: string, lang: 'en' | 'bn'): Promise<string[]> {
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId, number } }, select: { placedAt: true, areaId: true, addressResolution: true, deliveryBand: { select: { key: true } } } });
  if (!o) return [];
  const res = o.addressResolution as { band?: unknown } | null;
  const band = typeof res?.band === 'string' ? res.band : (o.deliveryBand?.key ?? null);
  const eta = await checkoutEta(deps, storeId, { place: band ? { band, areaId: o.areaId } : null, locale: lang === 'bn' ? 'bn-BD' : 'en-BD', at: o.placedAt });
  return eta.lines;
}

/**
 * Review R3 (customer M3) — the promise his order page counts "late" against: the same clock as the courier's late flag
 * (@extas/delivery orderPromises) — the district's hours, from the shop's first day back for an order placed during the
 * holiday break; none ("may arrive after Eid") past its place's Eid date. Null: no such order, or no band.
 */
export async function receiptPromise(deps: Pick<CheckoutDeps, 'db' | 'settings'>, storeId: number, number: string): Promise<{ from: string; hoursMax: number | null; afterEid: boolean } | null> {
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId, number } }, select: { id: true, placedAt: true, areaId: true, deliveryBand: { select: { key: true, hoursMin: true, hoursMax: true } } } });
  if (!o?.deliveryBand) return null;
  const p = (await orderPromises(deps, storeId, [{ id: o.id, placedAt: o.placedAt, areaId: o.areaId, band: o.deliveryBand }])).get(o.id);
  return p ? { from: p.from.toISOString(), hoursMax: p.afterEid ? null : p.hoursMax, afterEid: p.afterEid } : null;
}
