// S28 · PR 712 (CN-048, admin prototype v5, Products › Sets) — the sets as their own list: each set with its pieces (a top and a
// bottom, a fixed set …), the set price against the pieces' prices added up, the stock of the set (what the weakest piece allows),
// and where it stands (on the shop, off, ended …). READ ONLY: a set is changed on Combos & sets (the same rows, the same
// permissions); nothing here is written. Which combo kinds count as a set, and when a stock is called low, are the owner's
// (`combos.setsTab`). Seeing it needs `combos.read`.
import { allow, setting, type CombosDeps, type Who } from './context';
import { listCombos, type ComboItemView, type ComboView } from './combos-service';
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
}

/** What one piece of a set can sell now: its fixed variant, else every variant in the allowed colours and sizes (empty = any). */
export function slotStock(item: Pick<ComboItemView, 'fixedVariantId' | 'colourIds' | 'sizeIds'>, p: ProductFact | undefined): number {
  if (!p) return 0;
  const pick = item.fixedVariantId
    ? p.variants.filter((v) => v.id === item.fixedVariantId)
    : p.variants.filter((v) => (!item.colourIds.length || (v.colourId !== null && item.colourIds.includes(v.colourId))) && (!item.sizeIds.length || (v.sizeId !== null && item.sizeIds.includes(v.sizeId))));
  return pick.reduce((s, v) => s + Math.max(0, v.sellable), 0);
}

/** The stock of a set from its pieces, and the piece that limits it (pure). */
export function setStock(parts: readonly { stock: number; quantity: number }[]): { stock: number; limitedBy: number | null; allowed: number[] } {
  if (!parts.length) return { stock: 0, limitedBy: null, allowed: [] };
  const allowed = parts.map((p) => Math.floor(p.stock / Math.max(1, p.quantity)));
  const stock = Math.min(...allowed);
  return { stock, limitedBy: allowed.indexOf(stock), allowed };
}

/** The store's sets, newest first as Combos & sets lists them, with the figures above. */
export async function listSets(deps: CombosDeps, who: Who): Promise<SetsList> {
  await allow(deps, who, 'combos.read');
  const cfg = await setting(deps, who.storeId, 'combos.setsTab');
  const all = (await listCombos(deps, who)).filter((c) => (cfg.types as readonly string[]).includes(c.type));
  const facts = await productFacts(deps, who.storeId, all.flatMap((c) => c.items.flatMap((i) => (i.productId ? [i.productId] : []))));
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
      };
    });
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
    };
  });
  const live = rows.filter((r) => r.state === 'live');
  return { rows, live: live.length, total: rows.filter((r) => r.state !== 'ended' && r.state !== 'off').length, soldOut: live.filter((r) => r.stock === 0).length, types: [...cfg.types], lowStockAt: cfg.lowStockAt };
}
