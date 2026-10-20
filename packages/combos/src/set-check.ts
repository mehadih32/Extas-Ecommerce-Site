// PR 101 — the server's set check (the storefront and the bag call it; no permission: it reads only what is on sale).
// It loads the combo by id or link, its pieces' live variants with what can be sold now (S09), and what the
// customer's bag already holds of them, then runs the same pure check the page runs (validate.ts). The bag (PR 97)
// runs it again inside its own write, so a set can never go in with a piece that is missing or oversold.
import { z } from 'zod';
import { checkStoreId, liveStore, nowOf, parse, setting, type CombosDeps, type Db } from './context';
import { comboSelect, roundingOf, toComboView, type ComboRow, type ComboView } from './combos-service';
import { CombosError } from './errors';
import { productFacts, type ProductFact } from './facts';
import { checkSet, expandSlots, type SetCheck, type SetSlot, type VariantStock } from './validate';

export const setChoicesSchema = z
  .object({
    storeId: z.int().min(1),
    comboId: z.uuid().optional(),
    slug: z.string().min(1).max(200).optional(),
    choices: z.array(z.object({ colourId: z.uuid().nullable().optional(), sizeId: z.uuid().nullable().optional() }).strict().optional()).max(20),
    sizeForAll: z.uuid().nullable().optional(),
    /** The customer's bag, to count what it already holds. */
    cartId: z.uuid().optional(),
    /** The set being changed in the bag (its own pieces are not counted twice). */
    editGroupKey: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.comboId) !== Boolean(v.slug), { message: 'give the combo id or its link, not both' });
export type SetChoicesInput = z.input<typeof setChoicesSchema>;

export interface ComboForSale {
  row: ComboRow;
  view: ComboView;
  facts: Map<string, ProductFact>;
  slots: SetSlot[];
  variants: VariantStock[];
  /** On sale now: live, priced, every piece's product published. */
  onSale: boolean;
}

/** The combo with its pieces' facts (any state: an ended combo's page still opens and says so). */
export async function comboForSale(deps: CombosDeps, storeId: number, ref: { comboId?: string; slug?: string }, db: Db = deps.db): Promise<ComboForSale> {
  checkStoreId(storeId);
  await liveStore(db, storeId);
  const row = await db.combo.findFirst({ where: { storeId, archivedAt: null, ...(ref.comboId ? { id: ref.comboId } : { slug: ref.slug }) }, select: comboSelect });
  if (!row) throw new CombosError('NOT_FOUND', 'no such combo in this store', [ref.comboId ? 'comboId' : 'slug']);
  const ids = row.items.flatMap((i) => (i.productId ? [i.productId] : []));
  const [facts, rounding, timeZone] = await Promise.all([productFacts({ db, settings: deps.settings }, storeId, ids), roundingOf(deps, storeId), setting(deps, storeId, 'store.timeZone')]);
  const view = toComboView(row, facts, { now: nowOf(deps), timeZone, rounding });
  const slots = expandSlots(view.items);
  const variants = [...facts.values()].flatMap((p) => p.variants.map((v) => ({ id: v.id, productId: p.id, colourId: v.colourId, sizeId: v.sizeId, sellable: v.sellable, priceMinor: v.priceMinor })));
  const published = ids.every((id) => facts.get(id)?.published);
  const onSale = view.state === 'live' && view.blocking.length === 0 && view.pricing.payMinor !== null && published && slots.length > 1;
  return { row, view, facts, slots, variants, onSale };
}

/** Pieces of each variant in the customer's open bag (saved-for-later lines and the set being changed left out). */
export async function bagUse(db: Db, storeId: number, cartId: string | undefined, editGroupKey?: string): Promise<Record<string, number>> {
  if (!cartId) return {};
  const cart = await db.cart.findFirst({ where: { id: cartId, storeId }, select: { status: true } });
  if (!cart || cart.status !== 'ACTIVE') return {};
  const lines = await db.cartItem.findMany({ where: { storeId, cartId, savedForLater: false }, select: { variantId: true, quantity: true, comboGroupKey: true } });
  const out: Record<string, number> = {};
  for (const l of lines) if (!editGroupKey || l.comboGroupKey !== editGroupKey) out[l.variantId] = (out[l.variantId] ?? 0) + l.quantity;
  return out;
}

export interface ComboSetCheck extends SetCheck {
  comboId: string;
  slug: string;
}

/** What is still missing before this set can go into the bag (the page's button reads `first`). */
export async function checkComboSet(deps: CombosDeps, input: SetChoicesInput, db: Db = deps.db): Promise<ComboSetCheck> {
  const d = parse(setChoicesSchema, input, 'set');
  const c = await comboForSale(deps, d.storeId, { comboId: d.comboId, slug: d.slug }, db);
  const inBag = await bagUse(db, d.storeId, d.cartId, d.editGroupKey);
  const check = checkSet({ slots: c.slots, choices: d.choices, sizeForAll: d.sizeForAll, variants: c.variants, inBag, needsMix: c.view.oneProduct && !c.view.sameColour, onSale: c.onSale });
  return { ...check, comboId: c.view.id, slug: c.view.slug };
}
