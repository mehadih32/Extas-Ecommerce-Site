// PR 115 — the checkout's quote: everything the page shows about money, in one read. PR 117 adds the address as the
// gazetteer read it (the place and band found, or the question to ask: `delivery`). The bag comes from @extas/cart
// (bagView: its lines, sets and the order summary priced by the rules and combos engines). Nothing here invents an
// amount: rows are added up from what the engines returned. The same function prices the page and the order (PR 125),
// so the order stores exactly what the customer saw (SIM-F-003); `fingerprint` names that money, so placement can tell
// when anything changed in between.
// PR 119 — the delivery charge: the owner's figure for the band the address was read as (S06, never a figure from the
// text), unless the rules engine makes delivery free (a campaign, the threshold, free-delivery products) — then the
// page shows one thing, "free", and no figure at all. Before an address the step shows the store's rates.
// PR 120 — the payment choice (payment.ts): the methods open on this order, Cash on Delivery only where the owner, the
// Smart Rules and the band's COD limit allow it, and the prepaid reward (free delivery, or an amount taken off the
// total) for any other method.
// PR 122 — the signed-in customer's wallet: his balance, and with "Use my wallet" ticked as much of it as the order
// needs comes off what he still pays (`dueMinor`); placement (PR 125) debits exactly that, in the same transaction.
// PR 561 — the silent backfill (address.ts): with the phone number the page sends, a line naming no place takes its
// band from the address the shop holds; the page sees the band and charge only.
// PR 605 — gift mode (`checkout.gift`): a gift checkout whose advance is the whole amount offers no Cash on Delivery
// (codOff GIFT); one whose advance is a part keeps it for the rest and says how much is taken ahead (`gift`).
import { createHash } from 'node:crypto';
import { bagView, emptyBag, type BagLang, type BagView } from '@extas/cart';
import { bandOut, loadBandMap, type AskReason, type BandMap, type BandOut } from '@extas/delivery';
import { deliveryDeps, placeName, readAddress, type AddressInput, type AddressRead, type PlaceName } from './address';
import { checkStoreId, parse, setting, type CheckoutDeps } from './context';
import { giftAdvanceOf } from './gift';
import { choosePayment, isPrepaid, paymentInputSchema, paySettings, rewardOf, rulesPaymentMethod, type PaymentInput, type PaymentView } from './payment';

export interface CheckoutRequest {
  storeId: number;
  cartId: string | null;
  lang: BagLang;
  /** The signed-in customer (members-only codes); null for a guest. */
  customerId?: string | null;
  /** PR 117: the finished address line (and the band the customer chose when asked); null before he wrote one. */
  address?: AddressInput | null;
  /** PR 120: the payment method he picked (null: the first open one). */
  payment?: PaymentInput | null;
  /** PR 122: "Use my wallet" is ticked (a signed-in customer with a balance only). */
  useWallet?: boolean;
  /** PR 561: the caller's IP, for the backfill's per-IP look-up limit. */
  ip?: string | null;
  /** PR 605: the checkout is a gift ("Send as a gift"); ignored while the owner has gift mode off. */
  gift?: boolean;
}

/** PR 605 — a gift checkout: how it is paid ahead (`checkout.gift.advance`). */
export interface GiftView {
  advance: 'none' | 'full' | 'part';
  /** The part taken ahead (`part` only). */
  partMinor: number | null;
}

/** PR 122 — the wallet on this order: the balance, whether he uses it, and how much comes off. */
export interface WalletView {
  balanceMinor: number;
  on: boolean;
  usedMinor: number;
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
  // PR 561: a band settled from the address the shop holds shows the band only — never that address's place
  if (a.status === 'resolved') return { state: 'found', band: a.read.band, place: a.read.via === 'saved' ? null : placeName(a.read.area), via: a.read.via, placeSure: a.read.placeSure };
  if (a.status === 'ask') return { state: 'ask', reason: a.read.reason, options: a.read.options.map((o) => ({ band: o.band, places: o.places.map((p) => placeName(p)!) })) };
  return { state: 'none' };
}

/** PR 119 — what delivery costs on this order. */
export type DeliveryCharge =
  /** The rules make it free: the page says so and shows no figure (demo #36). */
  | { state: 'free'; reason: FreeReason | 'PREPAID'; freeOverMinor: number | null }
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
  /** PR 120: the prepaid reward taken off the total (an amount or a percentage; free delivery shows as free delivery). */
  rewardMinor: number;
  /** PR 122: what the wallet pays of the total. */
  walletMinor: number;
  /** What is left to pay: the total less the wallet (on delivery for Cash on Delivery, now for the others). */
  dueMinor: number;
  /** Everything the offers, sets and the prepaid reward take off. */
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
  /** PR 120: the payment step — the open methods, the choice and what paying now earns. */
  pay: PaymentView;
  /** PR 122: the customer's wallet (null: no customer, no balance, or the wallet is off at checkout). */
  wallet: WalletView | null;
  /** PR 605: the gift checkout (null: not a gift, or gift mode is off). */
  gift: GiftView | null;
  /** A hash of every amount on the page: placement refuses an order whose money changed since the page showed it. */
  fingerprint: string;
}

const ZERO = 0;
/** The wallet status that can pay (S07 PR 171 owns the wallet's states). */
export const WALLET_ACTIVE = 'ACTIVE';

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
  pay: PaymentView;
  wallet: WalletView | null;
  gift: GiftView | null;
  fingerprint: string;
}

/** The checkout of no bag (no cookie, no database): the page shows the empty-bag card. */
export const emptyQuote = (): CheckoutQuote => {
  const totals: Totals = { itemsMinor: ZERO, deliveryMinor: null, totalMinor: ZERO, known: false, rewardMinor: ZERO, walletMinor: ZERO, dueMinor: ZERO, youSaveMinor: ZERO, regularMinor: ZERO };
  return {
    cartId: null,
    bag: emptyBag(),
    totals,
    delivery: { state: 'none' },
    charge: { state: 'unknown' },
    rates: [],
    freeGapMinor: null,
    address: { status: 'none' },
    pay: { cod: false, codOff: 'OFF', mobile: [], card: [], online: false, chosen: null, reward: null },
    wallet: null,
    gift: null,
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
    pay: q.pay,
    wallet: q.wallet,
    gift: q.gift,
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
  const asked = input.payment ? parse(paymentInputSchema, input.payment, 'payment') : null;
  const [address, map, ps, balance, giftCfg] = await Promise.all([
    readAddress(deps, input.storeId, input.address, { ip: input.ip ?? null }),
    loadBandMap(deliveryDeps(deps), input.storeId),
    paySettings(deps, input.storeId),
    walletBalance(deps, input.storeId, input.customerId ?? null),
    input.gift === true ? setting(deps, input.storeId, 'checkout.gift') : Promise.resolve(null),
  ]);
  const giftOn = giftCfg?.enabled ? giftCfg : null;
  // the band the customer pays as (a sub-area folded into the city is the city): rules on `delivery.band` see it
  const charged = address.status === 'resolved' ? address.line.quote.band : null;
  const bandCodLimit = charged ? (map.bandById(charged.id)?.codLimitMinor ?? null) : null;
  const priceBag = (method: string | null) =>
    input.cartId
      ? bagView(deps, { storeId: input.storeId, cartId: input.cartId, lang: input.lang, customerId: input.customerId ?? null, bandKey: charged?.key ?? null, paymentMethod: method })
      : Promise.resolve(emptyBag());

  // The choice, first as asked (Cash on Delivery while the owner's switch allows it), then checked against the rules
  // and the band's COD limit on the priced bag; a choice that moved prices the bag again for the rules on payment.
  let choice = choosePayment(asked, ps, ps.cod);
  let bag = await priceBag(rulesPaymentMethod(choice));
  const before = deliveryChargeOf(address, bag.free);
  const codTotal = bag.summary.totalMinor + (before.state === 'charge' ? before.chargeMinor : ZERO);
  const giftAhead = giftOn ? giftAdvanceOf(giftOn.advance, codTotal) : null;
  const codOff: PaymentView['codOff'] = !ps.cod
    ? 'OFF'
    : giftAhead?.kind === 'full'
      ? 'GIFT'
      : bag.cod.allowed === false
        ? 'RULE'
        : bandCodLimit !== null && codTotal > bandCodLimit
          ? 'BAND_LIMIT'
          : null;
  if (codOff) {
    const moved = choosePayment(asked, ps, false);
    if (rulesPaymentMethod(moved) !== rulesPaymentMethod(choice)) bag = await priceBag(rulesPaymentMethod(moved));
    choice = moved;
  }

  const delivery = deliveryViewOf(address);
  const s = bag.summary;
  const itemsMinor = s.totalMinor;
  let charge = deliveryChargeOf(address, bag.free);
  const reward = rewardOf(ps.reward, { itemsMinor, deliveryFree: charge.state === 'free', chargeMinor: charge.state === 'charge' ? charge.chargeMinor : null });
  let rewardMinor = ZERO;
  if (reward && isPrepaid(choice)) {
    if (reward.kind === 'freeDelivery') charge = { state: 'free', reason: 'PREPAID', freeOverMinor: null };
    else rewardMinor = reward.amountMinor;
  }
  const deliveryMinor = charge.state === 'free' ? ZERO : charge.state === 'charge' ? charge.chargeMinor : null;
  const totalMinor = itemsMinor + (deliveryMinor ?? ZERO) - rewardMinor;
  const prepaidFree = charge.state === 'free' && charge.reason === 'PREPAID' && reward?.kind === 'freeDelivery' ? (reward.amountMinor ?? ZERO) : ZERO;
  const youSaveMinor = s.youSaveMinor + rewardMinor + prepaidFree;
  const wallet: WalletView | null = balance > ZERO && itemsMinor > ZERO ? { balanceMinor: balance, on: input.useWallet === true, usedMinor: input.useWallet === true ? Math.min(balance, totalMinor) : ZERO } : null;
  const walletMinor = wallet?.usedMinor ?? ZERO;
  const totals: Totals = {
    itemsMinor,
    deliveryMinor,
    totalMinor,
    known: deliveryMinor !== null,
    rewardMinor,
    walletMinor,
    dueMinor: totalMinor - walletMinor,
    youSaveMinor,
    regularMinor: totalMinor + youSaveMinor,
  };
  const pay: PaymentView = { cod: codOff === null, codOff, mobile: ps.mobile, card: ps.card, online: ps.online, chosen: choice, reward };
  // PR 605: the part paid ahead is worked out on what is left to pay at the door
  const ahead = giftOn ? giftAdvanceOf(giftOn.advance, totals.dueMinor) : null;
  const gift: GiftView | null = ahead ? { advance: ahead.kind, partMinor: ahead.kind === 'part' && choice?.method === 'cod' ? ahead.amountMinor : null } : null;
  const fingerprint = fingerprintOf({
    rows: s.rows.map((r) => [r.lineId, r.quantity, r.amountMinor]),
    offers: s.offers.map((o) => [o.ruleKey, o.amountMinor]),
    totals,
    charge,
    pay: [choice?.method ?? null, reward?.kind ?? null],
    gift: gift ? [gift.advance, gift.partMinor] : null,
  });
  return {
    cartId: bag.cartId,
    bag,
    totals,
    delivery,
    charge,
    rates: ratesOf(map),
    freeGapMinor: bag.free.free ? null : bag.free.remainingMinor,
    address,
    pay,
    wallet,
    gift,
    fingerprint,
  };
}

/** The signed-in customer's usable wallet balance in this store (0 without a customer, or with the wallet off). */
async function walletBalance(deps: CheckoutDeps, storeId: number, customerId: string | null): Promise<number> {
  if (!customerId || !(await setting(deps, storeId, 'checkout.wallet.enabled'))) return ZERO;
  const w = await deps.db.walletAccount.findFirst({ where: { storeId, customerId, status: WALLET_ACTIVE }, select: { balanceMinor: true } });
  return Math.max(ZERO, w?.balanceMinor ?? ZERO);
}
