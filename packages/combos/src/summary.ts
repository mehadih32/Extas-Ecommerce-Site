// PR 96 — the set summary as server functions (the storefront's combo pages call them; no permission: they read only
// what the shop shows). `setSummary` is everything a combo product page needs in one read: the pieces in page order,
// each with its colours in the owner's order (allowed ones only, sold-out ones marked), its sizes and which are still in
// stock per colour, a sensible first colour (a colour pair starts on two different colours), the page and bag look
// (D8.4), and the one set price with its saving and the struck "was" price (CN-009: the separate prices' sum, never
// invented, only when the owner switched struck prices on). `priceSet` re-prices the customer's exact picks — every
// colour can have its own price — with the same check the bag runs, so the button never shows a stale set price.
import { comboWasFor } from '@extas/catalogue';
import { z } from 'zod';
import { parse, setting, type CombosDeps, type Db } from './context';
import { setPricing } from './model';
import { bagUse, comboForSale, setChoicesSchema, type ComboForSale, type ComboSetCheck, type SetChoicesInput } from './set-check';
import { bagTemplateFor, listTemplateFor, pageTemplateFor, setPrice, type PageTemplate, type SetPrice } from './summary-model';
import { checkSet, openSizes, sharedSizes, type SetSlot, type SlotChoice, type VariantStock } from './validate';
import { colourPrice } from './facts';

export interface SetColour {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  /** Some allowed size is in stock in this colour. */
  open: boolean;
  /** This colour's own lowest price. */
  priceMinor: number | null;
}

export interface SetPiece {
  /** 0-based, in page order (one per piece: a pair is two). */
  slot: number;
  itemPosition: number;
  productId: string;
  productSlug: string | null;
  nameEn: string | null;
  nameBn: string | null;
  labelEn: string | null;
  labelBn: string | null;
  fixedVariantId: string | null;
  colours: SetColour[];
  /** The colour the page starts on (null = nothing open). */
  defaultColourId: string | null;
  sizes: { id: string; key: string; label: string }[];
  /** Sizes still in stock, per colour id (allowed ones only). */
  openSizes: Record<string, string[]>;
}

export interface SetSummary {
  comboId: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  type: string;
  state: ComboForSale['view']['state'];
  onSale: boolean;
  endsOn: string | null;
  pieceCount: number;
  /** A colour pair of one product needs two different colours (K11). */
  needsMix: boolean;
  pageTemplate: PageTemplate;
  bagTemplate: string;
  listTemplate: string;
  photoAssetId: string | null;
  pieces: SetPiece[];
  /** The set price from the first colours (each colour can price differently: `priceSet` has the exact one). */
  price: SetPrice;
  /** "Size for both" with the first colours. */
  sharedSizes: string[];
}

const refSchema = z
  .object({ storeId: z.int().min(1), comboId: z.uuid().optional(), slug: z.string().min(1).max(200).optional() })
  .strict()
  .refine((v) => Boolean(v.comboId) !== Boolean(v.slug), { message: 'give the combo id or its link, not both' });
export type SetRefInput = z.input<typeof refSchema>;

const openIn = (slot: SetSlot, colourId: string, variants: readonly VariantStock[]) =>
  variants.some((v) => v.productId === slot.productId && v.colourId === colourId && v.sellable > 0 && (v.sizeId === null || !slot.sizeIds.length || slot.sizeIds.includes(v.sizeId)));

/** Each slot's first colour: the first open allowed one, a colour pair's next slot on a colour not used yet. */
export function firstColours(c: Pick<ComboForSale, 'slots' | 'facts' | 'variants'>, needsMix: boolean): (string | null)[] {
  const used: string[] = [];
  return c.slots.map((s) => {
    const fact = c.facts.get(s.productId);
    if (s.fixedVariantId) return c.variants.find((v) => v.id === s.fixedVariantId)?.colourId ?? null;
    const allowed = (fact?.colours ?? []).filter((x) => !s.colourIds.length || s.colourIds.includes(x.id)).map((x) => x.id);
    const open = allowed.filter((id) => openIn(s, id, c.variants));
    const pick = (needsMix ? open.find((id) => !used.includes(id)) : undefined) ?? open[0] ?? allowed[0] ?? null;
    if (pick) used.push(pick);
    return pick;
  });
}

/** Struck "was" prices switched on by the owner (`rules.discount.showWasPrice`). */
export async function wasAllowed(deps: CombosDeps, storeId: number): Promise<boolean> {
  return (await setting(deps, storeId, 'rules.discount.showWasPrice')) === true;
}

/** Everything a combo product page needs, in one read (any state: an ended combo's page still opens and says so). */
export async function setSummary(deps: CombosDeps, input: SetRefInput, db: Db = deps.db): Promise<SetSummary> {
  const d = parse(refSchema, input, 'set');
  const c = await comboForSale(deps, d.storeId, { comboId: d.comboId, slug: d.slug }, db);
  return summaryOf(deps, d.storeId, c);
}

/** The set price from each slot's first colour (each colour can price differently: `priceSet` has the exact one). */
export function firstPrice(c: Pick<ComboForSale, 'slots' | 'facts' | 'variants' | 'priceRule' | 'rounding' | 'onSale'>, first: readonly (string | null)[], allowed: boolean | null): SetPrice {
  // A fixed set price does not move; a "% off" pair can.
  const pieces = c.slots.map((s) => {
    const fact = c.facts.get(s.productId);
    const fixed = s.fixedVariantId ? c.variants.find((x) => x.id === s.fixedVariantId) : undefined;
    return { priceMinor: fixed ? fixed.priceMinor : fact ? colourPrice(fact, first[s.index] ?? null) : null, quantity: 1 };
  });
  const pricing = setPricing(c.priceRule, pieces, c.rounding);
  return setPrice(pricing, c.slots.length, { allowed, live: c.onSale, separateMinor: comboWasFor(pricing.payMinor, pieces).sumMinor ?? pricing.regularMinor });
}

/** The summary of a combo already read (`comboForSale`): a page that needs more than the summary reads the combo once. */
export async function summaryOf(deps: CombosDeps, storeId: number, c: ComboForSale): Promise<SetSummary> {
  const [shopPage, shopBag, shopList, longListPairs, allowed] = await Promise.all([
    setting(deps, storeId, 'combos.template.page'),
    setting(deps, storeId, 'combos.template.bag'),
    setting(deps, storeId, 'combos.template.list'),
    setting(deps, storeId, 'combos.template.longListPairs'),
    wasAllowed(deps, storeId),
  ]);
  const v = c.view;
  const needsMix = v.oneProduct && !v.sameColour;
  const first = firstColours(c, needsMix);
  const pieces: SetPiece[] = c.slots.map((s) => {
    const fact = c.facts.get(s.productId);
    const item = v.items.find((i) => i.position === s.itemPosition);
    const fixed = s.fixedVariantId ? c.variants.find((x) => x.id === s.fixedVariantId) : undefined;
    const colours = (fact?.colours ?? [])
      .filter((x) => (fixed ? x.id === fixed.colourId : !s.colourIds.length || s.colourIds.includes(x.id)))
      .map((x) => ({ id: x.id, key: x.key, nameEn: x.nameEn, nameBn: x.nameBn, hex: x.hex, open: openIn(s, x.id, c.variants), priceMinor: fact ? colourPrice(fact, x.id) : null }));
    const sizes = (fact?.sizes ?? []).filter((x) => (fixed ? x.id === fixed.sizeId : !s.sizeIds.length || s.sizeIds.includes(x.id))).map((x) => ({ id: x.id, key: x.key, label: x.label }));
    return {
      slot: s.index,
      itemPosition: s.itemPosition,
      productId: s.productId,
      productSlug: fact?.slug ?? null,
      nameEn: fact?.nameEn ?? null,
      nameBn: fact?.nameBn ?? null,
      labelEn: item?.labelEn ?? null,
      labelBn: item?.labelBn ?? null,
      fixedVariantId: s.fixedVariantId,
      colours,
      defaultColourId: first[s.index] ?? null,
      sizes,
      openSizes: Object.fromEntries(colours.map((x) => [x.id, openSizes(s, x.id, c.variants)])),
    };
  });
  const productIds = new Set(c.slots.map((s) => s.productId));
  return {
    comboId: v.id,
    slug: v.slug,
    nameEn: v.nameEn,
    nameBn: v.nameBn,
    descriptionEn: v.descriptionEn,
    descriptionBn: v.descriptionBn,
    type: v.type,
    state: v.state,
    onSale: c.onSale,
    endsOn: v.endsOn,
    pieceCount: c.slots.length,
    needsMix,
    pageTemplate: pageTemplateFor({ combo: v.pageTemplateKey, rule: c.rule?.pageTemplateKey ?? null, shop: shopPage, mixed: productIds.size > 1, pairs: c.rule?.pairs ?? 0, longListPairs }),
    bagTemplate: bagTemplateFor({ combo: v.bagTemplateKey, rule: c.rule?.bagTemplateKey ?? null, shop: shopBag }),
    listTemplate: listTemplateFor({ combo: v.listTemplateKey, rule: c.rule?.listTemplateKey ?? null, shop: shopList }),
    photoAssetId: v.setPhotoAssetId,
    pieces,
    price: firstPrice(c, first, allowed),
    sharedSizes: sharedSizes(
      c.slots,
      first.map((colourId) => ({ colourId }) satisfies SlotChoice),
      c.variants,
    ),
  };
}

export interface PricedSet {
  check: ComboSetCheck;
  /** The set price for exactly these picks; null until every piece resolves to a variant. */
  price: SetPrice | null;
  /** "Size for both" with these colours. */
  sharedSizes: string[];
}

/** The picks checked and priced at their own variants' prices (what the button shows and the bag charges). */
export async function priceSet(deps: CombosDeps, input: SetChoicesInput, db: Db = deps.db): Promise<PricedSet> {
  const d = parse(setChoicesSchema, input, 'set');
  const c = await comboForSale(deps, d.storeId, { comboId: d.comboId, slug: d.slug }, db);
  const [inBag, allowed] = await Promise.all([bagUse(db, d.storeId, d.cartId, d.editGroupKey), wasAllowed(deps, d.storeId)]);
  const check = checkSet({ slots: c.slots, choices: d.choices, sizeForAll: d.sizeForAll, variants: c.variants, inBag, needsMix: c.view.oneProduct && !c.view.sameColour, onSale: c.onSale });
  return { check: { ...check, comboId: c.view.id, slug: c.view.slug }, price: picksPrice(c, check.variants, allowed), sharedSizes: sharedSizes(c.slots, d.choices, c.variants) };
}

/** The set price of resolved picks (null while a piece is still open). The bag (PR 97) locks this number. */
export function picksPrice(c: Pick<ComboForSale, 'variants' | 'priceRule' | 'rounding' | 'onSale'>, variantIds: readonly (string | null)[], allowed: boolean | null): SetPrice | null {
  if (!variantIds.length || variantIds.some((x) => x === null)) return null;
  const pieces = variantIds.map((id) => ({ priceMinor: c.variants.find((x) => x.id === id)?.priceMinor ?? null, quantity: 1 }));
  const pricing = setPricing(c.priceRule, pieces, c.rounding);
  return setPrice(pricing, pieces.length, { allowed, live: c.onSale, separateMinor: comboWasFor(pricing.payMinor, pieces).sumMinor ?? pricing.regularMinor });
}
