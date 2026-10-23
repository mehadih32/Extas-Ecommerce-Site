// PR 115 — the checkout's quote: everything the page shows about money, in one read. The bag comes from @extas/cart
// (bagView: its lines, sets and the order summary priced by the rules and combos engines). Nothing here invents an
// amount: rows are added up from what the engines returned. The same function prices the page and the order (PR 125),
// so the order stores exactly what the customer saw (SIM-F-003); `fingerprint` names that money, so placement can tell
// when anything changed in between.
import { createHash } from 'node:crypto';
import { bagView, emptyBag, type BagLang, type BagView } from '@extas/cart';
import { checkStoreId, type CheckoutDeps } from './context';

export interface CheckoutRequest {
  storeId: number;
  cartId: string | null;
  lang: BagLang;
  /** The signed-in customer (members-only codes); null for a guest. */
  customerId?: string | null;
}

export interface Totals {
  /** What the items cost after the engines' offers (the bag's total). */
  itemsMinor: number;
  /** Delivery: 0 when free, null while not known (the page says "+ delivery"). */
  deliveryMinor: number | null;
  /** What the customer pays in all. */
  totalMinor: number;
  /** False while the delivery charge is not known: the total does not include it yet. */
  known: boolean;
  /** Everything the offers and sets take off. */
  youSaveMinor: number;
  /** The price before every discount (struck beside the total when something is saved). */
  regularMinor: number;
}

export interface CheckoutQuote {
  cartId: string | null;
  bag: BagView;
  totals: Totals;
  /** A hash of every amount on the page: placement refuses an order whose money changed since the page showed it. */
  fingerprint: string;
}

const ZERO = 0;

/** The summary as the page's client part gets it (no database rows, nothing but what is shown). */
export interface CheckoutView {
  cartId: string | null;
  count: number;
  rows: BagView['summary']['rows'];
  offers: BagView['summary']['offers'];
  subtotalMinor: number;
  totals: Totals;
  fingerprint: string;
}

/** The checkout of no bag (no cookie, no database): the page shows the empty-bag card. */
export const emptyQuote = (): CheckoutQuote => {
  const totals: Totals = { itemsMinor: ZERO, deliveryMinor: null, totalMinor: ZERO, known: false, youSaveMinor: ZERO, regularMinor: ZERO };
  return { cartId: null, bag: emptyBag(), totals, fingerprint: fingerprintOf({ totals }) };
};

/** What the client part of the page needs from a quote. */
export function viewOf(q: CheckoutQuote): CheckoutView {
  const s = q.bag.summary;
  return { cartId: q.cartId, count: s.count, rows: s.rows, offers: s.offers, subtotalMinor: s.subtotalMinor, totals: q.totals, fingerprint: q.fingerprint };
}

/** The fingerprint of the money a quote shows. */
export function fingerprintOf(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** The checkout's quote for a bag. */
export async function checkoutQuote(deps: CheckoutDeps, input: CheckoutRequest): Promise<CheckoutQuote> {
  checkStoreId(input.storeId);
  const bag = input.cartId ? await bagView(deps, { storeId: input.storeId, cartId: input.cartId, lang: input.lang, customerId: input.customerId ?? null }) : emptyBag();
  const s = bag.summary;
  const itemsMinor = s.totalMinor;
  const deliveryMinor = s.freeDelivery ? ZERO : null;
  const totalMinor = itemsMinor + (deliveryMinor ?? ZERO);
  const totals: Totals = {
    itemsMinor,
    deliveryMinor,
    totalMinor,
    known: deliveryMinor !== null,
    youSaveMinor: s.youSaveMinor,
    regularMinor: totalMinor + s.youSaveMinor,
  };
  const fingerprint = fingerprintOf({ rows: s.rows.map((r) => [r.lineId, r.quantity, r.amountMinor]), offers: s.offers.map((o) => [o.ruleKey, o.amountMinor]), totals });
  return { cartId: bag.cartId, bag, totals, fingerprint };
}
