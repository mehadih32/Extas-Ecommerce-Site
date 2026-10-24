// PR 97 — a set goes into the bag as one set with its price locked (S04's bag and checkout call these; no staff
// permission: the shop's own bag). A set is one bag line per piece sharing a `comboGroupKey`: each line keeps the
// piece's own price (`unitPriceMinor`, B4: the order and invoice store real piece prices plus one set discount), and
// every line of the set carries the same locked set price (`setPriceMinor`). The bag shows it as one set (D8.4).
//
// The combo audit's money bugs are each closed here, and each has a test:
//   - double add: one add key per tap is idempotent, and the same set again within `combos.bag.repeatGuardMs` is the
//     same add (the cart row is locked while adding, so two taps at once still make one set);
//   - oversell: the set check (PR 101) runs again inside the write, counting what the bag already holds;
//   - stale set price: the price is worked out on the server from the picks' own prices at the moment of adding —
//     never taken from the browser — and with `combos.bag.followPriceChanges` a live set follows a new combo price;
//   - a set price above the regular price: the regular total is charged, with no saving (setPricing, R16 (5)).
// A set whose offer ended while in the bag keeps the price it got, with a note (D8.3). Stock is held by checkout
// (S04 calls the inventory's holdCart), not by adding.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, TX, type CombosDeps, type Db, type Tx } from './context';
import { CombosError } from './errors';
import { checkSet } from './validate';
import { bagUse, comboForSale, type ComboForSale } from './set-check';
import { picksPrice, wasAllowed } from './summary';
import { recordSetAdded } from './analytics';
import type { SetPrice } from './summary-model';

/** Where a bag line came from (PR 338 events). */
export const SET_SOURCE = 'combo';

const choices = z.array(z.object({ colourId: z.uuid().nullable().optional(), sizeId: z.uuid().nullable().optional() }).strict().optional()).max(20);

export const addSetSchema = z
  .object({
    storeId: z.int().min(1),
    cartId: z.uuid(),
    comboId: z.uuid().optional(),
    slug: z.string().min(1).max(200).optional(),
    choices,
    sizeForAll: z.uuid().nullable().optional(),
    /** One key per tap, made by the page: the same key twice is the same add. */
    addKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional(),
    /** Where the add came from ("combo" by default; "set", "upsell" …). */
    source: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
    /** PR 573 · this add takes the place of a set already in the bag (its colours changed to another combo of the same
     * rule, or "add 1 more" made it a 3-piece set): that set's lines are archived in the same write, never deleted. */
    replaceGroupKey: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.comboId) !== Boolean(v.slug), { message: 'give the combo id or its link, not both' });
export type AddSetInput = z.input<typeof addSetSchema>;

export const changeSetSchema = z
  .object({ storeId: z.int().min(1), cartId: z.uuid(), groupKey: z.string().min(1).max(120), choices, sizeForAll: z.uuid().nullable().optional() })
  .strict();
export type ChangeSetInput = z.input<typeof changeSetSchema>;

const groupSchema = z.object({ storeId: z.int().min(1), cartId: z.uuid(), groupKey: z.string().min(1).max(120) }).strict();
const cartSchema = z.object({ storeId: z.int().min(1), cartId: z.uuid() }).strict();

export interface BagSetLine {
  id: string;
  variantId: string;
  /** The piece's own price kept on the line. */
  unitPriceMinor: number;
}

export interface AddedSet {
  /** false = this was the same add again (a double tap or a resent request): nothing new went in. */
  added: boolean;
  groupKey: string;
  comboId: string;
  lines: BagSetLine[];
  /** The locked set price. */
  setPriceMinor: number;
  price: SetPrice;
}

/** The open cart, locked for this write (two adds at once wait for each other). */
export async function openCart(tx: Tx, storeId: number, cartId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "Cart" WHERE "id" = ${cartId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (rows[0]?.status !== 'ACTIVE') throw new CombosError('CART_NOT_OPEN', 'the bag is not open', ['cartId']);
}

const groupKeyOf = (addKey: string | undefined) => `set-${addKey ?? randomUUID()}`;
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Checks the picks against live stock and the bag, and prices them; throws SET_INVALID with every problem. */
async function checkedPicks(deps: CombosDeps, tx: Tx, c: ComboForSale, d: { storeId: number; cartId: string; choices: z.output<typeof choices>; sizeForAll?: string | null }, editGroupKey?: string) {
  const inBag = await bagUse(tx, d.storeId, d.cartId, editGroupKey);
  const check = checkSet({ slots: c.slots, choices: d.choices, sizeForAll: d.sizeForAll, variants: c.variants, inBag, needsMix: c.view.oneProduct && !c.view.sameColour, onSale: c.onSale });
  const price = check.ok ? picksPrice(c, check.variants, await wasAllowed(deps, d.storeId)) : null;
  if (!check.ok || !price || price.payMinor === null) {
    const issues = check.problems.length ? check.problems.map((p) => (p.slot === null ? p.code : `${p.code}@${p.slot}`)) : ['NO_PRICE'];
    throw new CombosError('SET_INVALID', 'the set cannot go in the bag as picked', issues);
  }
  return { variants: check.variants as string[], price, payMinor: price.payMinor };
}

const lineSelect = { id: true, variantId: true, unitPriceMinor: true } as const;

/** Adds a set to the bag as one set with its price locked (or returns the same set when it is the same add again). */
export async function addSetToBag(deps: CombosDeps, input: AddSetInput): Promise<AddedSet> {
  const d = parse(addSetSchema, input, 'set');
  checkStoreId(d.storeId);
  const guardMs = await setting(deps, d.storeId, 'combos.bag.repeatGuardMs');
  return deps.db.$transaction(async (tx) => {
    await openCart(tx, d.storeId, d.cartId);
    const c = await comboForSale(deps, d.storeId, { comboId: d.comboId, slug: d.slug }, tx);
    const again = async (groupKey: string): Promise<AddedSet | null> => {
      const lines = await tx.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: groupKey, removedAt: null }, select: { ...lineSelect, setPriceMinor: true } });
      if (!lines.length) return null;
      const price = picksPrice(c, lines.map((l) => l.variantId), await wasAllowed(deps, d.storeId));
      return { added: false, groupKey, comboId: c.view.id, lines: lines.map(({ setPriceMinor: _, ...l }) => l), setPriceMinor: lines[0]!.setPriceMinor ?? 0, price: price! };
    };
    // The same tap again (its key), before anything else.
    if (d.addKey) {
      const same = await again(groupKeyOf(d.addKey));
      if (same) return same;
    }
    // The same set again within the guard window is the same add (checked before stock: a double tap after the first
    // add took the last piece is still the same set, not "sold out"). A replacement is never a repeat.
    const wanted = checkSet({ slots: c.slots, choices: d.choices, sizeForAll: d.sizeForAll, variants: c.variants, needsMix: false, onSale: true }).variants;
    if (!d.replaceGroupKey && wanted.every((v) => v !== null)) {
      const repeat = await recentSame(tx, d, c.view.id, guardMs, nowOf(deps), wanted as string[]);
      if (repeat) return (await again(repeat))!;
    }
    // PR 573 · the set it replaces must be in this bag; its pieces do not count against the new set's stock
    if (d.replaceGroupKey && !(await tx.cartItem.count({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: d.replaceGroupKey, removedAt: null } }))) {
      throw new CombosError('NOT_FOUND', 'no such set in this bag', ['replaceGroupKey']);
    }
    const picks = await checkedPicks(deps, tx, c, d, d.replaceGroupKey);
    const groupKey = groupKeyOf(d.addKey);
    const unit = new Map(c.variants.map((v) => [v.id, v.priceMinor!]));
    const at = nowOf(deps);
    if (d.replaceGroupKey) await tx.cartItem.updateMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: d.replaceGroupKey, removedAt: null }, data: { removedAt: at } });
    for (const variantId of picks.variants) {
      await tx.cartItem.create({
        data: { storeId: d.storeId, cartId: d.cartId, variantId, quantity: 1, unitPriceMinor: unit.get(variantId)!, comboId: c.view.id, comboGroupKey: groupKey, setPriceMinor: picks.payMinor, source: d.source ?? SET_SOURCE, createdAt: at },
      });
    }
    await tx.cart.update({ where: { id: d.cartId }, data: { lastActivityAt: at } });
    // PR 104 — one set added, and its colour pair counted (the same write: a refused add counts nothing).
    const colourOf = new Map(c.variants.map((v) => [v.id, v.colourId]));
    await recordSetAdded(deps, tx, { storeId: d.storeId, comboId: c.view.id, colourIds: picks.variants.map((v) => colourOf.get(v) ?? null), at });
    const lines = await tx.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: groupKey, removedAt: null }, select: lineSelect, orderBy: { createdAt: 'asc' } });
    return { added: true, groupKey, comboId: c.view.id, lines, setPriceMinor: picks.payMinor, price: picks.price };
  }, TX);
}

/** The same combo added to this bag within the guard window (with the same pieces, when they are known). */
async function recentSame(tx: Db, d: { storeId: number; cartId: string }, comboId: string, guardMs: number, now: Date, variants: readonly string[]): Promise<string | null> {
  if (guardMs <= 0) return null;
  const lines = await tx.cartItem.findMany({
    where: { storeId: d.storeId, cartId: d.cartId, comboId, savedForLater: false, removedAt: null, comboGroupKey: { not: null }, createdAt: { gte: new Date(now.getTime() - guardMs) } },
    select: { variantId: true, comboGroupKey: true },
    orderBy: { createdAt: 'desc' },
  });
  const groups = new Map<string, string[]>();
  for (const l of lines) groups.set(l.comboGroupKey!, [...(groups.get(l.comboGroupKey!) ?? []), l.variantId]);
  for (const [key, vs] of groups) if (sameSet(vs, variants)) return key;
  return null;
}

/** Changes the colours or sizes of a set already in the bag (B2), re-checked and re-priced; its lines are updated in place. */
export async function changeSetInBag(deps: CombosDeps, input: ChangeSetInput): Promise<AddedSet> {
  const d = parse(changeSetSchema, input, 'set');
  checkStoreId(d.storeId);
  return deps.db.$transaction(async (tx) => {
    await openCart(tx, d.storeId, d.cartId);
    const lines = await tx.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: d.groupKey, removedAt: null }, select: { id: true, comboId: true }, orderBy: { createdAt: 'asc' } });
    if (!lines.length || !lines[0]!.comboId) throw new CombosError('NOT_FOUND', 'no such set in this bag', ['groupKey']);
    const c = await comboForSale(deps, d.storeId, { comboId: lines[0]!.comboId }, tx);
    const picks = await checkedPicks(deps, tx, c, d, d.groupKey);
    if (picks.variants.length !== lines.length) throw new CombosError('SET_INVALID', 'the set has changed its pieces; add it again', ['PIECES']);
    const unit = new Map(c.variants.map((v) => [v.id, v.priceMinor!]));
    for (const [i, l] of lines.entries()) {
      const variantId = picks.variants[i]!;
      await tx.cartItem.update({ where: { id: l.id }, data: { variantId, unitPriceMinor: unit.get(variantId)!, setPriceMinor: picks.payMinor } });
    }
    await tx.cart.update({ where: { id: d.cartId }, data: { lastActivityAt: nowOf(deps) } });
    const out = await tx.cartItem.findMany({ where: { id: { in: lines.map((l) => l.id) } }, select: lineSelect, orderBy: { createdAt: 'asc' } });
    return { added: false, groupKey: d.groupKey, comboId: c.view.id, lines: out, setPriceMinor: picks.payMinor, price: picks.price };
  }, TX);
}

/**
 * Takes a whole set out of the bag (never one piece of it: the set price belongs to all its pieces). Its lines are
 * archived, never deleted (S04 PR 105, CLAUDE.md hard rule 3), so the bag's "Undo" puts the same set back.
 */
export async function removeSetFromBag(deps: CombosDeps, input: z.input<typeof groupSchema>): Promise<{ removed: number }> {
  const d = parse(groupSchema, input, 'set');
  return deps.db.$transaction(async (tx) => {
    await openCart(tx, d.storeId, d.cartId);
    const { count } = await tx.cartItem.updateMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: d.groupKey, removedAt: null }, data: { removedAt: nowOf(deps) } });
    if (!count) throw new CombosError('NOT_FOUND', 'no such set in this bag', ['groupKey']);
    return { removed: count };
  }, TX);
}

/** Moves a whole set to "Saved for later" and back (D8.4, Note 23.17). */
export async function saveSetForLater(deps: CombosDeps, input: z.input<typeof groupSchema> & { saved: boolean }): Promise<{ moved: number }> {
  const { saved, ...rest } = input;
  const d = parse(groupSchema, rest, 'set');
  return deps.db.$transaction(async (tx) => {
    await openCart(tx, d.storeId, d.cartId);
    const { count } = await tx.cartItem.updateMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: d.groupKey, removedAt: null }, data: { savedForLater: z.boolean().parse(saved) } });
    if (!count) throw new CombosError('NOT_FOUND', 'no such set in this bag', ['groupKey']);
    return { moved: count };
  }, TX);
}

/** A note on a set in the bag. */
export type BagSetNote = 'ENDED_KEEPS_PRICE' | 'PRICE_CHANGED' | null;

export interface BagSet {
  groupKey: string;
  comboId: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  state: ComboForSale['view']['state'];
  savedForLater: boolean;
  lines: (BagSetLine & { productId: string | null; colourId: string | null; sizeId: string | null })[];
  /** The price the set was locked at. */
  lockedMinor: number;
  /** What the bag charges for it now. */
  payMinor: number;
  /** The pieces' own prices kept on the lines (the "regular" the saving is shown against). */
  regularMinor: number;
  savingMinor: number;
  note: BagSetNote;
}

/**
 * The sets in a bag, one entry per set. A live set follows a new combo price when `combos.bag.followPriceChanges` is
 * on (the bag says so); an ended one keeps the price it got (D8.3). Reading writes nothing — `refreshBagSets` does.
 */
export async function bagSets(deps: CombosDeps, input: z.input<typeof cartSchema>, db: Db = deps.db): Promise<BagSet[]> {
  const d = parse(cartSchema, input, 'bag');
  const lines = await db.cartItem.findMany({
    where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: { not: null }, comboId: { not: null }, removedAt: null },
    select: { ...lineSelect, comboId: true, comboGroupKey: true, setPriceMinor: true, savedForLater: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!lines.length) return [];
  const variantRows = await db.productVariant.findMany({ where: { storeId: d.storeId, id: { in: [...new Set(lines.map((l) => l.variantId))] } }, select: { id: true, productId: true, colourId: true, sizeId: true } });
  const variantOf = new Map(variantRows.map((v) => [v.id, v]));
  const [follow, allowed] = await Promise.all([setting(deps, d.storeId, 'combos.bag.followPriceChanges'), wasAllowed(deps, d.storeId)]);
  const combos = new Map<string, ComboForSale | null>();
  for (const id of new Set(lines.map((l) => l.comboId!))) combos.set(id, await comboForSale(deps, d.storeId, { comboId: id }, db).catch(() => null));
  const groups = new Map<string, typeof lines>();
  for (const l of lines) groups.set(l.comboGroupKey!, [...(groups.get(l.comboGroupKey!) ?? []), l]);
  const out: BagSet[] = [];
  for (const [groupKey, ls] of groups) {
    const c = combos.get(ls[0]!.comboId!) ?? null;
    const locked = ls[0]!.setPriceMinor ?? ls.reduce((s, l) => s + l.unitPriceMinor, 0);
    const live = c?.onSale ?? false;
    const now = live && follow ? picksPrice(c!, ls.map((l) => l.variantId), allowed) : null;
    const payMinor = now?.payMinor ?? locked;
    const regularMinor = live && follow && now?.regularMinor != null ? now.regularMinor : ls.reduce((s, l) => s + l.unitPriceMinor, 0);
    out.push({
      groupKey,
      comboId: ls[0]!.comboId!,
      slug: c?.view.slug ?? '',
      nameEn: c?.view.nameEn ?? '',
      nameBn: c?.view.nameBn ?? null,
      state: c?.view.state ?? 'ended',
      savedForLater: ls.every((l) => l.savedForLater),
      lines: ls.map((l) => ({ id: l.id, variantId: l.variantId, unitPriceMinor: l.unitPriceMinor, productId: variantOf.get(l.variantId)?.productId ?? null, colourId: variantOf.get(l.variantId)?.colourId ?? null, sizeId: variantOf.get(l.variantId)?.sizeId ?? null })),
      lockedMinor: locked,
      payMinor,
      regularMinor,
      savingMinor: Math.max(0, regularMinor - payMinor),
      note: !live ? 'ENDED_KEEPS_PRICE' : payMinor !== locked ? 'PRICE_CHANGED' : null,
    });
  }
  return out;
}

/** Writes each live set's current set and piece prices into the bag when it follows price changes (S04 calls it
 * before checkout); ended sets keep theirs. */
export async function refreshBagSets(deps: CombosDeps, input: z.input<typeof cartSchema>): Promise<{ changed: string[] }> {
  const d = parse(cartSchema, input, 'bag');
  return deps.db.$transaction(async (tx) => {
    await openCart(tx, d.storeId, d.cartId);
    const follow = await setting(deps, d.storeId, 'combos.bag.followPriceChanges');
    const changed: string[] = [];
    for (const s of await bagSets(deps, d, tx)) {
      if (s.note === 'ENDED_KEEPS_PRICE' || !follow) continue;
      const c = await comboForSale(deps, d.storeId, { comboId: s.comboId }, tx);
      const unit = new Map(c.variants.map((v) => [v.id, v.priceMinor]));
      const moved = s.lines.filter((l) => (unit.get(l.variantId) ?? l.unitPriceMinor) !== l.unitPriceMinor);
      if (s.payMinor === s.lockedMinor && !moved.length) continue;
      for (const l of s.lines) await tx.cartItem.update({ where: { id: l.id }, data: { setPriceMinor: s.payMinor, unitPriceMinor: unit.get(l.variantId) ?? l.unitPriceMinor } });
      changed.push(s.groupKey);
    }
    return { changed };
  }, TX);
}
