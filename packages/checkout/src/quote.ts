// PR 115 — the checkout's quote: everything the page shows about money, in one read. PR 117 adds the address as the
// gazetteer read it (the place and band found, or the question to ask: `delivery`). The bag comes from @extas/cart
// (bagView: its lines, sets and the order summary priced by the rules and combos engines). Nothing here invents an
// amount: rows are added up from what the engines returned. The same function prices the page and the order (PR 125),
// so the order stores exactly what the customer saw (SIM-F-003); `fingerprint` names that money, so placement can tell
// when anything changed in between.
// PR 119 — the delivery charge: the owner's figure for the band the address was read as (S06, never a figure from the
// text), unless the rules engine makes delivery free (a campaign, the threshold, free-delivery products) — then the
// page shows one thing, "free", and no figure at all. Before an address the step shows the store's rates.
import { createHash } from 'node:crypto';
import { bagView, emptyBag, type BagLang, type BagView } from '@extas/cart';
import { bandOut, loadBandMap, type AskReason, type BandMap, type BandOut } from '@extas/delivery';
import { deliveryDeps, placeName, readAddress, type AddressInput, type AddressRead, type PlaceName } from './address';
import { checkStoreId, type CheckoutDeps } from './context';

export interface CheckoutRequest {
  storeId: number;
  cartId: string | null;
  lang: BagLang;
  /** The signed-in customer (members-only codes); null for a guest. */
  customerId?: string | null;
  /** PR 117: the finished address line (and the band the customer chose when asked); null before he wrote one. */
  address?: AddressInput | null;
}

/** The delivery step as the page draws it (PR 117–119). */
export type DeliveryView =
  /** No finished address yet. */
  | { state: 'none' }
  /** The gazetteer found the place: its band (and the place itself, when the line named one). */
  | { state: 'found'; band: BandOut; place: PlaceName | null; via: 'line' | 'saved' | 'choice'; placeSure: boolean }
  /** Nothing settles it: the customer is asked which band, never guessed for. */
  | { state: 'ask'; reason: AskReason; options: { band: BandOut; places: PlaceName[] }[] };

/** The page's delivery step from the address read. */
export function deliveryViewOf(a: AddressRead): DeliveryView {
  if (a.status === 'resolved') return { state: 'found', band: a.read.band, place: placeName(a.read.area), via: a.read.via, placeSure: a.read.placeSure };
  if (a.status === 'ask') return { state: 'ask', reason: a.read.reason, options: a.read.options.map((o) => ({ band: o.band, places: o.places.map((p) => placeName(p)!) })) };
  return { state: 'none' };
}

/** PR 119 — what delivery costs on this order. */
export type DeliveryCharge =
  /** The rules make it free: the page says so and shows no figure (demo #36). */
  | { state: 'free'; reason: FreeReason; freeOverMinor: number | null }
  /** The owner's figure for the band the address was read as. */
  | { state: 'charge'; chargeMinor: number }
  /** The band has no charge yet (switched off): the order is taken and the charge is confirmed on the call. */
  | { state: 'not-set' }
  /** No settled address yet: the total says "+ delivery". */
  | { state: 'unknown' };

export const FREE_REASONS = ['FREE_OVER', 'FREE_CAMPAIGN', 'FREE_PRODUCTS'] as const;
export type FreeReason = (typeof FREE_REASONS)[number];

/** The charge from the address read and the rules' free-delivery answer. */
export function deliveryChargeOf(address: AddressRead, free: BagView['free']): DeliveryCharge {
  if (free.free) return { state: 'free', reason: (FREE_REASONS as readonly string[]).includes(free.reason) ? (free.reason as FreeReason) : 'FREE_CAMPAIGN', freeOverMinor: free.freeOverMinor };
  if (address.status !== 'resolved') return { state: 'unknown' };
  const q = address.line.quote;
  return q.kind === 'charge' ? { state: 'charge', chargeMinor: q.chargeMinor } : { state: 'not-set' };
}

/** The store's city and outside bands as the customer sees them (the rates line before an address, the promise). */
export function ratesOf(map: BandMap): BandOut[] {
  return map.bands.filter((b) => b.enabled && ['city', 'outside'].includes(map.roleOf(b))).map((b) => bandOut(map, b));
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
  delivery: DeliveryView;
  /** PR 119: what delivery costs (free, the band's figure, not set yet, or not known before an address). */
  charge: DeliveryCharge;
  /** PR 119: the priced city and outside bands (the rates line before an address). */
  rates: BandOut[];
  /** How much more in the bag makes delivery free (null: no threshold, or already free). */
  freeGapMinor: number | null;
  /** The address read the order keeps (the ResolvedArea the charge comes from); `none` before an address. */
  address: AddressRead;
  /** The charged band's own COD limit (S06), for the payment step (PR 120); null = none. */
  bandCodLimitMinor: number | null;
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
  delivery: DeliveryView;
  charge: DeliveryCharge;
  rates: BandOut[];
  freeGapMinor: number | null;
  fingerprint: string;
}

/** The checkout of no bag (no cookie, no database): the page shows the empty-bag card. */
export const emptyQuote = (): CheckoutQuote => {
  const totals: Totals = { itemsMinor: ZERO, deliveryMinor: null, totalMinor: ZERO, known: false, youSaveMinor: ZERO, regularMinor: ZERO };
  return {
    cartId: null,
    bag: emptyBag(),
    totals,
    delivery: { state: 'none' },
    charge: { state: 'unknown' },
    rates: [],
    freeGapMinor: null,
    address: { status: 'none' },
    bandCodLimitMinor: null,
    fingerprint: fingerprintOf({ totals }),
  };
};

/** What the client part of the page needs from a quote. */
export function viewOf(q: CheckoutQuote): CheckoutView {
  const s = q.bag.summary;
  return {
    cartId: q.cartId,
    count: s.count,
    rows: s.rows,
    offers: s.offers,
    subtotalMinor: s.subtotalMinor,
    totals: q.totals,
    delivery: q.delivery,
    charge: q.charge,
    rates: q.rates,
    freeGapMinor: q.freeGapMinor,
    fingerprint: q.fingerprint,
  };
}

/** The fingerprint of the money a quote shows. */
export function fingerprintOf(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** The checkout's quote for a bag. */
export async function checkoutQuote(deps: CheckoutDeps, input: CheckoutRequest): Promise<CheckoutQuote> {
  checkStoreId(input.storeId);
  const [address, map] = await Promise.all([readAddress(deps, input.storeId, input.address), loadBandMap(deliveryDeps(deps), input.storeId)]);
  // the band the customer pays as (a sub-area folded into the city is the city): rules on `delivery.band` see it
  const charged = address.status === 'resolved' ? address.line.quote.band : null;
  const bag = input.cartId
    ? await bagView(deps, { storeId: input.storeId, cartId: input.cartId, lang: input.lang, customerId: input.customerId ?? null, bandKey: charged?.key ?? null })
    : emptyBag();
  const delivery = deliveryViewOf(address);
  const charge = deliveryChargeOf(address, bag.free);
  const s = bag.summary;
  const itemsMinor = s.totalMinor;
  const deliveryMinor = charge.state === 'free' ? ZERO : charge.state === 'charge' ? charge.chargeMinor : null;
  const totalMinor = itemsMinor + (deliveryMinor ?? ZERO);
  const totals: Totals = {
    itemsMinor,
    deliveryMinor,
    totalMinor,
    known: deliveryMinor !== null,
    youSaveMinor: s.youSaveMinor,
    regularMinor: totalMinor + s.youSaveMinor,
  };
  const fingerprint = fingerprintOf({ rows: s.rows.map((r) => [r.lineId, r.quantity, r.amountMinor]), offers: s.offers.map((o) => [o.ruleKey, o.amountMinor]), totals, charge });
  return {
    cartId: bag.cartId,
    bag,
    totals,
    delivery,
    charge,
    rates: ratesOf(map),
    freeGapMinor: bag.free.free ? null : bag.free.remainingMinor,
    address,
    bandCodLimitMinor: charged ? (map.bandById(charged.id)?.codLimitMinor ?? null) : null,
    fingerprint,
  };
}
