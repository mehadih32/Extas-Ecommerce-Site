// PR 101 — set validation, pure: what is still missing before a set can go into the bag, piece by piece, in the
// order the page shows them — so the button can say what is missing and scroll there (Blueprint D8.1). The same
// check runs in the browser (live) and again on the server before the bag is written (PR 97), with the real stock.
//
// A set is cut into slots, one per piece (an item of quantity 2 is two slots). Each slot needs a colour and a size
// (a fixed variant needs neither), both allowed by the combo, a live variant with stock, and — counting the same
// variant in other slots and what the bag already holds — enough pieces for all of them (the audit's oversell bug).
// A colour pair of one product needs different colours unless the combo says "same colour twice is fine" (K11).
// "Size for both" is one size for every slot that has not picked its own (D8.1).

export interface SetSlot {
  /** 0-based, in the page's order. */
  index: number;
  /** The combo item it comes from. */
  itemPosition: number;
  productId: string;
  /** Colours the combo allows here; empty = any colour of the product. */
  colourIds: readonly string[];
  /** Sizes the combo allows here; empty = any size. */
  sizeIds: readonly string[];
  fixedVariantId: string | null;
}

export interface SlotChoice {
  colourId?: string | null;
  sizeId?: string | null;
}

export interface VariantStock {
  id: string;
  productId: string;
  colourId: string | null;
  sizeId: string | null;
  /** Pieces that can be sold now. */
  sellable: number;
  priceMinor: number | null;
}

export const SET_PROBLEMS = ['NOT_ON_SALE', 'PICK_COLOUR', 'PICK_SIZE', 'COLOUR_NOT_IN_SET', 'SIZE_NOT_IN_SET', 'NO_SUCH_PIECE', 'SOLD_OUT', 'NOT_ENOUGH', 'SAME_COLOUR', 'NO_PRICE'] as const;
export type SetProblemCode = (typeof SET_PROBLEMS)[number];

export interface SetProblem {
  code: SetProblemCode;
  /** The slot it is about (null = the whole set). */
  slot: number | null;
  /** NOT_ENOUGH: pieces that can be sold, what the set needs of that piece, and what the bag already holds. */
  stock?: number;
  need?: number;
  inBag?: number;
}

export interface SetCheck {
  ok: boolean;
  problems: SetProblem[];
  /** The first thing to fix (where the page scrolls). */
  first: SetProblem | null;
  /** The variant each slot resolves to (null while it does not). */
  variants: (string | null)[];
  /** Slots that are complete, of all. */
  done: number;
  total: number;
}

export interface SetCheckInput {
  slots: readonly SetSlot[];
  /** One per slot (missing = nothing picked yet). */
  choices: readonly (SlotChoice | undefined)[];
  /** "Size for both": used by every slot without its own size. */
  sizeForAll?: string | null;
  variants: readonly VariantStock[];
  /** Pieces of each variant already in the bag (not counting the set being changed). */
  inBag?: Readonly<Record<string, number>>;
  /** One product taking several pieces, where the same colour twice is not this offer. */
  needsMix: boolean;
  /** The combo is on sale now. */
  onSale: boolean;
}

/** The combo's items cut into one slot per piece. */
export function expandSlots(items: readonly { position: number; productId: string | null; colourIds: readonly string[]; sizeIds: readonly string[]; fixedVariantId: string | null; quantity: number }[]): SetSlot[] {
  const out: SetSlot[] = [];
  for (const i of [...items].sort((a, b) => a.position - b.position)) {
    if (!i.productId) continue;
    for (let q = 0; q < i.quantity; q++) out.push({ index: out.length, itemPosition: i.position, productId: i.productId, colourIds: i.colourIds, sizeIds: i.sizeIds, fixedVariantId: i.fixedVariantId });
  }
  return out;
}

/** The colour a slot uses: the fixed variant's, the only allowed one, or the one picked. */
export function slotColour(slot: SetSlot, choice: SlotChoice | undefined, variants: readonly VariantStock[]): string | null {
  if (slot.fixedVariantId) return variants.find((v) => v.id === slot.fixedVariantId)?.colourId ?? null;
  if (slot.colourIds.length === 1) return slot.colourIds[0]!;
  return choice?.colourId ?? null;
}

/** The size a slot uses: the fixed variant's, the only allowed one, its own pick, else "size for both". */
export function slotSize(slot: SetSlot, choice: SlotChoice | undefined, variants: readonly VariantStock[], sizeForAll?: string | null): string | null {
  if (slot.fixedVariantId) return variants.find((v) => v.id === slot.fixedVariantId)?.sizeId ?? null;
  if (slot.sizeIds.length === 1) return slot.sizeIds[0]!;
  return choice?.sizeId ?? sizeForAll ?? null;
}

/** Does the product sell this piece without a size (one-size items)? */
const sizeless = (productId: string, variants: readonly VariantStock[]) => variants.filter((v) => v.productId === productId).every((v) => v.sizeId === null);

export function checkSet(input: SetCheckInput): SetCheck {
  const { slots, variants } = input;
  const problems: SetProblem[] = [];
  const resolved: (VariantStock | null)[] = [];
  if (!input.onSale) problems.push({ code: 'NOT_ON_SALE', slot: null });

  for (const slot of slots) {
    const choice = input.choices[slot.index];
    const colour = slotColour(slot, choice, variants);
    const size = slotSize(slot, choice, variants, input.sizeForAll);
    const noSize = sizeless(slot.productId, variants);
    const bad = (code: SetProblemCode) => {
      problems.push({ code, slot: slot.index });
      resolved.push(null);
    };
    if (slot.fixedVariantId) {
      const v = variants.find((x) => x.id === slot.fixedVariantId);
      if (!v) bad('NO_SUCH_PIECE');
      else resolved.push(v);
      continue;
    }
    const hasColours = variants.some((v) => v.productId === slot.productId && v.colourId !== null);
    if (hasColours && !colour) {
      bad('PICK_COLOUR');
      continue;
    }
    if (colour && slot.colourIds.length && !slot.colourIds.includes(colour)) {
      bad('COLOUR_NOT_IN_SET');
      continue;
    }
    if (!noSize && !size) {
      bad('PICK_SIZE');
      continue;
    }
    if (size && slot.sizeIds.length && !slot.sizeIds.includes(size)) {
      bad('SIZE_NOT_IN_SET');
      continue;
    }
    const v = variants.find((x) => x.productId === slot.productId && x.colourId === (hasColours ? colour : null) && x.sizeId === (noSize ? null : size));
    if (!v) bad('NO_SUCH_PIECE');
    else resolved.push(v);
  }

  // stock: every slot of the same variant, plus what the bag holds, against what can be sold
  const counted = new Map<string, number>();
  for (const slot of slots) {
    const v = resolved[slot.index];
    if (!v) continue;
    const need = (counted.get(v.id) ?? 0) + 1;
    counted.set(v.id, need);
    const inBag = input.inBag?.[v.id] ?? 0;
    if (v.sellable <= 0) problems.push({ code: 'SOLD_OUT', slot: slot.index });
    else if (need + inBag > v.sellable) problems.push({ code: 'NOT_ENOUGH', slot: slot.index, stock: v.sellable, need, inBag });
    else if (v.priceMinor === null) problems.push({ code: 'NO_PRICE', slot: slot.index });
  }

  // a colour pair of one product: different colours (K11)
  if (input.needsMix) {
    const seen = new Set<string>();
    for (const slot of slots) {
      const c = slotColour(slot, input.choices[slot.index], variants);
      if (!c) continue;
      if (seen.has(c)) problems.push({ code: 'SAME_COLOUR', slot: slot.index });
      seen.add(c);
    }
  }

  problems.sort((a, b) => (a.slot ?? -1) - (b.slot ?? -1));
  const failing = new Set(problems.map((p) => p.slot));
  return {
    ok: problems.length === 0,
    problems,
    first: problems[0] ?? null,
    variants: slots.map((s) => resolved[s.index]?.id ?? null),
    done: slots.filter((s) => resolved[s.index] && !failing.has(s.index)).length,
    total: slots.length,
  };
}

/** The sizes a slot can still take with the colour picked (a size is offered only while it has stock, D8.1). */
export function openSizes(slot: SetSlot, colourId: string | null, variants: readonly VariantStock[]): string[] {
  return variants.filter((v) => v.productId === slot.productId && v.colourId === colourId && v.sizeId !== null && v.sellable > 0 && (!slot.sizeIds.length || slot.sizeIds.includes(v.sizeId))).map((v) => v.sizeId!);
}

/** "Size for both": sizes every slot can take in its colour (shown first; a slot without a colour yet does not narrow it). */
export function sharedSizes(slots: readonly SetSlot[], choices: readonly (SlotChoice | undefined)[], variants: readonly VariantStock[]): string[] {
  let shared: string[] | null = null;
  for (const s of slots) {
    if (s.fixedVariantId) continue;
    const colour = slotColour(s, choices[s.index], variants);
    if (!colour) continue;
    const open: string[] = openSizes(s, colour, variants);
    shared = shared === null ? open : shared.filter((x) => open.includes(x));
  }
  return shared ?? [];
}
