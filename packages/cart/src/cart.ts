// PR 105 — the bag: one open bag per visitor and store, its lines and their quantities, kept across visits. The visitor
// is the random id in the shop's bag cookie (the app makes it; it says nothing about the person). A bag whose last
// change is older than `bag.keepDays` is not picked up again: a new one starts.
//
// Every write locks the bag row first, so two taps at once wait for each other. A line the customer takes out is
// archived (`removedAt`), never deleted (CLAUDE.md hard rule 3), so "Undo" puts the same line back. Stock is checked
// on every add and every bigger quantity against what can be sold now, counting what the rest of the bag already
// holds; it is held only at checkout (the inventory's holdCart). A single item's price on the line is the variant's
// own price at the moment of adding (the bag says so when it has changed since); what the customer pays is always
// worked out again by the rules engine from the database. Set lines (PR 97, 108) are written by the combos package
// and moved, taken out and put back here as a whole set.
import { bagUse, productFacts, removeSetFromBag, saveSetForLater } from '@extas/combos';
import { z } from 'zod';
import { CartError, checkStoreId, nowOf, parse, setting, TX, type CartDeps, type Db, type Tx } from './context';
import { SIZE_ANSWERS, type SizeAnswer } from './pure';

const uuid = z.uuid();
/** The shop's visitor id: random, made by the app (base64url). */
export const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/);

const bagRef = z.object({ storeId: z.int().min(1), cartId: uuid }).strict();
const lineRef = bagRef.extend({ lineId: uuid }).strict();

/** The open bag of a visitor, or null (none yet, or older than `bag.keepDays`). */
export async function findBag(deps: CartDeps, input: { storeId: number; visitorId: string }, db: Db = deps.db): Promise<string | null> {
  checkStoreId(input.storeId);
  if (!visitorIdSchema.safeParse(input.visitorId).success) return null;
  const days = await setting(deps, input.storeId, 'bag.keepDays');
  const since = new Date(nowOf(deps).getTime() - days * 86_400_000);
  const row = await db.cart.findFirst({
    where: { storeId: input.storeId, visitorId: input.visitorId, status: 'ACTIVE', lastActivityAt: { gte: since } },
    orderBy: { lastActivityAt: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** The visitor's open bag, made when there is none (two first adds at once still make one bag). */
export async function openBag(deps: CartDeps, input: { storeId: number; visitorId: string }): Promise<{ cartId: string; created: boolean }> {
  checkStoreId(input.storeId);
  const visitorId = parse(visitorIdSchema, input.visitorId, 'visitor');
  return deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bag:${input.storeId}:${visitorId}`}, 0))`;
    const id = await findBag(deps, { storeId: input.storeId, visitorId }, tx);
    if (id) return { cartId: id, created: false };
    const c = await tx.cart.create({ data: { storeId: input.storeId, visitorId, lastActivityAt: nowOf(deps) }, select: { id: true } });
    return { cartId: c.id, created: true };
  }, TX);
}

/** Locks the open bag for this write. */
async function lockBag(tx: Tx, storeId: number, cartId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "Cart" WHERE "id" = ${cartId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (rows[0]?.status !== 'ACTIVE') throw new CartError('CART_NOT_OPEN', 'the bag is not open', ['cartId']);
}

const touch = (tx: Tx, deps: CartDeps, cartId: string) => tx.cart.update({ where: { id: cartId }, data: { lastActivityAt: nowOf(deps) } });

/** A variant on sale now: live, priced, of a published product of this store. */
async function saleVariant(tx: Db, storeId: number, variantId: string) {
  const v = await tx.productVariant.findFirst({
    where: { id: variantId, storeId, archivedAt: null },
    select: { id: true, productId: true, priceMinor: true, active: true, product: { select: { status: true, archivedAt: true } } },
  });
  if (!v) throw new CartError('NOT_FOUND', 'no such item', ['variantId']);
  if (!v.active || v.priceMinor === null || v.product.status !== 'PUBLISHED' || v.product.archivedAt) throw new CartError('NOT_FOR_SALE', 'this item is not on sale', ['variantId']);
  return { id: v.id, productId: v.productId, priceMinor: v.priceMinor };
}

/** Throws OUT_OF_STOCK unless `quantity` more pieces of the variant can be sold on top of what the bag holds. */
async function checkStock(deps: CartDeps, tx: Tx, storeId: number, cartId: string, v: { id: string; productId: string }, quantity: number, exceptLineId?: string): Promise<void> {
  const max = await setting(deps, storeId, 'inventory.reservation.maxUnitsPerLine');
  const facts = await productFacts({ db: tx, settings: deps.settings }, storeId, [v.productId]);
  const sellable = facts.get(v.productId)?.variants.find((x) => x.id === v.id)?.sellable ?? 0;
  let held = (await bagUse(tx, storeId, cartId))[v.id] ?? 0;
  if (exceptLineId) {
    const own = await tx.cartItem.findFirst({ where: { id: exceptLineId, savedForLater: false, removedAt: null }, select: { quantity: true } });
    held -= own?.quantity ?? 0;
  }
  if (held + quantity > max) throw new CartError('TOO_MANY', `at most ${max} pieces of one item`, [`${v.id}:${max}`]);
  if (held + quantity > sellable) throw new CartError('OUT_OF_STOCK', 'not that many pieces can be sold now', [`${v.id}:${Math.max(0, sellable - held)}`]);
}

const lineWhere = (d: { storeId: number; cartId: string; lineId: string }) => ({ id: d.lineId, storeId: d.storeId, cartId: d.cartId });

async function lineOf(tx: Tx, d: { storeId: number; cartId: string; lineId: string }) {
  const l = await tx.cartItem.findFirst({ where: lineWhere(d) });
  if (!l) throw new CartError('NOT_FOUND', 'no such line in this bag', ['lineId']);
  return l;
}

export const addItemSchema = bagRef
  .extend({
    variantId: uuid,
    quantity: z.int().min(1).max(10_000).default(1),
    /** Where the add came from (PR 338): "product", "upsell", "saved" … */
    source: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  })
  .strict();

export type AddResult =
  | { added: true; lineId: string; quantity: number }
  /** ALREADY: the same item is in the bag and `bag.duplicateAdd` is "block"; REPEAT: the same tap again. */
  | { added: false; reason: 'ALREADY' | 'REPEAT'; lineId: string; quantity: number };

/** Adds an item (one variant) to the bag. */
export async function addItem(deps: CartDeps, input: z.input<typeof addItemSchema>): Promise<AddResult> {
  const d = parse(addItemSchema, input, 'item');
  const [mode, guardMs] = await Promise.all([setting(deps, d.storeId, 'bag.duplicateAdd'), setting(deps, d.storeId, 'bag.repeatGuardMs')]);
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    const v = await saleVariant(tx, d.storeId, d.variantId);
    const now = nowOf(deps);
    const same = await tx.cartItem.findFirst({
      where: { storeId: d.storeId, cartId: d.cartId, variantId: v.id, comboGroupKey: null, removedAt: null },
      orderBy: [{ savedForLater: 'asc' }, { updatedAt: 'desc' }],
    });
    if (same && !same.savedForLater) {
      // A double tap is the same add, whatever the duplicate rule says (the time of the last add is the line's own,
      // written with the bag's clock).
      if (guardMs > 0 && now.getTime() - same.updatedAt.getTime() < guardMs) return { added: false, reason: 'REPEAT', lineId: same.id, quantity: same.quantity };
      if (mode === 'block') return { added: false, reason: 'ALREADY', lineId: same.id, quantity: same.quantity };
      await checkStock(deps, tx, d.storeId, d.cartId, v, d.quantity);
      const r = await tx.cartItem.update({ where: { id: same.id }, data: { quantity: same.quantity + d.quantity, updatedAt: now } });
      await touch(tx, deps, d.cartId);
      return { added: true, lineId: r.id, quantity: r.quantity };
    }
    await checkStock(deps, tx, d.storeId, d.cartId, v, d.quantity);
    if (same) {
      // The same item saved for later comes back into the bag instead of making a second line.
      const r = await tx.cartItem.update({ where: { id: same.id }, data: { savedForLater: false, quantity: d.quantity, unitPriceMinor: v.priceMinor, updatedAt: now } });
      await touch(tx, deps, d.cartId);
      return { added: true, lineId: r.id, quantity: r.quantity };
    }
    const r = await tx.cartItem.create({ data: { storeId: d.storeId, cartId: d.cartId, variantId: v.id, quantity: d.quantity, unitPriceMinor: v.priceMinor, source: d.source ?? null, createdAt: now, updatedAt: now } });
    await touch(tx, deps, d.cartId);
    return { added: true, lineId: r.id, quantity: r.quantity };
  }, TX);
}

export const quantitySchema = lineRef.extend({ quantity: z.int().min(1).max(10_000) }).strict();

/** Sets a single item's quantity (a set's quantity is always one set; it is added again instead). */
export async function setQuantity(deps: CartDeps, input: z.input<typeof quantitySchema>): Promise<{ lineId: string; quantity: number }> {
  const d = parse(quantitySchema, input, 'quantity');
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    const l = await lineOf(tx, d);
    if (l.removedAt || l.savedForLater || l.comboGroupKey) throw new CartError('NOT_FOUND', 'no such item in the bag', ['lineId']);
    if (d.quantity > l.quantity) {
      const v = await saleVariant(tx, d.storeId, l.variantId);
      await checkStock(deps, tx, d.storeId, d.cartId, v, d.quantity, l.id);
    }
    const r = await tx.cartItem.update({ where: { id: l.id }, data: { quantity: d.quantity } });
    await touch(tx, deps, d.cartId);
    return { lineId: r.id, quantity: r.quantity };
  }, TX);
}

export const changeVariantSchema = lineRef.extend({ variantId: uuid }).strict();

/**
 * Changes a single item to another colour or size of the same product, right in the bag. Refused when the stock cannot
 * cover the line's quantity; a change onto an item already in the bag joins the two lines.
 */
export async function changeVariant(deps: CartDeps, input: z.input<typeof changeVariantSchema>): Promise<{ lineId: string; quantity: number; joined: boolean }> {
  const d = parse(changeVariantSchema, input, 'change');
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    const l = await lineOf(tx, d);
    if (l.removedAt || l.savedForLater || l.comboGroupKey) throw new CartError('NOT_FOUND', 'no such item in the bag', ['lineId']);
    if (l.variantId === d.variantId) return { lineId: l.id, quantity: l.quantity, joined: false };
    const [was, v] = await Promise.all([tx.productVariant.findFirst({ where: { id: l.variantId }, select: { productId: true } }), saleVariant(tx, d.storeId, d.variantId)]);
    if (was?.productId !== v.productId) throw new CartError('INVALID_INPUT', 'only a colour or size of the same product', ['variantId']);
    await checkStock(deps, tx, d.storeId, d.cartId, v, l.quantity);
    const other = await tx.cartItem.findFirst({ where: { storeId: d.storeId, cartId: d.cartId, variantId: v.id, comboGroupKey: null, removedAt: null, savedForLater: false } });
    if (other) {
      const r = await tx.cartItem.update({ where: { id: other.id }, data: { quantity: other.quantity + l.quantity } });
      await tx.cartItem.update({ where: { id: l.id }, data: { removedAt: nowOf(deps) } });
      await touch(tx, deps, d.cartId);
      return { lineId: r.id, quantity: r.quantity, joined: true };
    }
    const r = await tx.cartItem.update({ where: { id: l.id }, data: { variantId: v.id, unitPriceMinor: v.priceMinor } });
    await touch(tx, deps, d.cartId);
    return { lineId: r.id, quantity: r.quantity, joined: false };
  }, TX);
}

/** Takes a line out of the bag (a set's line takes the whole set). Archived, so `restoreLine` can put it back. */
export async function removeLine(deps: CartDeps, input: z.input<typeof lineRef>): Promise<{ lineIds: string[] }> {
  const d = parse(lineRef, input, 'line');
  const l = await deps.db.cartItem.findFirst({ where: lineWhere(d), select: { id: true, comboGroupKey: true, removedAt: true } });
  if (!l || l.removedAt) throw new CartError('NOT_FOUND', 'no such line in this bag', ['lineId']);
  if (l.comboGroupKey) {
    const ids = (await deps.db.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: l.comboGroupKey, removedAt: null }, select: { id: true } })).map((x) => x.id);
    await removeSetFromBag({ db: deps.db, settings: deps.settings, now: deps.now }, { storeId: d.storeId, cartId: d.cartId, groupKey: l.comboGroupKey }).catch(rethrow);
    await deps.db.cart.update({ where: { id: d.cartId }, data: { lastActivityAt: nowOf(deps) } });
    return { lineIds: ids };
  }
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    await tx.cartItem.update({ where: { id: l.id }, data: { removedAt: nowOf(deps) } });
    await touch(tx, deps, d.cartId);
    return { lineIds: [l.id] };
  }, TX);
}

/** "Undo": puts a line taken out back into the bag (a set comes back whole), when the stock still allows it. */
export async function restoreLine(deps: CartDeps, input: z.input<typeof lineRef>): Promise<{ lineIds: string[] }> {
  const d = parse(lineRef, input, 'line');
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    const l = await lineOf(tx, d);
    if (!l.removedAt) return { lineIds: [l.id] };
    const lines = l.comboGroupKey
      ? await tx.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: l.comboGroupKey, removedAt: l.removedAt } })
      : [l];
    if (!l.savedForLater) {
      const need = new Map<string, number>();
      for (const x of lines) need.set(x.variantId, (need.get(x.variantId) ?? 0) + x.quantity);
      for (const [variantId, quantity] of need) {
        const v = await tx.productVariant.findFirst({ where: { id: variantId, storeId: d.storeId }, select: { id: true, productId: true } });
        if (!v) throw new CartError('NOT_FOR_SALE', 'this item is not on sale', ['variantId']);
        await checkStock(deps, tx, d.storeId, d.cartId, v, quantity);
      }
    }
    await tx.cartItem.updateMany({ where: { id: { in: lines.map((x) => x.id) } }, data: { removedAt: null } });
    await touch(tx, deps, d.cartId);
    return { lineIds: lines.map((x) => x.id) };
  }, TX);
}

export const savedSchema = lineRef.extend({ saved: z.boolean() }).strict();

/** Moves a line to "Saved for later" or back into the bag (a set moves whole). Back into the bag checks the stock. */
export async function saveForLater(deps: CartDeps, input: z.input<typeof savedSchema>): Promise<{ lineIds: string[] }> {
  const d = parse(savedSchema, input, 'saved');
  const l = await deps.db.cartItem.findFirst({ where: lineWhere(d), select: { id: true, comboGroupKey: true, removedAt: true, savedForLater: true, variantId: true, quantity: true } });
  if (!l || l.removedAt) throw new CartError('NOT_FOUND', 'no such line in this bag', ['lineId']);
  if (l.comboGroupKey) {
    const ids = (await deps.db.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, comboGroupKey: l.comboGroupKey, removedAt: null }, select: { id: true } })).map((x) => x.id);
    if (!d.saved) {
      // Back into the bag: every piece must still be there to sell.
      await deps.db.$transaction(async (tx) => {
        await lockBag(tx, d.storeId, d.cartId);
        const pieces = await tx.cartItem.findMany({ where: { id: { in: ids } }, select: { variantId: true, quantity: true } });
        const need = new Map<string, number>();
        for (const x of pieces) need.set(x.variantId, (need.get(x.variantId) ?? 0) + x.quantity);
        for (const [variantId, quantity] of need) {
          const v = await tx.productVariant.findFirst({ where: { id: variantId, storeId: d.storeId }, select: { id: true, productId: true } });
          if (v) await checkStock(deps, tx, d.storeId, d.cartId, v, quantity);
        }
      }, TX);
    }
    await saveSetForLater({ db: deps.db, settings: deps.settings, now: deps.now }, { storeId: d.storeId, cartId: d.cartId, groupKey: l.comboGroupKey, saved: d.saved }).catch(rethrow);
    await deps.db.cart.update({ where: { id: d.cartId }, data: { lastActivityAt: nowOf(deps) } });
    return { lineIds: ids };
  }
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    if (l.savedForLater === d.saved) return { lineIds: [l.id] };
    if (!d.saved) {
      const v = await saleVariant(tx, d.storeId, l.variantId);
      // The same item already in the bag: the saved one joins it.
      const other = await tx.cartItem.findFirst({ where: { storeId: d.storeId, cartId: d.cartId, variantId: v.id, comboGroupKey: null, removedAt: null, savedForLater: false } });
      await checkStock(deps, tx, d.storeId, d.cartId, v, l.quantity);
      if (other) {
        await tx.cartItem.update({ where: { id: other.id }, data: { quantity: other.quantity + l.quantity } });
        await tx.cartItem.update({ where: { id: l.id }, data: { removedAt: nowOf(deps) } });
        await touch(tx, deps, d.cartId);
        return { lineIds: [other.id] };
      }
    }
    await tx.cartItem.update({ where: { id: l.id }, data: { savedForLater: d.saved } });
    await touch(tx, deps, d.cartId);
    return { lineIds: [l.id] };
  }, TX);
}

export const sizeAnswerSchema = bagRef.extend({ key: z.string().min(3).max(400), answer: z.enum(SIZE_ANSWERS).nullable() }).strict();

/** PR 110 — the customer's answer to a "same product in two sizes" card (null takes the answer back). */
export async function setSizeAnswer(deps: CartDeps, input: z.input<typeof sizeAnswerSchema>): Promise<Record<string, SizeAnswer>> {
  const d = parse(sizeAnswerSchema, input, 'answer');
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    const c = await tx.cart.findUniqueOrThrow({ where: { id: d.cartId }, select: { sizeAnswers: true } });
    const answers = { ...sizeAnswersOf(c.sizeAnswers) };
    if (d.answer) answers[d.key] = d.answer;
    else delete answers[d.key];
    await tx.cart.update({ where: { id: d.cartId }, data: { sizeAnswers: answers, lastActivityAt: nowOf(deps) } });
    return answers;
  }, TX);
}

/** The stored answers, read safely (anything unknown is dropped). */
export function sizeAnswersOf(v: unknown): Record<string, SizeAnswer> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, SizeAnswer] => (SIZE_ANSWERS as readonly unknown[]).includes(e[1])));
}

export const codeSchema = bagRef.extend({ code: z.string().trim().min(1).max(40).nullable() }).strict();

/** PR 112 — keeps the typed code on the bag (null takes it off). Whether it works is the quote's answer, every time. */
export async function setBagCode(deps: CartDeps, input: z.input<typeof codeSchema>): Promise<{ code: string | null }> {
  const d = parse(codeSchema, input, 'code');
  const code = d.code ? d.code.toUpperCase() : null;
  return deps.db.$transaction(async (tx) => {
    await lockBag(tx, d.storeId, d.cartId);
    await tx.cart.update({ where: { id: d.cartId }, data: { couponCode: code, lastActivityAt: nowOf(deps) } });
    return { code };
  }, TX);
}

/** The bag's pieces (not saved, not taken out), for the header badge. */
export async function bagCount(db: Db, storeId: number, cartId: string | null): Promise<number> {
  if (!cartId) return 0;
  const r = await db.cartItem.aggregate({ where: { storeId, cartId, savedForLater: false, removedAt: null, cart: { status: 'ACTIVE' } }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

/** A combos refusal becomes the bag's own (the same stable codes). */
function rethrow(e: unknown): never {
  const c = (e as { code?: string }).code;
  if (c === 'CART_NOT_OPEN' || c === 'NOT_FOUND' || c === 'INVALID_INPUT') throw new CartError(c, (e as Error).message);
  throw e;
}
