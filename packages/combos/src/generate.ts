// PR 571 — the auto colour-pair generator, pure (demo 42-combo-auto.js ca_generate / ca_build / ca_sort). The owner
// binds a rule to categories or products and says 2 or 3 pieces; every colour pair (or triple) of the bound products
// becomes its own combo:
//   - STYLE  (same style): pieces of one style — one product, or the products of one style group — in different
//            colours (the same colour twice only with the rule's "same colour" switch, K11);
//   - ACROSS (one from each style): one piece from each of 2 or 3 different styles, every colour of each;
//   - ANY    (any mix): any pieces from the pool of every (product, colour).
// Only sizes every piece is made in are offered; a size is open when each piece has enough sellable stock for it
// (two of the same piece need two). A pair with no open size is "sold out — hidden", never removed.
// Order: the owner's pins, then the pair's own sales, then the colours' single sales, then open sizes, then the
// owner's colour order — or simply the colour order. The price comes from the rule through the one price rule
// (model.ts setPricing): never above the regular total, a "% off" rounded by the store's step.
// Every pair has a stable key (`pieceKey`) and link (`slug`): the same pieces always map to the same combo row.
import type { ColourFact, ProductFact } from './facts';
import { colourPrice } from './facts';
import { setPricing, type PriceRule, type RoundingRule, type SetPricing } from './model';

export const PAIRINGS = ['STYLE', 'ACROSS', 'ANY'] as const;
export type Pairing = (typeof PAIRINGS)[number];
export const SORT_MODES = ['BESTSELLERS', 'COLOUR'] as const;
export type SortMode = (typeof SORT_MODES)[number];

export interface GenRule {
  key: string;
  pieces: number;
  pairing: Pairing;
  sameColour: boolean;
  excludeColourIds: readonly string[];
  price: PriceRule;
  sortMode: SortMode;
  pinnedKeys: readonly string[];
}

/** Past sales the order uses: a pair's own sales by its piece key, a colour's single sales by `productId|colourId`. */
export interface SalesSignals {
  pair: ReadonlyMap<string, number>;
  colour: ReadonlyMap<string, number>;
}

export const NO_SALES: SalesSignals = { pair: new Map(), colour: new Map() };

export interface GenPiece {
  productId: string;
  colourId: string;
}

export interface PairSize {
  key: string;
  label: string;
  /** Every piece has enough sellable stock in this size. */
  ok: boolean;
  /** How many whole sets of this size can be sold now (0 when not ok). */
  sets: number;
}

export interface GeneratedPair {
  /** `productId.colourId` of each piece, joined by `-` in the canonical order (one row per pair for ever). */
  pieceKey: string;
  /** The pair's link inside the rule, e.g. `black-navy` or `oxford-cotton-shirt.white-linen-blend-shirt.blue`. */
  pairSlug: string;
  pieces: GenPiece[];
  sameProduct: boolean;
  /** The pieces' colours, in piece order. */
  colourIds: string[];
  sizes: PairSize[];
  /**
   * Sizes open now; 0 = sold out (hidden from lists, its page still opens). PR 572: pieces with no size in common (a
   * top in S–XXL and trousers in waist sizes) are sized one by one — then it is the fewest sizes any piece is open in.
   */
  openSizes: number;
  pricing: SetPricing;
  pinned: boolean;
  pairSales: number;
  colourSales: number;
  /** A piece's colour was added within the "new colour" days. */
  isNew: boolean;
  /** The owner's colour order of the pieces, for the colour sort. */
  colourOrder: string;
}

export interface GenResult {
  /** Every pair, in the rule's order (capped). */
  all: GeneratedPair[];
  /** The pairs with an open size. */
  visible: GeneratedPair[];
  /** Products the rule took in (with at least one colour left). */
  products: number;
  /** More pairs than the cap: the rest were left out (the cap is a setting). */
  truncated: boolean;
}

/** k-combinations in order, with or without repeats (demo ca_choose). */
export function choose<T>(arr: readonly T[], k: number, repeat: boolean): T[][] {
  const out: T[][] = [];
  const acc: T[] = [];
  const rec = (start: number) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]!);
      rec(repeat ? i : i + 1);
      acc.pop();
    }
  };
  if (k > 0) rec(0);
  return out;
}

/** Every pick of one from each list (demo ca_cartesian). */
export function cartesian<T>(lists: readonly (readonly T[])[]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]);
}

interface Slot {
  p: ProductFact;
  c: ColourFact;
}

const coloursOf = (rule: GenRule, p: ProductFact) => p.colours.filter((c) => !rule.excludeColourIds.includes(c.id));

/** The open sizes of a pair: sizes every piece is made in (by size key, in the first piece's order), with enough stock. */
export function pairSizes(slots: readonly Slot[]): PairSize[] {
  const first = slots[0]!.p;
  const keys = first.sizes.filter((s) => slots.every((x) => x.p.sizes.some((z) => z.key === s.key)));
  const need = new Map<string, { slot: Slot; n: number }>();
  for (const s of slots) {
    const k = `${s.p.id}|${s.c.id}`;
    const was = need.get(k);
    need.set(k, { slot: s, n: (was?.n ?? 0) + 1 });
  }
  return keys.map((size) => {
    let sets = Number.POSITIVE_INFINITY;
    for (const { slot, n } of need.values()) {
      const sizeId = slot.p.sizes.find((z) => z.key === size.key)?.id;
      const v = slot.p.variants.find((x) => x.colourId === slot.c.id && x.sizeId === sizeId);
      const stock = v && v.priceMinor !== null ? v.sellable : 0;
      sets = Math.min(sets, Math.floor(stock / n));
    }
    const whole = Number.isFinite(sets) ? sets : 0;
    return { key: size.key, label: size.label, ok: whole > 0, sets: whole };
  });
}

/**
 * PR 572 — pieces sized one by one (no size every piece is made in): the fewest sizes any piece is open in, each
 * (product, colour) needing as many pieces as the pair holds of it. A piece made without sizes counts as one size.
 */
function eachOpen(slots: readonly Slot[]): number {
  if (slots.length < 2) return 0;
  const need = new Map<string, { slot: Slot; n: number }>();
  for (const s of slots) {
    const k = `${s.p.id}|${s.c.id}`;
    need.set(k, { slot: s, n: (need.get(k)?.n ?? 0) + 1 });
  }
  let fewest = Number.POSITIVE_INFINITY;
  for (const { slot, n } of need.values()) {
    const own = slot.p.variants.filter((v) => v.colourId === slot.c.id && v.priceMinor !== null && v.sellable >= n);
    const open = slot.p.sizes.length ? slot.p.sizes.filter((z) => own.some((v) => v.sizeId === z.id)).length : own.length ? 1 : 0;
    fewest = Math.min(fewest, open);
  }
  return Number.isFinite(fewest) ? fewest : 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function build(rule: GenRule, slots: Slot[], multiStyle: boolean, signals: SalesSignals, ctx: { rounding: RoundingRule; now: Date; newColourMs: number }): GeneratedPair {
  const sameProduct = slots.every((s) => s.p.id === slots[0]!.p.id);
  const pieceKey = slots.map((s) => `${s.p.id}.${s.c.id}`).join('-');
  const colourKeys = slots.map((s) => s.c.key).join('-');
  const pairSlug =
    rule.pairing === 'STYLE' || sameProduct
      ? multiStyle && rule.pairing === 'STYLE'
        ? `${slots[0]!.p.slug}~${colourKeys}`
        : colourKeys
      : slots.map((s) => `${s.p.slug}.${s.c.key}`).join('-');
  const pricing = setPricing(rule.price, slots.map((s) => ({ priceMinor: colourPrice(s.p, s.c.id), quantity: 1 })), ctx.rounding);
  const sizes = pairSizes(slots);
  const open = sizes.length ? sizes.filter((s) => s.ok).length : eachOpen(slots);
  const pinned = rule.pinnedKeys.includes(pieceKey) || rule.pinnedKeys.includes(pairSlug);
  return {
    pieceKey,
    pairSlug,
    pieces: slots.map((s) => ({ productId: s.p.id, colourId: s.c.id })),
    sameProduct,
    colourIds: slots.map((s) => s.c.id),
    sizes,
    openSizes: open,
    pricing,
    pinned,
    pairSales: signals.pair.get(pieceKey) ?? 0,
    colourSales: slots.reduce((sum, s) => sum + (signals.colour.get(`${s.p.id}|${s.c.id}`) ?? 0), 0),
    isNew: slots.some((s) => ctx.now.getTime() - s.c.addedAt.getTime() < ctx.newColourMs),
    colourOrder: slots.map((s) => pad2(s.c.order)).join(''),
  };
}

/** The rule's order (demo ca_sort: best sellers or colour order). */
export function sortPairs(list: GeneratedPair[], mode: SortMode): GeneratedPair[] {
  const byColour = (a: GeneratedPair, b: GeneratedPair) => (a.colourOrder < b.colourOrder ? -1 : a.colourOrder > b.colourOrder ? 1 : a.pieceKey < b.pieceKey ? -1 : a.pieceKey > b.pieceKey ? 1 : 0);
  return list.sort((a, b) => {
    if (mode === 'COLOUR') return byColour(a, b);
    return Number(b.pinned) - Number(a.pinned) || b.pairSales - a.pairSales || b.colourSales - a.colourSales || b.openSizes - a.openSizes || byColour(a, b);
  });
}

/**
 * Every pair a rule makes from its bound products (in binding order). Products without a colour left, or not ticked
 * "Use in combos", make none.
 */
export function generatePairs(rule: GenRule, products: readonly ProductFact[], signals: SalesSignals, ctx: { rounding: RoundingRule; now: Date; newColourDays: number; cap: number }): GenResult {
  const usable = products.filter((p) => p.inCombos && coloursOf(rule, p).length > 0);
  const k = rule.pieces;
  const sets: Slot[][] = [];
  // Styles: the products of one style group are one style (several products of one style pair with each other).
  const styles = new Map<string, ProductFact[]>();
  for (const p of usable) styles.set(p.styleKey, [...(styles.get(p.styleKey) ?? []), p]);
  const slotsOf = (p: ProductFact): Slot[] => coloursOf(rule, p).map((c) => ({ p, c }));
  if (rule.pairing === 'ACROSS') {
    const groups = [...styles.values()].map((ps) => ps.flatMap(slotsOf));
    for (const g of choose(groups, k, false)) sets.push(...cartesian(g));
  } else if (rule.pairing === 'ANY') {
    sets.push(...choose(usable.flatMap(slotsOf), k, rule.sameColour));
  } else {
    for (const ps of styles.values()) sets.push(...choose(ps.flatMap(slotsOf), k, rule.sameColour));
  }
  const newColourMs = ctx.newColourDays * 86_400_000;
  const multiStyle = styles.size > 1 || usable.length > 1;
  const all = sortPairs(
    sets.map((s) => build(rule, s, multiStyle, signals, { rounding: ctx.rounding, now: ctx.now, newColourMs })),
    rule.sortMode,
  );
  const capped = all.slice(0, Math.max(0, ctx.cap));
  return { all: capped, visible: capped.filter((p) => p.openSizes > 0), products: usable.length, truncated: all.length > capped.length };
}

/** The sizes in short words for a card: all, a run, or the few left (demo ca_sizeLine) — as data, the screen words it. */
export function sizeRun(sizes: readonly PairSize[]): { kind: 'soldOut' | 'all' | 'range' | 'some'; from?: string; to?: string; labels?: string[] } {
  const ok = sizes.filter((s) => s.ok);
  if (!ok.length) return { kind: 'soldOut' };
  if (ok.length === sizes.length) return { kind: 'all', from: sizes[0]!.label, to: sizes[sizes.length - 1]!.label };
  const idx = ok.map((s) => sizes.indexOf(s));
  if (ok.length >= 3 && idx[idx.length - 1]! - idx[0]! === idx.length - 1) return { kind: 'range', from: ok[0]!.label, to: ok[ok.length - 1]!.label };
  return { kind: 'some', labels: ok.map((s) => s.label) };
}
