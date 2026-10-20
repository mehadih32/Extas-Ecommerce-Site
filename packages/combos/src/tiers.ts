// PR 99 — the set tiers' price for what a customer has picked, pure (the set builder's live numbers in the browser, and
// the server's summary). The tiers come from Smart Rules (`setTier`, S10 · PR 212) and the grouping is the engine's
// own (`bestTierGrouping`): the dearest pieces go into sets, the cheapest stay single — so what the builder says is
// what the bag charges. A tier without a price is not offered. The "was" here is only ever the sum of the separate
// prices (CN-009).
import { bestTierGrouping } from '@extas/rules/pure';
import { eachMinor } from './model';

export interface PricedTier {
  quantity: number;
  priceMinor: number;
}

export interface TierQuote {
  /** Pieces picked. */
  count: number;
  /** The separate prices added up. */
  regularMinor: number;
  /** What the picks cost with the best grouping (never more than `regularMinor`). */
  payMinor: number;
  savingMinor: number;
  /** The largest tier the picks reach (null = no set price yet, or it would not be lower than the separate prices). */
  applied: PricedTier | null;
  /** The next tier up, and how many more pieces reach it (null = the best set price is unlocked). */
  next: (PricedTier & { more: number }) | null;
  /** The smallest set and the largest (the builder's "pick at least …" and its limit). */
  min: number | null;
  max: number | null;
  tiers: PricedTier[];
}

/** Only the priced tiers, smallest first; one per quantity (the first priced wins). */
export function pricedTiers(tiers: readonly { quantity: number; priceMinor: number | null }[]): PricedTier[] {
  const seen = new Set<number>();
  const out: PricedTier[] = [];
  for (const t of [...tiers].sort((a, b) => a.quantity - b.quantity)) {
    if (t.priceMinor === null || !Number.isInteger(t.priceMinor) || t.priceMinor < 0 || seen.has(t.quantity)) continue;
    seen.add(t.quantity);
    out.push({ quantity: t.quantity, priceMinor: t.priceMinor });
  }
  return out;
}

/** The picks priced by the tiers (each pick is one piece at its own price). */
export function tierQuote(piecePricesMinor: readonly number[], tiers: readonly { quantity: number; priceMinor: number | null }[]): TierQuote {
  const priced = pricedTiers(tiers);
  const prices = piecePricesMinor.filter((p) => Number.isFinite(p) && p >= 0);
  const regularMinor = prices.reduce((s, p) => s + p, 0);
  const count = prices.length;
  let payMinor = regularMinor;
  if (priced.length && count >= priced[0]!.quantity) {
    const { paid } = bestTierGrouping([...prices], priced);
    payMinor = Math.min(regularMinor, paid.reduce((s, p) => s + p, 0));
  }
  let applied: PricedTier | null = null;
  let next: TierQuote['next'] = null;
  for (const t of priced) {
    if (t.quantity <= count) applied = t;
    else if (!next) next = { ...t, more: t.quantity - count };
  }
  return {
    count,
    regularMinor,
    payMinor,
    savingMinor: regularMinor - payMinor,
    applied: payMinor < regularMinor ? applied : null,
    next,
    min: priced[0]?.quantity ?? null,
    max: priced[priced.length - 1]?.quantity ?? null,
    tiers: priced,
  };
}

/** "৳X each" for a tier box (display only, the same rounding as every other "each" — model.ts `eachMinor`). */
export const tierEachMinor = (t: PricedTier) => eachMinor(t.priceMinor, t.quantity);
