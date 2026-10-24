// PR 98, 100 — "Build your own set", pure (safe in the browser): the customer's picks are slots in the order they were
// put in, each one piece of one variant; a set tier rule (Smart Rules `setTier`, read by PR 99) says how many pieces
// make a set and what each set costs. This is the one check the page runs live and the server runs again inside the
// bag's write (builder.ts): every pick in the group and on sale, no more pieces of a variant than can be sold
// counting what the bag already holds (the audit's oversell bug), between the smallest and the largest set; and the
// price is `tierQuote`'s — the same grouping the bag's rules engine uses, so the builder says what the bag charges.
import { tierQuote, type PricedTier, type TierQuote } from './tiers';

export interface BuildVariant {
  id: string;
  productId: string;
  colourId: string | null;
  sizeId: string | null;
  /** Pieces that can be sold now. */
  sellable: number;
  priceMinor: number | null;
}

export const BUILD_PROBLEMS = ['NOT_ON', 'TOO_FEW', 'TOO_MANY', 'NOT_IN_GROUP', 'NO_PRICE', 'SOLD_OUT', 'NOT_ENOUGH'] as const;
export type BuildProblemCode = (typeof BUILD_PROBLEMS)[number];

export interface BuildProblem {
  code: BuildProblemCode;
  /** The pick it is about (0-based; null = the whole set). */
  pick: number | null;
  /** NOT_ENOUGH: pieces that can be had, what the set asks of that variant, and what the bag already holds. TOO_FEW /
   * TOO_MANY: the smallest or largest set (`need`). */
  stock?: number;
  need?: number;
  inBag?: number;
}

export interface BuildCheckInput {
  /** The picks, one variant id per piece, in the order they were put in. */
  picks: readonly string[];
  /** Every variant of the group's products. */
  variants: readonly BuildVariant[];
  tiers: readonly PricedTier[];
  /** Pieces of each variant already in the customer's bag. */
  inBag?: Readonly<Record<string, number>>;
  /** The builder is open and the rule live. */
  on: boolean;
  /** The bag's most pieces of one item (`inventory.reservation.maxUnitsPerLine`). */
  maxPerLine?: number;
}

export interface BuildCheck {
  ok: boolean;
  problems: BuildProblem[];
  first: BuildProblem | null;
  /** The set price of the picks that can be priced. */
  quote: TierQuote;
  min: number | null;
  max: number | null;
}

/** How many pieces of a variant can be had now (stock, and the bag's limit per item). */
const limitOf = (v: BuildVariant, maxPerLine?: number) => Math.max(0, Math.min(v.sellable, maxPerLine ?? Number.POSITIVE_INFINITY));

export function checkBuild(input: BuildCheckInput): BuildCheck {
  const byId = new Map(input.variants.map((v) => [v.id, v]));
  const inBag = input.inBag ?? {};
  const problems: BuildProblem[] = [];
  const min = input.tiers.length ? Math.min(...input.tiers.map((t) => t.quantity)) : null;
  const max = input.tiers.length ? Math.max(...input.tiers.map((t) => t.quantity)) : null;
  if (!input.on || min === null) problems.push({ code: 'NOT_ON', pick: null });
  const used = new Map<string, number>();
  const prices: number[] = [];
  input.picks.forEach((id, i) => {
    const v = byId.get(id);
    if (!v) return void problems.push({ code: 'NOT_IN_GROUP', pick: i });
    if (v.priceMinor === null) return void problems.push({ code: 'NO_PRICE', pick: i });
    prices.push(v.priceMinor);
    const n = (used.get(id) ?? 0) + 1;
    used.set(id, n);
    const held = inBag[id] ?? 0;
    const limit = limitOf(v, input.maxPerLine);
    if (v.sellable <= 0) problems.push({ code: 'SOLD_OUT', pick: i });
    else if (n + held > limit) problems.push({ code: 'NOT_ENOUGH', pick: i, stock: limit, need: n, inBag: held });
  });
  if (min !== null && input.picks.length < min) problems.push({ code: 'TOO_FEW', pick: null, need: min });
  if (max !== null && input.picks.length > max) problems.push({ code: 'TOO_MANY', pick: null, need: max });
  return { ok: problems.length === 0, problems, first: problems[0] ?? null, quote: tierQuote(prices, input.tiers), min, max };
}

export type AddProblemCode = 'FULL' | 'NOT_IN_GROUP' | 'NO_PRICE' | 'SOLD_OUT' | 'NOT_ENOUGH';

/** Can one more piece of this variant go into the set? (The card's "Add to set": null = yes.) */
export function addProblem(input: Omit<BuildCheckInput, 'on'>, variantId: string): { code: AddProblemCode; stock?: number; inBag?: number } | null {
  const max = input.tiers.length ? Math.max(...input.tiers.map((t) => t.quantity)) : 0;
  if (input.picks.length >= max) return { code: 'FULL' };
  const v = input.variants.find((x) => x.id === variantId);
  if (!v) return { code: 'NOT_IN_GROUP' };
  if (v.priceMinor === null) return { code: 'NO_PRICE' };
  if (v.sellable <= 0) return { code: 'SOLD_OUT' };
  const inSet = input.picks.filter((p) => p === variantId).length;
  const held = input.inBag?.[variantId] ?? 0;
  const limit = limitOf(v, input.maxPerLine);
  return inSet + held + 1 > limit ? { code: 'NOT_ENOUGH', stock: limit, inBag: held } : null;
}

/** Each variant with how many pieces of it the picks hold (the bag's lines: one per variant, its quantity). */
export function picksByVariant(picks: readonly string[]): { variantId: string; quantity: number }[] {
  const out = new Map<string, number>();
  for (const p of picks) out.set(p, (out.get(p) ?? 0) + 1);
  return [...out.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}
