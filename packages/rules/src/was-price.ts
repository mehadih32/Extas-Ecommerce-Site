// PR 213 — the honesty guard on a struck "was" price next to a rule's offer (Blueprint D1.7; the catalogue's PR 38 rule).
// The owner's answer (CN-009, ROUND15 Note 52): "real MRP on single items where it exists; combos show the sum of the
// separate prices; never invented". So a struck price shows only when every one of these holds:
//   - struck prices are switched on in the backend (`rules.discount.showWasPrice`, off until the owner switches it on)
//     and the rule itself asks for it (`showWas`; a set tier always may);
//   - the rule is live now;
//   - the struck price is real:
//       · a single item: its MRP (the variant's list price, compare-at) where it exists. Only when the item has no
//         MRP may the price it really sold at before the offer stand in — the LOWEST price in force during the
//         `rules.discount.wasLookbackDays` before the offer started (from the automatic price history), and only for
//         an offer with a real end date — so a price raised just before a sale never shows as a saving;
//       · a set / combo (PR 212): the sum of the pieces' own separate prices;
//   - and it is above what the customer pays.
// It never makes a number up: with no MRP and no history there is no struck price.
//
// Pure module.
export type DiscountWasReason = 'SHOWN' | 'NOT_CHOSEN' | 'OFF' | 'NO_END_DATE' | 'NOT_LIVE' | 'NO_HISTORY' | 'NOT_HIGHER' | 'NO_PRICE';

/** Where a shown struck price comes from. */
export type WasSource = 'MRP' | 'PRICE_HISTORY' | 'COMBO';

export interface DiscountWasInput {
  /** rules.discount.showWasPrice — null or false = not switched on (no struck price). */
  allowed: boolean | null;
  /** The rule's own `showWas`. */
  showWas: boolean;
  startsAt: string | null;
  endsAt: string | null;
  live: boolean;
  /** The variant's price with this discount. */
  discountedMinor: number;
  /** The variant's MRP (list price, compare-at); null = it has none. */
  mrpMinor: number | null;
  /** The variant's recorded prices, any order. */
  history: { priceMinor: number; effectiveFrom: Date }[];
  lookbackDays: number;
  now: Date;
}

export interface DiscountWasResult {
  wasMinor: number | null;
  reason: DiscountWasReason;
  source: WasSource | null;
}

const DAY_MS = 86_400_000;
const no = (reason: DiscountWasReason): DiscountWasResult => ({ wasMinor: null, reason, source: null });
const shown = (wasMinor: number, source: WasSource): DiscountWasResult => ({ wasMinor, reason: 'SHOWN', source });

/** A single item's struck price under a discount. */
export function discountWasPrice(i: DiscountWasInput): DiscountWasResult {
  if (i.allowed !== true) return no('NOT_CHOSEN');
  if (!i.showWas) return no('OFF');
  if (!i.live) return no('NOT_LIVE');
  // The MRP, where it exists, is the only "was" a single item shows.
  if (i.mrpMinor !== null) return i.mrpMinor > i.discountedMinor ? shown(i.mrpMinor, 'MRP') : no('NOT_HIGHER');
  if (!i.endsAt) return no('NO_END_DATE');
  const start = i.startsAt ? new Date(i.startsAt) : i.now;
  const from = new Date(start.getTime() - i.lookbackDays * DAY_MS);
  const h = [...i.history].filter((r) => r.effectiveFrom <= start).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  if (!h.length) return no('NO_HISTORY');
  // Prices in effect during [from, start]: the one in effect at `from`, and every one that began after it.
  const inForce = h.filter((r, idx) => r.effectiveFrom >= from || (h[idx + 1]?.effectiveFrom ?? start) > from);
  if (!inForce.length) return no('NO_HISTORY');
  const lowest = Math.min(...inForce.map((r) => r.priceMinor));
  return lowest > i.discountedMinor ? shown(lowest, 'PRICE_HISTORY') : no('NOT_HIGHER');
}

export interface SetWasInput {
  allowed: boolean | null;
  live: boolean;
  /** The pieces in the sets at their own separate prices (the engine's `separateMinor`); null = a piece has no price. */
  separateMinor: number | null;
  /** What the sets cost. */
  setMinor: number;
}

/** A set's or combo's struck price: the sum of the pieces' separate prices, when it is above the set price. */
export function setWasPrice(i: SetWasInput): DiscountWasResult {
  if (i.allowed !== true) return no('NOT_CHOSEN');
  if (!i.live) return no('NOT_LIVE');
  if (i.separateMinor === null) return no('NO_PRICE');
  return i.separateMinor > i.setMinor ? shown(i.separateMinor, 'COMBO') : no('NOT_HIGHER');
}
