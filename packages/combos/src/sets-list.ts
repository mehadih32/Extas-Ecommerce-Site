// S28 · PR 712 (CN-048, admin prototype v5, Products › Sets) — the sets as their own list: each set with its pieces (a top and a
// bottom, a fixed set …), the set price against the pieces' prices added up, the stock of the set (what the weakest piece allows),
// and where it stands (on the shop, off, ended …). READ ONLY: a set is changed on Combos & sets (the same rows, the same
// permissions); nothing here is written. Which combo kinds count as a set, and when a stock is called low, are the owner's
// (`combos.setsTab`). Seeing it needs `combos.read`.
import { allow, nowOf, setting, type CombosDeps, type Who } from './context';
import { listCombos, type ComboItemView, type ComboView } from './combos-service';
import { SOLD_STATUS } from '@extas/catalogue';
import { productFacts, type ProductFact } from './facts';

export interface SetPart {
  position: number;
  label: string | null;
  productId: string | null;
  productSlug: string | null;
  nameEn: string | null;
  nameBn: string | null;
  quantity: number;
  /** The piece's own price (one piece). */
  priceMinor: number | null;
  /** Pieces of it that can be sold now, over the colours and sizes the set allows. */
  stock: number;
  /** How many whole sets this piece alone allows: floor(stock / quantity). */
  setsAllowed: number;
  /** PR 773 (prototype v5 parity): the sizes of the piece, each with whether any is left (a struck-through size in the prototype). */
  sizes: { key: string; label: string; inStock: boolean }[];
  /** PR 773: the piece's buying price (ERP) as the average over its sizes; null when not read (no price permission) or unknown. */
  costMinor: number | null;
}

/** PR 773: one colour of a set; `ok` false = a piece of this colour is sold out (the prototype's struck-through chip). */
export interface SetColour {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  ok: boolean;
}

export interface SetRow {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  type: string;
  state: ComboView['state'];
  sameColour: boolean;
  parts: SetPart[];
  /** The pieces' own prices added up (null when a piece has none) and what the customer pays for the set (null: not priced). */
  sumPartsMinor: number | null;
  setPriceMinor: number | null;
  savingMinor: number;
  savingPercent: number;
  /** Whole sets that can be sold now: the smallest `setsAllowed` of its pieces (0 with no piece). */
  stock: number;
  /** The piece that limits the stock (the first of the smallest), null with no piece. */
  limitedBy: number | null;
  low: boolean;
  /** Why it cannot go on sale (empty = it can). */
  blocking: string[];
  updatedAt: string;
  /** PR 773 (prototype v5 parity): the colours the set sells in, the set's sales in the last 30 days, and the buying cost of one set. */
  colours: SetColour[];
  sold30: number;
  sales30Minor: number;
  costMinor: number | null;
}

export interface SetsList {
  rows: SetRow[];
  /** On the shop now, and every set that is not ended or archived. */
  live: number;
  total: number;
  /** Sets with a stock of zero among the live ones. */
  soldOut: number;
  types: string[];
  lowStockAt: number;
  /** PR 773: sets sold and the money they brought in the last 30 days, and the colours ready to sell on live sets (the prototype's four figures). */
  sold30: number;
  sales30Minor: number;
  coloursReady: number;
}

/** What one piece of a set can sell now: its fixed variant, else every variant in the allowed colours and sizes (empty = any). */
export function slotStock(item: Pick<ComboItemView, 'fixedVariantId' | 'colourIds' | 'sizeIds'>, p: ProductFact | undefined): number {
  if (!p) return 0;
  const pick = item.fixedVariantId
    ? p.variants.filter((v) => v.id === item.fixedVariantId)
    : p.variants.filter((v) => (!item.colourIds.length || (v.colourId !== null && item.colourIds.includes(v.colourId))) && (!item.sizeIds.length || (v.sizeId !== null && item.sizeIds.includes(v.sizeId))));
  return pick.reduce((s, v) => s + Math.max(0, v.sellable), 0);
}

/** PR 773: the sizes of one piece with whether any is left, in the product's size order (the sizes the set allows when it names some). */
export function sizesOf(item: Pick<ComboItemView, 'fixedVariantId' | 'colourIds' | 'sizeIds'>, p: ProductFact | undefined): SetPart['sizes'] {
  if (!p) return [];
  return p.sizes
    .filter((z) => !item.sizeIds.length || item.sizeIds.includes(z.id))
    .map((z) => ({ key: z.key, label: z.label, inStock: p.variants.some((v) => v.sizeId === z.id && v.sellable > 0 && (!item.colourIds.length || (v.colourId !== null && item.colourIds.includes(v.colourId)))) }));
}

/**
 * PR 773: the colours a set sells in. With "same colour" the colours every piece has; otherwise the first piece's colours (the customer picks the
 * others). A colour is `ok` while every piece it needs has a size left in it.
 */
export function coloursOf(items: readonly Pick<ComboItemView, 'productId' | 'colourIds'>[], sameColour: boolean, facts: Map<string, ProductFact>): SetColour[] {
  const pieces = items.map((i) => (i.productId ? facts.get(i.productId) : undefined)).filter((p): p is ProductFact => !!p);
  if (!pieces.length) return [];
  const first = pieces[0]!;
  const have = (p: ProductFact, id: string) => p.colours.some((c) => c.id === id);
  const stocked = (p: ProductFact, id: string) => p.variants.some((v) => v.colourId === id && v.sellable > 0);
  const base = first.colours.filter((c) => (sameColour ? pieces.every((p) => have(p, c.id)) : true));
  return base.map((c) => ({ id: c.id, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex, ok: sameColour ? pieces.every((p) => stocked(p, c.id)) : stocked(first, c.id) }));
}

/** The stock of a set from its pieces, and the piece that limits it (pure). */
export function setStock(parts: readonly { stock: number; quantity: number }[]): { stock: number; limitedBy: number | null; allowed: number[] } {
  if (!parts.length) return { stock: 0, limitedBy: null, allowed: [] };
  const allowed = parts.map((p) => Math.floor(p.stock / Math.max(1, p.quantity)));
  const stock = Math.min(...allowed);
  return { stock, limitedBy: allowed.indexOf(stock), allowed };
}

/** The store's sets, newest first as Combos & sets lists them, with the figures above. */
export async function listSets(deps: CombosDeps, who: Who, opts: { withCost?: boolean } = {}): Promise<SetsList> {
  await allow(deps, who, 'combos.read');
  const cfg = await setting(deps, who.storeId, 'combos.setsTab');
  const all = (await listCombos(deps, who)).filter((c) => (cfg.types as readonly string[]).includes(c.type));
  const facts = await productFacts(deps, who.storeId, all.flatMap((c) => c.items.flatMap((i) => (i.productId ? [i.productId] : []))));
  const since = new Date(nowOf(deps).getTime() - 30 * 86_400_000);
  const [soldItems, costRows] = await Promise.all([
    all.length
      ? deps.db.orderItem.findMany({ where: { storeId: who.storeId, comboId: { in: all.map((c) => c.id) }, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } }, select: { comboId: true, comboGroupKey: true, lineTotalMinor: true } })
      : Promise.resolve([]),
    opts.withCost && facts.size ? deps.db.productVariant.findMany({ where: { storeId: who.storeId, productId: { in: [...facts.keys()] }, archivedAt: null, shopPriceMinor: { gt: 0 } }, select: { productId: true, shopPriceMinor: true } }) : Promise.resolve([]),
  ]);
  const costOfProduct = new Map<string, number>();
  for (const pid of new Set(costRows.map((r) => r.productId))) {
    const xs = costRows.filter((r) => r.productId === pid).map((r) => r.shopPriceMinor as number);
    costOfProduct.set(pid, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length));
  }
  const rows: SetRow[] = all.map((c) => {
    const parts: SetPart[] = c.items.map((i) => {
      const stock = slotStock(i, i.productId ? facts.get(i.productId) : undefined);
      return {
        position: i.position,
        label: i.labelEn,
        productId: i.productId,
        productSlug: i.productSlug,
        nameEn: i.productNameEn,
        nameBn: i.productNameBn,
        quantity: i.quantity,
        priceMinor: i.priceMinor,
        stock,
        setsAllowed: Math.floor(stock / Math.max(1, i.quantity)),
        sizes: sizesOf(i, i.productId ? facts.get(i.productId) : undefined),
        costMinor: i.productId && costOfProduct.has(i.productId) ? costOfProduct.get(i.productId)! : null,
      };
    });
    const mine = soldItems.filter((x) => x.comboId === c.id);
    const groups = new Set(mine.map((x) => x.comboGroupKey ?? x.comboId));
    const priced = parts.every((p) => p.costMinor !== null) && parts.length > 0;
    const s = setStock(parts);
    return {
      id: c.id,
      slug: c.slug,
      nameEn: c.nameEn,
      nameBn: c.nameBn,
      type: c.type,
      state: c.state,
      sameColour: c.sameColour,
      parts,
      sumPartsMinor: c.pricing.regularMinor,
      setPriceMinor: c.pricing.payMinor,
      savingMinor: c.pricing.savingMinor,
      savingPercent: c.pricing.savingPercent,
      stock: s.stock,
      limitedBy: s.limitedBy === null ? null : parts[s.limitedBy]!.position,
      low: cfg.lowStockAt > 0 && s.stock > 0 && s.stock <= cfg.lowStockAt,
      blocking: c.blocking,
      updatedAt: c.updatedAt,
      colours: coloursOf(c.items, c.sameColour, facts),
      sold30: groups.size,
      sales30Minor: mine.reduce((n, x) => n + x.lineTotalMinor, 0),
      costMinor: priced ? parts.reduce((n, p) => n + p.costMinor! * p.quantity, 0) : null,
    };
  });
  const live = rows.filter((r) => r.state === 'live');
  return { rows, live: live.length, total: rows.filter((r) => r.state !== 'ended' && r.state !== 'off').length, soldOut: live.filter((r) => r.stock === 0).length, types: [...cfg.types], lowStockAt: cfg.lowStockAt, sold30: rows.reduce((n, r) => n + r.sold30, 0), sales30Minor: rows.reduce((n, r) => n + r.sales30Minor, 0), coloursReady: live.reduce((n, r) => n + r.colours.filter((x) => x.ok).length, 0) };
}
