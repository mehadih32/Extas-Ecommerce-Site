// PR 574 — a set in the bag in the templates B1–B5 (demo 43-combo-tpl.js), the rules without a browser: which look a
// set gets (the combo's, its rule's or the shop's `combos.template.bag`; `?btpl=` previews another while previews are
// on), B5's compact row once the bag holds `combos.bag.compactFrom` sets, B2's choices when one piece's size changes
// (every piece's colour and size, in the set's own order) and B3's "Add 1 more" (the 3-piece pairs of the same product
// that hold this pair's colours, in this pair's size). The money is never worked out here: every amount is the bag
// engine's, and B3 shows the 3-piece set's own price.
import { findPair, pairPrice, type ListPair } from '@extas/combos/rule-page-model';
import type { PriceCell } from '@extas/combos/page-model';
import type { RuleProduct } from '@extas/combos';

export const BAG_TEMPLATES = ['current', 'B1', 'B2', 'B3', 'B4', 'B5'] as const;
export type BagTemplate = (typeof BAG_TEMPLATES)[number];
/** What one set line draws: B5 is a compact row from `compactFrom` sets, else the B2 card. */
export type BagDraw = 'current' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5row' | 'B5card';

const isBag = (t: unknown): t is BagTemplate => (BAG_TEMPLATES as readonly unknown[]).includes(t);

/** The look of a set: a preview (`?btpl=`) while previews are on, else its own (unknown = the current look). */
export function bagTemplateOf(own: string, preview: string | null | undefined, previewOn: boolean): BagTemplate {
  if (previewOn && isBag(preview)) return preview;
  return isBag(own) ? own : 'current';
}

export function bagDrawOf(tpl: BagTemplate, sets: number, compactFrom: number): BagDraw {
  if (tpl === 'B5') return sets >= compactFrom ? 'B5row' : 'B5card';
  return tpl;
}

/** Whether the draw changes sizes in the bag (B2, B3 and B5's open card). */
export const sizesInBag = (d: BagDraw) => d === 'B2' || d === 'B3' || d === 'B5card' || d === 'B5row';

export interface PieceChoice {
  colourId: string | null;
  sizeId: string | null;
}

/** B2: every piece's colour and size, piece `i` in its new size — what PATCH /api/bag/sets takes. */
export function sizeChoices(pieces: readonly PieceChoice[], i: number, sizeId: string): PieceChoice[] {
  return pieces.map((p, k) => ({ colourId: p.colourId, sizeId: k === i ? sizeId : p.sizeId }));
}

export interface NudgePiece {
  productId: string | null;
  colourId: string | null;
  sizeId: string | null;
}

export interface NudgeColour {
  colourId: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  /** In stock in this pair's size, and its 3-piece set on sale. */
  ok: boolean;
  /** The 3-piece pair's page (POST /api/bag/sets takes it with `replaceGroupKey`). */
  slug: string;
  /** Its choices in the 3-piece set's slot order: the pieces keep their sizes, the new one takes the first piece's. */
  choices: PieceChoice[];
  price: PriceCell;
}

export interface Nudge {
  /** The size the new piece takes (the first piece's), and whether every piece is in it. */
  sizeLabel: string | null;
  same: boolean;
  colours: NudgeColour[];
  /** The first colour that can go in: the price the card shows ("3 for ৳…"). */
  price: PriceCell;
  pieces: number;
}

export interface NudgeSide {
  rule: { pieces: number };
  pairs: readonly ListPair[];
  products: readonly RuleProduct[];
  prices: Readonly<Record<string, PriceCell>> | null;
}

/** B3: a 2-piece pair of one product grows into its rule's 3-piece companion (demo cbt_upsell); null when it cannot. */
export function nudgeOf(pieces: readonly NudgePiece[], companion: NudgeSide | null): Nudge | null {
  const productId = pieces[0]?.productId;
  if (!companion || !productId || companion.rule.pieces !== pieces.length + 1 || pieces.some((p) => p.productId !== productId || !p.colourId)) return null;
  const product = companion.products.find((p) => p.id === productId);
  if (!product) return null;
  const firstSize = pieces[0]!.sizeId;
  const size = product.sizes.find((s) => s.id === firstSize) ?? null;
  const mine = new Set(pieces.map((p) => p.colourId));
  const colours = product.colours.flatMap((col): NudgeColour[] => {
    if (mine.has(col.id)) return [];
    const pair = findPair(companion.pairs, [...pieces.map((p) => ({ productId, colourId: p.colourId! })), { productId, colourId: col.id }]);
    if (!pair) return [];
    // the pieces already in the bag keep their sizes (one per colour, in the order they come); the new one takes the first's
    const left = pieces.map((p) => ({ colourId: p.colourId, sizeId: p.sizeId }));
    const choices = pair.slots.map((s) => {
      const k = left.findIndex((x) => x.colourId === s.colourId);
      const sizeId = k >= 0 ? left.splice(k, 1)[0]!.sizeId : firstSize;
      return { colourId: s.colourId, sizeId };
    });
    const variant = (c: PieceChoice) => product.variants.find((v) => v.colourId === c.colourId && v.sizeId === c.sizeId);
    const open = pair.openSizes > 0 && Boolean(size && pair.sizes.find((s) => s.key === size.key)?.ok) && choices.every((c) => (variant(c)?.sellable ?? 0) > 0);
    const price = pairPrice(
      pair,
      choices.map((c) => variant(c)?.priceMinor ?? null),
      companion.prices,
    );
    return [{ colourId: col.id, key: col.key, nameEn: col.nameEn, nameBn: col.nameBn, hex: col.hex, ok: open && price.pay !== null, slug: pair.slug, choices, price }];
  });
  const first = colours.find((x) => x.ok);
  if (!first) return null;
  return { sizeLabel: size?.label ?? null, same: pieces.every((p) => p.sizeId === firstSize), colours, price: first.price, pieces: pieces.length + 1 };
}
