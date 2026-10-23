// PR 126 — the thank-you page's receipt (demo 52-thanks.js): the order as it was stored — its number, the band's
// delivery promise in hours, what is still to pay (Cash on Delivery due, paid, waiting for the payment, or a payment
// that failed), its lines and money. Only the browser that placed the order can read it (the bag cookie's visitor id):
// anyone else gets nothing, as if there were no such order. Names and colours are shown in the page's language (the
// order keeps the English snapshot; Bengali comes from the product as it is now, when it has one).
import { phoneNormalizeBD } from '@extas/delivery/phone';
import type { CheckoutDeps } from './context';
import { MOCK_PROVIDER, type PaymentMethod } from './place';

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
}

/** The visitor's own order, as the thank-you page shows it; null for anyone else's, or no such order. */
export async function orderReceipt(deps: Pick<CheckoutDeps, 'db'>, req: { storeId: number; visitorId: string; number: string }): Promise<Receipt | null> {
  const o = await deps.db.order.findUnique({
    where: { storeId_number: { storeId: req.storeId, number: req.number } },
    include: {
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      deliveryBand: { select: { nameEn: true, nameBn: true, hoursMin: true, hoursMax: true } },
      payments: { where: { purpose: 'ORDER', method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!o || o.visitorId !== req.visitorId) return null;
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
  return {
    number: o.number,
    firstName: (o.customerName ?? '').trim().split(/\s+/)[0] ?? '',
    phone: phone.ok ? phone.nice : o.phone,
    address: o.shippingAddressText,
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
