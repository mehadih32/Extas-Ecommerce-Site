// What the combo code reads from the catalogue and the stock mirror, in one shape: each product with its colours in
// the owner's colour order, its sizes in size order, and every live variant with its own price and what can be sold
// of it now (S09: Σ max(0, available − cart holds) over live sellable locations, `inventory.sellableLocationKinds`).
// Prices are read, never written: a piece's price is its variant's own price (`catalogue.prices`, the owner's).
import { scopeFacts } from '@extas/rules';
import { sellableUnits } from '@extas/inventory';
import { setting, type CombosDeps, type Db } from './context';

export interface ColourFact {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  /** Position in the product's colour order (0 = first). */
  order: number;
  /** When the colour was added to the product (the "new colour" tag). */
  addedAt: Date;
}

export interface SizeFact {
  id: string;
  key: string;
  label: string;
  order: number;
}

export interface VariantFact {
  id: string;
  colourId: string | null;
  sizeId: string | null;
  priceMinor: number | null;
  /** Pieces that can be sold now. */
  sellable: number;
}

export interface ProductFact {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  published: boolean;
  inCombos: boolean;
  /** The product's category, its parents and the categories it is listed in. */
  categoryIds: string[];
  /** Products of one style group count as one style (a "same style" pair never mixes two styles). */
  styleKey: string;
  sortRank: number;
  colours: ColourFact[];
  sizes: SizeFact[];
  variants: VariantFact[];
}

/** The products, with colours, sizes, variants and stock; unknown or other stores' ids are left out. */
export async function productFacts(deps: Pick<CombosDeps, 'settings'> & { db: Db }, storeId: number, productIds: readonly string[]): Promise<Map<string, ProductFact>> {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const [products, kinds, scopes] = await Promise.all([
    deps.db.product.findMany({
      where: { storeId, id: { in: ids }, archivedAt: null },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameBn: true,
        status: true,
        inCombos: true,
        styleGroupId: true,
        sortRank: true,
        colours: { where: { archivedAt: null }, select: { colourId: true, sortOrder: true, createdAt: true, colour: { select: { id: true, key: true, nameEn: true, nameBn: true, hex: true, archivedAt: true } } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        variants: {
          where: { archivedAt: null, active: true },
          select: {
            id: true,
            colourId: true,
            sizeId: true,
            priceMinor: true,
            size: { select: { id: true, key: true, label: true, sortOrder: true, archivedAt: true } },
            stockLevels: { select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } } },
          },
          orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
        },
      },
    }),
    setting(deps, storeId, 'inventory.sellableLocationKinds'),
    scopeFacts(deps.db, storeId, ids),
  ]);
  const sellableKinds = new Set(kinds);
  const out = new Map<string, ProductFact>();
  for (const p of products) {
    const colours = p.colours
      .filter((c) => !c.colour.archivedAt)
      .map((c, i) => ({ id: c.colour.id, key: c.colour.key, nameEn: c.colour.nameEn, nameBn: c.colour.nameBn, hex: c.colour.hex, order: i, addedAt: c.createdAt }));
    const sizeMap = new Map<string, SizeFact & { sortOrder: number }>();
    for (const v of p.variants) if (v.size && !v.size.archivedAt) sizeMap.set(v.size.id, { id: v.size.id, key: v.size.key, label: v.size.label, order: 0, sortOrder: v.size.sortOrder });
    const sizes = [...sizeMap.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)).map((s, i) => ({ id: s.id, key: s.key, label: s.label, order: i }));
    out.set(p.id, {
      id: p.id,
      slug: p.slug,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      published: p.status === 'PUBLISHED',
      inCombos: p.inCombos,
      categoryIds: [...(scopes.get(p.id)?.categoryIds ?? [])],
      styleKey: p.styleGroupId ?? p.id,
      sortRank: p.sortRank,
      colours,
      sizes,
      variants: p.variants.map((v) => ({ id: v.id, colourId: v.colourId, sizeId: v.sizeId, priceMinor: v.priceMinor, sellable: sellableUnits(v.stockLevels, sellableKinds) })),
    });
  }
  return out;
}

/**
 * The products an auto rule takes in (PR 571 "binding", live): the hand-picked products, then every published
 * product in a bound category (its own, a parent or a listing), each once, only with "Use in combos" ticked.
 * Order: hand-picked first in the order given, then by the shop's sort rank.
 */
export async function boundProductIds(db: Db, storeId: number, bind: { categoryIds: readonly string[]; productIds: readonly string[] }): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  if (bind.productIds.length) {
    const picked = await db.product.findMany({ where: { storeId, id: { in: [...bind.productIds] }, archivedAt: null, status: 'PUBLISHED', inCombos: true }, select: { id: true } });
    const ok = new Set(picked.map((p) => p.id));
    for (const id of bind.productIds) if (ok.has(id)) add(id);
  }
  if (bind.categoryIds.length) {
    const all = await db.product.findMany({ where: { storeId, archivedAt: null, status: 'PUBLISHED', inCombos: true }, select: { id: true }, orderBy: [{ sortRank: 'desc' }, { slug: 'asc' }] });
    const scopes = await scopeFacts(db, storeId, all.map((p) => p.id));
    const want = new Set(bind.categoryIds);
    for (const p of all) if ((scopes.get(p.id)?.categoryIds ?? []).some((c) => want.has(c))) add(p.id);
  }
  return out;
}

/** The lowest own price of a product's live variants in one colour (what a card shows before a size is picked). */
export function colourPrice(p: ProductFact, colourId: string | null): number | null {
  const prices = p.variants.filter((v) => (colourId === null || v.colourId === colourId) && v.priceMinor !== null).map((v) => v.priceMinor!);
  return prices.length ? Math.min(...prices) : null;
}

export const variantOf = (p: ProductFact, colourId: string | null, sizeId: string | null): VariantFact | undefined =>
  p.variants.find((v) => v.colourId === colourId && v.sizeId === sizeId);
