// S04 · PR 622 (CN-034, customer 360° finding 3) — "Buy again": a past order's lines back in the customer's bag.
// The same product, colour and size at TODAY's price, offers and stock, never the old order's: each line goes in through
// the bag's own add (its stock check, its price, its duplicate rule), a set through the combos engine's own set add.
// - A sold-out size is named with the sizes of that colour still in stock; it is never swapped for another silently.
// - A product no longer sold is named and left out.
// - A set the shop made comes back as its set only while it is still offered (and its pieces can still be had);
//   otherwise its pieces come back one by one.
// - Add-ons, free gifts, lines taken off the order and the old delivery charge are not copied.
// Nothing is ordered: the customer goes through the normal checkout, so the delivery charge, COD and every offer rule
// are the checkout's own. The bag remembers the order (Cart.reorderFromOrderId); the order placed from it carries
// "bought again from #…" (Order.reorderOfOrderId, written by @extas/checkout while a line put in here is ordered).
// Only the customer whose order it is (signed in), or the browser that placed it, may ask; the same tap twice is one.
import { addSetToBag, CombosError, productFacts } from '@extas/combos';
import { addItem } from './cart';
import { CartError, checkStoreId, setting, type CartDeps } from './context';
import { REORDER_SOURCE, reorderOffered, reorderParts, reorderVerdict, type ReorderFact, type ReorderItem } from './reorder-pure';

export interface ReorderInput {
  storeId: number;
  cartId: string;
  /** The past order's number. */
  number: string;
  /** The browser's visitor id (its bag cookie), when it placed the order. */
  visitorId: string | null;
  /** The signed-in customer, when the order is his. */
  customerId: string | null;
}

/** A line that did not come back, named for the notice. */
export interface ReorderMiss {
  productId: string | null;
  slug: string | null;
  nameEn: string;
  nameBn: string | null;
  colour: string | null;
  size: string | null;
  /** The sizes of the same colour that can be bought now (sold out only). */
  inStock: string[];
}

export interface ReorderOutcome {
  number: string;
  /** Pieces put in the bag by this tap. */
  pieces: number;
  /** Sets that came back as their set. */
  sets: number;
  /** Lines already in the bag (the same item there before; the bag's duplicate rule keeps one). With `again`: the
   * pieces this order's "Buy again" put in the bag before, still there. */
  inBag: number;
  /** This order's "Buy again" is already in this bag (the same tap twice): nothing more went in. */
  again: boolean;
  soldOut: ReorderMiss[];
  gone: ReorderMiss[];
}

const ITEM_SELECT = { id: true, variantId: true, productId: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, comboId: true, comboGroupKey: true, isAddOn: true, status: true } as const;

/** Puts a past order's lines back in the bag (see the file header). Refuses NOT_FOUND / NOT_OFFERED. */
export async function buyAgain(deps: CartDeps, input: ReorderInput): Promise<ReorderOutcome> {
  checkStoreId(input.storeId);
  const number = String(input.number ?? '').slice(0, 40);
  const cfg = await setting(deps, input.storeId, 'account.reorder');
  const o = number ? await deps.db.order.findUnique({ where: { storeId_number: { storeId: input.storeId, number } }, select: { id: true, number: true, status: true, visitorId: true, customerId: true, archivedAt: true } }) : null;
  const his = !!o && !o.archivedAt && o.status !== 'DRAFT' && ((!!input.customerId && o.customerId === input.customerId) || (!!input.visitorId && o.visitorId === input.visitorId));
  if (!o || !his) throw new CartError('NOT_FOUND', 'no such order of yours', ['number']);
  if (!reorderOffered(cfg, o.status)) throw new CartError('NOT_OFFERED', '"Buy again" is not offered on this order', ['account.reorder']);
  const bag = await deps.db.cart.findFirst({ where: { id: input.cartId, storeId: input.storeId, status: 'ACTIVE' }, select: { reorderFromOrderId: true } });
  if (!bag) throw new CartError('CART_NOT_OPEN', 'the bag is not open', ['cartId']);
  const out: ReorderOutcome = { number: o.number, pieces: 0, sets: 0, inBag: 0, again: false, soldOut: [], gone: [] };
  if (bag.reorderFromOrderId === o.id) {
    const held = await deps.db.cartItem.aggregate({ where: { storeId: input.storeId, cartId: input.cartId, source: REORDER_SOURCE, removedAt: null }, _sum: { quantity: true } });
    if (held._sum.quantity) return { ...out, again: true, inBag: held._sum.quantity };
  }

  const items: ReorderItem[] = await deps.db.orderItem.findMany({ where: { storeId: input.storeId, orderId: o.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: ITEM_SELECT });
  const parts = reorderParts(items);
  const loose = [...parts.loose];
  const bagRef = { storeId: input.storeId, cartId: input.cartId };

  // The shop's sets: as the set while it is offered, each piece on its old colour and size; otherwise piece by piece.
  for (const s of parts.sets) {
    const ids = s.pieces.map((p) => p.variantId).filter((x): x is string => !!x);
    const vs = ids.length === s.pieces.length ? await deps.db.productVariant.findMany({ where: { storeId: input.storeId, id: { in: ids } }, select: { id: true, colourId: true, sizeId: true } }) : [];
    const byId = new Map(vs.map((v) => [v.id, v]));
    if (vs.length === new Set(ids).size && ids.length) {
      try {
        const r = await addSetToBag(deps, { ...bagRef, comboId: s.comboId, choices: s.pieces.map((p) => ({ colourId: byId.get(p.variantId!)!.colourId, sizeId: byId.get(p.variantId!)!.sizeId })), source: REORDER_SOURCE });
        if (r.added) {
          out.sets += 1;
          out.pieces += r.lines.length;
        } else out.inBag += 1;
        continue;
      } catch (e) {
        if (!(e instanceof CombosError)) throw e;
      }
    }
    loose.push(...s.pieces);
  }

  const facts = await productFacts(deps, input.storeId, loose.map((i) => i.productId).filter((x): x is string => !!x));
  const missOf = (i: ReorderItem, f: ReorderFact | undefined, inStock: string[] = []): ReorderMiss => ({
    productId: i.productId,
    slug: f?.published ? f.slug : null,
    nameEn: f?.nameEn ?? i.productName,
    nameBn: f?.nameBn ?? null,
    colour: i.colourName,
    size: i.sizeLabel,
    inStock,
  });
  for (const i of loose) {
    const f = i.productId ? facts.get(i.productId) : undefined;
    const v = reorderVerdict(i, f);
    if (v.kind === 'gone') {
      out.gone.push(missOf(i, f));
      continue;
    }
    if (v.kind === 'soldOut') {
      out.soldOut.push(missOf(i, f, v.inStock));
      continue;
    }
    try {
      const r = await addItem(deps, { ...bagRef, variantId: v.variantId, quantity: v.quantity, source: REORDER_SOURCE });
      if (r.added) out.pieces += v.quantity;
      else out.inBag += 1;
    } catch (e) {
      if (!(e instanceof CartError)) throw e;
      if (e.code === 'OUT_OF_STOCK') {
        // sold in between (or the bag holds the rest): said as sold out, with the other sizes as they stand
        const now = reorderVerdict(i, f && { ...f, variants: f.variants.map((x) => (x.id === v.variantId ? { ...x, sellable: 0 } : x)) });
        out.soldOut.push(missOf(i, f, now.kind === 'soldOut' ? now.inStock : []));
      } else if (e.code === 'TOO_MANY') out.inBag += 1;
      else if (e.code === 'NOT_FOR_SALE' || e.code === 'NOT_FOUND') out.gone.push(missOf(i, f));
      else throw e;
    }
  }

  if (out.pieces > 0) await deps.db.cart.updateMany({ where: { id: input.cartId, storeId: input.storeId, status: 'ACTIVE' }, data: { reorderFromOrderId: o.id } });
  return out;
}
