// PR 128 — "Complete your look" on the thank-you page (demo 52-thanks.js ty_look), without a database: which rows the
// block draws, and the variant a choice of colour and size lands on. Each suggested piece (from the shop's running
// combos, @extas/combos lookFor) is one row with Add while "Add to this parcel" is open; a piece he already added is
// one row per added line, with "Added" (and Remove while open) in the place its suggestion stood. A suggestion with
// nothing left to sell is not drawn. No rows: no block. Closed with nothing added: no block (the demo's rule).

export interface LookVariant {
  id: string;
  colour: string | null;
  size: string | null;
  stock: number;
  /** What the line would cost, as its product page prices it now (the live, coupon-free discount). */
  payMinor: number;
}

export interface LookProduct {
  id: string;
  /** The product's sellable variants, in the shop's size order. */
  variants: LookVariant[];
}

export interface LookAddLine {
  id: string;
  productId: string | null;
}

export type LookRow = { kind: 'add'; productId: string } | { kind: 'added'; productId: string; lineId: string };

/** The block's rows, best suggestion first. */
export function lookRows(input: { suggested: readonly string[]; added: readonly LookAddLine[]; products: ReadonlyMap<string, LookProduct> }): LookRow[] {
  const order = [...input.suggested];
  for (const l of input.added) if (l.productId && !order.includes(l.productId)) order.push(l.productId);
  const rows: LookRow[] = [];
  for (const productId of order) {
    const mine = input.added.filter((l) => l.productId === productId);
    if (mine.length) {
      for (const l of mine) rows.push({ kind: 'added', productId, lineId: l.id });
      continue;
    }
    if (input.products.get(productId)?.variants.some((v) => v.stock > 0)) rows.push({ kind: 'add', productId });
  }
  return rows;
}

/** Whether the block is drawn at all: something to show, and the window open or a piece already added. */
export const lookShown = (rows: readonly LookRow[], open: boolean) => rows.length > 0 && (open || rows.some((r) => r.kind === 'added'));

/** The colours with something to sell, in the product's order. */
export const openColours = (p: Pick<LookProduct, 'variants'>) => [...new Set(p.variants.filter((v) => v.stock > 0).map((v) => v.colour))];

/** The first colour and size with stock: what the row opens on. */
export function firstChoice(p: Pick<LookProduct, 'variants'>): { colour: string | null; size: string | null } {
  const v = p.variants.find((x) => x.stock > 0);
  return { colour: v?.colour ?? null, size: v?.size ?? null };
}

/**
 * The variant a choice lands on. A colour change keeps the size when that size is still there in the new colour,
 * else the colour's first size with stock (the product page's rule). Null: nothing to sell in that colour.
 */
export function pickVariant<V extends LookVariant>(p: { variants: readonly V[] }, colour: string | null, size: string | null): V | null {
  const inColour = p.variants.filter((v) => v.colour === colour && v.stock > 0);
  return inColour.find((v) => v.size === size) ?? inColour[0] ?? null;
}
