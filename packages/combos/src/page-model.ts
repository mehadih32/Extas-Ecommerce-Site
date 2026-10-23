// PR 91–95, 102, 103 — the combo page's picking rules, pure: safe in the browser (the page's client part runs them on
// every tap) and on the server (the first draw). Nothing here reads the database or the settings, and no price is
// worked out here: the set price comes from the price table the server builds with the one price rule (model.ts
// `setPricing`, summary.ts `firstPrice` / `picksPrice`), keyed by the pieces' own prices (`priceKeyOf`).
//
//   - PR 95: each piece has its own colour and size; a repeated product ("Polo Duo") gets "Same size as item 1", on by
//     default. Changing a colour drops a size that is sold out in it, and a piece that followed that size keeps it
//     when its own colour still has it (the demo's cb_fixSizes, R16 (16)) — each with a note for the page to say.
//   - PR 94: popular pairs for a set of one product — the pairs customers really picked (PopularPair, PR 104) first,
//     then the owner's colour order; three to a row, so 1, 2, 3 or 6 (demo cb_pairsRow, 26a). A pair that does not come
//     in the sizes already picked is greyed (`pairFits`).
//   - PR 103: the cards of "More sets", the sets landing page and the product page's offer grouped the way the
//     customer reads them: one card per fixed set, and one per auto rule and product, not one per colour pair.
import { checkSet, slotColour, type SetCheck, type SetProblem, type SetSlot, type SlotChoice, type VariantStock } from './validate';

export type { SetCheck, SetProblem, SetSlot, SlotChoice, VariantStock };

// ---------------------------------------------------------------------------------------------------------------
// The price table
// ---------------------------------------------------------------------------------------------------------------

/** One set price, the way the page shows it (minor units; `was` only when the owner allows struck prices). */
export interface PriceCell {
  pay: number | null;
  regular: number | null;
  saving: number;
  was: number | null;
  offer: boolean;
}

const slotVariants = (slot: SetSlot, variants: readonly VariantStock[]) =>
  slot.fixedVariantId
    ? variants.filter((v) => v.id === slot.fixedVariantId)
    : variants.filter((v) => v.productId === slot.productId && (!slot.colourIds.length || (v.colourId !== null && slot.colourIds.includes(v.colourId))) && (!slot.sizeIds.length || v.sizeId === null || slot.sizeIds.includes(v.sizeId)));

const lowest = (vs: readonly VariantStock[]): number | null => {
  const ps = vs.map((v) => v.priceMinor).filter((p): p is number => p !== null);
  return ps.length ? Math.min(...ps) : null;
};

/** The price a piece counts at: its variant's once it resolves, else its colour's lowest, else the piece's lowest. */
export function piecePrice(slot: SetSlot, colourId: string | null, variantId: string | null, variants: readonly VariantStock[]): number | null {
  if (variantId) {
    const v = variants.find((x) => x.id === variantId);
    if (v) return v.priceMinor;
  }
  const all = slotVariants(slot, variants);
  if (colourId) {
    const own = lowest(all.filter((v) => v.colourId === colourId));
    if (own !== null) return own;
  }
  return lowest(all);
}

/** Every price a piece can count at (the server prices each mix of them once). */
export function slotPriceOptions(slot: SetSlot, variants: readonly VariantStock[]): (number | null)[] {
  const ps = [...new Set(slotVariants(slot, variants).map((v) => v.priceMinor))];
  return ps.length ? ps : [null];
}

/** The key of a mix of piece prices in the price table. */
export const priceKeyOf = (prices: readonly (number | null)[]): string => prices.map((p) => (p === null ? '-' : String(p))).join('|');

/** Every mix of piece prices (one per slot), or null when there are more than `cap` (the page then asks the server). */
export function priceMixes(slots: readonly SetSlot[], variants: readonly VariantStock[], cap: number): (number | null)[][] | null {
  let out: (number | null)[][] = [[]];
  for (const s of slots) {
    const opts = slotPriceOptions(s, variants);
    if (out.length * opts.length > cap) return null;
    out = out.flatMap((mix) => opts.map((p) => [...mix, p]));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The picks
// ---------------------------------------------------------------------------------------------------------------

/** What the customer has picked: a colour and a size per piece, and "Same size as item N" per piece. */
export interface PickState {
  colours: (string | null)[];
  sizes: (string | null)[];
  same: boolean[];
}

/** A note a change leaves on a piece: its size went sold out in the new colour (`kept`: pieces that kept the size). */
export interface PickNote {
  slot: number;
  kind: 'SIZE_GONE' | 'SIZE_GONE_TOO';
  size: string;
  colourId: string | null;
  kept: number[];
}

/** The earlier piece of the same product with the same sizes that a piece can follow ("Same size as item 1"), or -1. */
export function linkSource(slots: readonly SetSlot[], i: number): number {
  const s = slots[i];
  if (!s || s.fixedVariantId || s.sizeIds.length === 1) return -1;
  for (let j = 0; j < i; j++) {
    const o = slots[j]!;
    if (!o.fixedVariantId && o.productId === s.productId && o.sizeIds.join() === s.sizeIds.join()) return j;
  }
  return -1;
}

/** The size a piece uses: the one it follows, or its own. */
export function sizeOf(slots: readonly SetSlot[], st: PickState, i: number): string | null {
  const j = linkSource(slots, i);
  if (j >= 0 && st.same[i]) return sizeOf(slots, st, j);
  return st.sizes[i] ?? null;
}

/** The picks as the set check and the bag take them. */
export const choicesOf = (slots: readonly SetSlot[], st: PickState): SlotChoice[] => slots.map((s, i) => ({ colourId: st.colours[i] ?? null, sizeId: sizeOf(slots, st, i) }));

/** Pieces of a variant that can be sold now (0 when there is no such variant). */
export function stockOf(slot: SetSlot, variants: readonly VariantStock[], colourId: string | null, sizeId: string | null): number {
  const v = slot.fixedVariantId ? variants.find((x) => x.id === slot.fixedVariantId) : variants.find((x) => x.productId === slot.productId && x.colourId === colourId && x.sizeId === sizeId);
  return v ? v.sellable : 0;
}

/** Does the product sell without sizes (one size)? */
export const sizeless = (slot: SetSlot, variants: readonly VariantStock[]) => variants.filter((v) => v.productId === slot.productId).every((v) => v.sizeId === null);

/**
 * Where the page starts: the picks of the set being changed in the bag (`edit`), else the first colours (or the first
 * popular pair), no size yet, and every repeated piece following the first one's size.
 */
export function initialPicks(slots: readonly SetSlot[], variants: readonly VariantStock[], first: readonly (string | null)[], edit: readonly SlotChoice[] | null): PickState {
  const colours = slots.map((s, i) => slotColour(s, edit?.[i] ?? { colourId: first[i] ?? null }, variants));
  if (edit) {
    const sizes = slots.map((s, i) => edit[i]?.sizeId ?? null);
    const same = slots.map((_, i) => {
      const j = linkSource(slots, i);
      return j >= 0 && sizes[i] !== null && sizes[i] === sizes[j];
    });
    return { colours, sizes, same };
  }
  return { colours, sizes: slots.map(() => null), same: slots.map((_, i) => linkSource(slots, i) >= 0) };
}

/** The picks after a colour change: a size sold out in the new colour is dropped, followers keep it where they can. */
export function withColours(slots: readonly SetSlot[], variants: readonly VariantStock[], st: PickState, colours: readonly (string | null)[]): { state: PickState; notes: PickNote[] } {
  const next: PickState = { colours: slots.map((s, i) => (s.fixedVariantId || s.colourIds.length === 1 ? st.colours[i]! : (colours[i] ?? st.colours[i] ?? null))), sizes: [...st.sizes], same: [...st.same] };
  const notes: PickNote[] = [];
  slots.forEach((slot, i) => {
    const linked = linkSource(slots, i) >= 0 && next.same[i];
    const size = linked ? null : next.sizes[i];
    if (!size || sizeless(slot, variants) || stockOf(slot, variants, next.colours[i] ?? null, size) > 0) return;
    const kept: number[] = [];
    slots.forEach((other, j) => {
      if (j <= i || linkSource(slots, j) !== i || !next.same[j]) return;
      next.same[j] = false;
      if (stockOf(other, variants, next.colours[j] ?? null, size) > 0) {
        next.sizes[j] = size;
        kept.push(j);
      } else {
        next.sizes[j] = null;
        notes.push({ slot: j, kind: 'SIZE_GONE_TOO', size, colourId: next.colours[j] ?? null, kept: [] });
      }
    });
    notes.push({ slot: i, kind: 'SIZE_GONE', size, colourId: next.colours[i] ?? null, kept });
    next.sizes[i] = null;
  });
  return { state: next, notes: notes.sort((a, b) => a.slot - b.slot) };
}

/** The picks after a size tap: the piece takes its own size (it no longer follows another). */
export function withSize(slots: readonly SetSlot[], st: PickState, i: number, size: string): PickState {
  const next: PickState = { colours: [...st.colours], sizes: [...st.sizes], same: [...st.same] };
  next.sizes[i] = size;
  if (linkSource(slots, i) >= 0) next.same[i] = false;
  return next;
}

/** "Same size as item N" switched: on follows it; off keeps that size as the piece's own where its colour has it. */
export function withSame(slots: readonly SetSlot[], variants: readonly VariantStock[], st: PickState, i: number, on: boolean): PickState {
  const next: PickState = { colours: [...st.colours], sizes: [...st.sizes], same: [...st.same] };
  const j = linkSource(slots, i);
  if (j < 0) return next;
  if (on) {
    next.same[i] = true;
    return next;
  }
  const s = sizeOf(slots, st, j);
  next.same[i] = false;
  next.sizes[i] = s && stockOf(slots[i]!, variants, next.colours[i] ?? null, s) > 0 ? s : null;
  return next;
}

/** The set check of the picks (the same pure check the bag runs again on the server). */
export function checkPicks(i: { slots: readonly SetSlot[]; variants: readonly VariantStock[]; st: PickState; inBag?: Readonly<Record<string, number>>; needsMix: boolean; onSale: boolean }): SetCheck {
  return checkSet({ slots: i.slots, choices: choicesOf(i.slots, i.st), variants: i.variants, inBag: i.inBag, needsMix: i.needsMix, onSale: i.onSale });
}

/** The price-table key of the picks: each piece at its variant's price once it resolves, else its colour's. */
export function picksKey(slots: readonly SetSlot[], variants: readonly VariantStock[], st: PickState, check: Pick<SetCheck, 'variants'>): string {
  return priceKeyOf(slots.map((s, i) => piecePrice(s, slotColour(s, { colourId: st.colours[i] ?? null }, variants), check.variants[i] ?? null, variants)));
}

// ---------------------------------------------------------------------------------------------------------------
// PR 94 · popular pairs
// ---------------------------------------------------------------------------------------------------------------

/** Three to a row: the most of 1, 2, 3 or 6 that `n` and the owner's limit allow (demo 26a). */
export function pairsShown(n: number, max: number): number {
  const top = Math.min(n, max);
  return [6, 3, 2, 1].find((k) => k <= top) ?? 0;
}

/** A set of one product with free colours: where popular pairs apply. */
export const pairsApply = (slots: readonly SetSlot[]) => slots.length > 1 && slots.every((s) => !s.fixedVariantId && s.productId === slots[0]!.productId && s.colourIds.length !== 1);

/** Is a colour open in a piece (allowed, and some allowed size in stock)? */
export const colourOpen = (slot: SetSlot, variants: readonly VariantStock[], colourId: string) =>
  (!slot.colourIds.length || slot.colourIds.includes(colourId)) && slotVariants(slot, variants).some((v) => v.colourId === colourId && v.sellable > 0);

/**
 * The pairs to offer (each one colour per piece, in the owner's colour order): those customers picked most (`learned`,
 * most first), then every mix of open colours in the owner's order. A pair needs every colour open in its piece; a
 * colour pair of one product needs different colours (K11).
 */
export function popularPairs(i: { slots: readonly SetSlot[]; variants: readonly VariantStock[]; colourOrder: readonly string[]; learned: readonly (readonly string[])[]; needsMix: boolean; max: number }): string[][] {
  const { slots, variants } = i;
  if (!pairsApply(slots) || i.max < 1) return [];
  const n = slots.length;
  const rank = (id: string) => {
    const k = i.colourOrder.indexOf(id);
    return k < 0 ? Number.MAX_SAFE_INTEGER : k;
  };
  const out: string[][] = [];
  const seen = new Set<string>();
  const push = (cols: readonly string[]) => {
    if (cols.length !== n || out.length >= 6) return;
    const ordered = [...cols].sort((a, b) => rank(a) - rank(b));
    if (i.needsMix && new Set(ordered).size !== ordered.length) return;
    if (!ordered.every((c, k) => colourOpen(slots[k]!, variants, c))) return;
    const key = [...ordered].sort().join('+');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ordered);
  };
  for (const l of i.learned) push(l);
  const open = i.colourOrder.filter((c) => slots.some((s) => colourOpen(s, variants, c)));
  const walk = (from: number, acc: string[]) => {
    if (out.length >= 6) return;
    if (acc.length === n) return push(acc);
    for (let k = from; k < open.length; k++) walk(i.needsMix ? k + 1 : k, [...acc, open[k]!]);
  };
  walk(0, []);
  return out.slice(0, pairsShown(out.length, i.max));
}

/** Does a pair come in the sizes already picked? (greyed when not, with the size that is missing) */
export function pairFits(slots: readonly SetSlot[], variants: readonly VariantStock[], st: PickState, colours: readonly string[]): { ok: boolean; size: string | null } {
  for (let k = 0; k < slots.length; k++) {
    const size = sizeOf(slots, st, k);
    if (size && colours[k] && stockOf(slots[k]!, variants, colours[k]!, size) <= 0) return { ok: false, size };
  }
  return { ok: true, size: null };
}

// ---------------------------------------------------------------------------------------------------------------
// PR 102, 103 · the set cards (built by page.ts `setCards`) and how the customer reads them
// ---------------------------------------------------------------------------------------------------------------

export interface SetCardRule {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  titleEn: string | null;
  titleBn: string | null;
  season: string | null;
  pairing: string;
  pieces: number;
}

export interface SetCard {
  comboId: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  type: string;
  ruleId: string | null;
  sortRank: number;
  isFeatured: boolean;
  /** Slot by slot: the product and the colour the card shows. */
  pieces: { productId: string; colourId: string | null }[];
  productIds: string[];
  /** Every colour the set can be had in (for the dots). */
  colourIds: string[];
  /** The set price from the first colours (the combo page prices the exact picks). */
  price: PriceCell;
}

export interface GroupableCard {
  comboId: string;
  ruleId: string | null;
  productIds: readonly string[];
  sortRank: number;
}

/** One card per fixed set, and one per auto rule and product mix (its pairs are the colours of that one card). */
export function groupCards<T extends GroupableCard>(cards: readonly T[]): { key: string; ruleId: string | null; cards: T[] }[] {
  const out = new Map<string, { key: string; ruleId: string | null; cards: T[] }>();
  for (const c of cards) {
    const key = c.ruleId ? `${c.ruleId}:${[...new Set(c.productIds)].sort().join('+')}` : c.comboId;
    const g = out.get(key) ?? { key, ruleId: c.ruleId, cards: [] };
    g.cards.push(c);
    out.set(key, g);
  }
  for (const g of out.values()) g.cards.sort((a, b) => a.sortRank - b.sortRank);
  return [...out.values()];
}

/** `{token}` filled from vars; an unknown token stays visible (a test catches it). */
export const fillIn = (template: string, vars: Readonly<Record<string, string | number>>): string => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
