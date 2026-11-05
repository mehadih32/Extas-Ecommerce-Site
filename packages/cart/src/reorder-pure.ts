// S04 · PR 622 (CN-034) — "Buy again", the pure part (safe in client code): which lines of a past order come back,
// which come back as their set, and what today's catalogue says about each one (`account.reorder`).

/** Where a bag line put in by "Buy again" came from (CartItem.source → OrderItem.addedVia). */
export const REORDER_SOURCE = 'reorder';

/** One line of the past order, as stored. */
export interface ReorderItem {
  id: string;
  variantId: string | null;
  productId: string | null;
  productName: string;
  colourName: string | null;
  sizeLabel: string | null;
  quantity: number;
  unitPriceMinor: number;
  comboId: string | null;
  comboGroupKey: string | null;
  isAddOn: boolean;
  status: string;
}

/** What comes back: the sets to try as sets (in their pieces' order) and the single lines. */
export interface ReorderParts {
  sets: { comboId: string; groupKey: string; pieces: ReorderItem[] }[];
  loose: ReorderItem[];
}

/**
 * The lines that come back. Add-ons and free gifts (a line at no price) are not copied, nor lines taken off the order;
 * a line of a set the shop made (its combo known) is tried as that set, a set the customer built (no combo) comes back
 * as its pieces — the bag prices built sets again by its own rules.
 */
export function reorderParts(items: readonly ReorderItem[]): ReorderParts {
  const sets = new Map<string, { comboId: string; groupKey: string; pieces: ReorderItem[] }>();
  const loose: ReorderItem[] = [];
  for (const i of items) {
    if (i.status !== 'ACTIVE' || i.isAddOn || i.unitPriceMinor <= 0 || i.quantity <= 0) continue;
    if (i.comboId && i.comboGroupKey) {
      const key = `${i.comboId}:${i.comboGroupKey}`;
      const s = sets.get(key) ?? { comboId: i.comboId, groupKey: i.comboGroupKey, pieces: [] };
      s.pieces.push(i);
      sets.set(key, s);
    } else loose.push(i);
  }
  return { sets: [...sets.values()], loose };
}

/** Today's facts of one product (from the combos engine's productFacts). */
export interface ReorderFact {
  published: boolean;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  sizes: { id: string; label: string }[];
  variants: { id: string; colourId: string | null; sizeId: string | null; priceMinor: number | null; sellable: number }[];
}

export type ReorderVerdict =
  /** It goes in: `quantity` is the old one, or fewer when fewer can be sold now. */
  | { kind: 'add'; variantId: string; quantity: number }
  /** That size (colour) is sold out; `inStock` the sizes of the same colour that can be sold now, in the size order. */
  | { kind: 'soldOut'; inStock: string[] }
  /** No longer sold (taken off sale, no price, the variant gone). */
  | { kind: 'gone' };

/** What today's catalogue says about one old line: never another size or colour in its place. */
export function reorderVerdict(item: Pick<ReorderItem, 'variantId' | 'quantity'>, fact: ReorderFact | undefined): ReorderVerdict {
  if (!item.variantId || !fact || !fact.published) return { kind: 'gone' };
  const v = fact.variants.find((x) => x.id === item.variantId);
  if (!v || v.priceMinor === null) return { kind: 'gone' };
  if (v.sellable > 0) return { kind: 'add', variantId: v.id, quantity: Math.min(item.quantity, v.sellable) };
  const open = new Set(fact.variants.filter((x) => x.colourId === v.colourId && x.sellable > 0 && x.priceMinor !== null && x.sizeId).map((x) => x.sizeId!));
  return { kind: 'soldOut', inStock: fact.sizes.filter((s) => open.has(s.id)).map((s) => s.label) };
}

/** Whether "Buy again" is offered on an order in this state (`account.reorder`). */
export function reorderOffered(s: { enabled: boolean; states: readonly string[] }, status: string): boolean {
  return s.enabled && status !== 'DRAFT' && s.states.includes(status);
}
