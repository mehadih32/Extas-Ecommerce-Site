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
import type { OrderAccountKind } from '@extas/accounts';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import type { CheckoutDeps } from './context';
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
}

const ACCOUNT_KINDS: readonly OrderAccountKind[] = ['created', 'existing', 'signedIn'];

/**
 * The visitor's own order, as the thank-you page shows it; null for anyone else's, or no such order. PR 134: also the
 * signed-in customer's own order (`customerId`), from any device.
 */
export async function orderReceipt(deps: Pick<CheckoutDeps, 'db'>, req: { storeId: number; visitorId: string | null; number: string; customerId?: string | null }): Promise<Receipt | null> {
  const o = await deps.db.order.findUnique({
    where: { storeId_number: { storeId: req.storeId, number: req.number } },
    include: {
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      deliveryBand: { select: { nameEn: true, nameBn: true, hoursMin: true, hoursMax: true } },
      payments: { where: { purpose: 'ORDER', method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
      events: { where: { type: ORDER_EVENTS.placed }, orderBy: { createdAt: 'asc' }, take: 1, select: { data: true } },
    },
  });
  const placedHere = !!req.visitorId && o?.visitorId === req.visitorId;
  // his account's order: a placed one (a started checkout's draft is not an order yet), not archived
  const his = !!req.customerId && o?.customerId === req.customerId && o.status !== 'DRAFT' && !o.archivedAt;
  if (!o || !(placedHere || his)) return null;
  const variants = await deps.db.productVariant.findMany({
    where: { storeId: req.storeId, id: { in: o.items.map((i) => i.variantId).filter((x): x is string => !!x) } },
    select: { id: true, product: { select: { nameBn: true } }, colour: { select: { key: true, hex: true, nameEn: true, nameBn: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
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
    number: o.number,
    firstName: (o.customerName ?? '').trim().split(/\s+/)[0] ?? '',
    phone: phone.ok ? phone.nice : o.phone,
    address: o.shippingAddressText,
    note: o.note?.trim() || null,
    placedAt: o.placedAt.toISOString(),
    band: o.deliveryBand,
    addressUnclear: o.addressUnclear,
    chargeFixed: o.chargeFixed,
    lines,
    subtotalMinor: o.subtotalMinor,
    discountMinor: o.discountMinor,
    deliveryMinor: o.deliveryChargeMinor,
    walletMinor: o.walletAppliedMinor,
    totalMinor: o.totalMinor,
    pay,
  };
}
