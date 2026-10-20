// PR 195 — the local stock mirror read at SKU / colour / size level: a variant's stock in every location, and a
// product's colour × size grid. "Sellable" is the sum over live locations of a sellable kind
// (`inventory.sellableLocationKinds`) of what the ERP says is available minus the shop's own cart holds, never below
// zero per location (Bhandari B03: ATS = on hand − ERP reserved − shop holds). Damaged stock is shown on its own and
// never counts.
//
// `recomputeVariantStock` keeps `ProductVariant.inStock` and the product summary (PR 19/603: the list and category
// pages read those, never the stock rows) in line with the mirror, in the same transaction as the stock change.
import { refreshProductSummary } from '@extas/catalogue';
import type { LocationKindName } from '@extas/settings';
import { allow, found, type InventoryDeps, type Tx, type Who } from './context';
import { InventoryError } from './errors';
import { sellableKinds } from './locations';

interface LevelLike {
  available: number;
  cartReserved: number;
  onHand: number;
  location: { kind: LocationKindName; archivedAt: Date | null; warehouse?: { archivedAt: Date | null } };
}

const live = (l: LevelLike) => !l.location.archivedAt && !l.location.warehouse?.archivedAt;

/** What can be sold of one variant: Σ max(0, available − cart holds) over live sellable locations. */
export function sellableUnits(levels: LevelLike[], kinds: Set<LocationKindName>): number {
  return levels.filter((l) => live(l) && kinds.has(l.location.kind)).reduce((s, l) => s + Math.max(0, l.available - l.cartReserved), 0);
}

/** Pieces in live damaged bins (never sold). */
export function damagedUnits(levels: LevelLike[]): number {
  return levels.filter((l) => live(l) && l.location.kind === 'DAMAGED').reduce((s, l) => s + Math.max(0, l.onHand), 0);
}

const levelInclude = { location: { select: { id: true, code: true, name: true, kind: true, archivedAt: true, warehouse: { select: { code: true, archivedAt: true } } } } } as const;

/**
 * Sets `inStock` on these variants from the mirror and refreshes the summary of every product whose variant changed.
 * Runs inside the caller's transaction.
 */
export async function recomputeVariantStock(tx: Tx, storeId: number, variantIds: string[], kinds: Set<LocationKindName>): Promise<{ variantsChanged: number; productsRefreshed: number }> {
  if (!variantIds.length) return { variantsChanged: 0, productsRefreshed: 0 };
  const variants = await tx.productVariant.findMany({ where: { storeId, id: { in: variantIds } }, select: { id: true, productId: true, inStock: true, stockLevels: { include: levelInclude } } });
  const products = new Set<string>();
  let variantsChanged = 0;
  for (const v of variants) {
    const inStock = sellableUnits(v.stockLevels, kinds) > 0;
    if (inStock === v.inStock) continue;
    await tx.productVariant.update({ where: { id: v.id }, data: { inStock } });
    variantsChanged++;
    products.add(v.productId);
  }
  for (const p of products) await refreshProductSummary(tx, storeId, p);
  return { variantsChanged, productsRefreshed: products.size };
}

export interface LocationStock {
  locationId: string;
  warehouseCode: string;
  code: string;
  name: string;
  kind: LocationKindName;
  sellable: boolean;
  onHand: number;
  reserved: number;
  available: number;
  cartReserved: number;
  erpUpdatedAt: string | null;
}

export interface VariantStock {
  variantId: string;
  sku: string;
  productId: string;
  colour: { id: string; key: string; nameEn: string } | null;
  size: { id: string; key: string; label: string } | null;
  inStock: boolean;
  sellable: number;
  damaged: number;
  locations: LocationStock[];
}

const variantSelect = {
  id: true,
  sku: true,
  productId: true,
  inStock: true,
  colour: { select: { id: true, key: true, nameEn: true } },
  size: { select: { id: true, key: true, label: true, sortOrder: true } },
  stockLevels: { include: levelInclude, orderBy: { createdAt: 'asc' } },
} as const;

type VariantRow = Awaited<ReturnType<typeof loadVariants>>[number];
const loadVariants = (deps: InventoryDeps, where: { storeId: number; id?: string; sku?: string; productId?: string; archivedAt?: null }) =>
  deps.db.productVariant.findMany({ where, select: variantSelect, orderBy: { sortOrder: 'asc' } });

function viewOf(v: VariantRow, kinds: Set<LocationKindName>): VariantStock {
  return {
    variantId: v.id,
    sku: v.sku,
    productId: v.productId,
    colour: v.colour,
    size: v.size ? { id: v.size.id, key: v.size.key, label: v.size.label } : null,
    inStock: v.inStock,
    sellable: sellableUnits(v.stockLevels, kinds),
    damaged: damagedUnits(v.stockLevels),
    locations: v.stockLevels.map((l) => ({
      locationId: l.location.id,
      warehouseCode: l.location.warehouse.code,
      code: l.location.code,
      name: l.location.name,
      kind: l.location.kind,
      sellable: kinds.has(l.location.kind) && !l.location.archivedAt && !l.location.warehouse.archivedAt,
      onHand: l.onHand,
      reserved: l.reserved,
      available: l.available,
      cartReserved: l.cartReserved,
      erpUpdatedAt: l.erpUpdatedAt ? l.erpUpdatedAt.toISOString() : null,
    })),
  };
}

/** One variant's stock in every location, by id or by its ERP SKU. */
export async function variantStock(deps: InventoryDeps, who: Who, by: { variantId?: string; sku?: string }): Promise<VariantStock> {
  await allow(deps, who, 'inventory.read');
  if (!by.variantId && !by.sku) throw new InventoryError('INVALID_INPUT', 'name a variant or an SKU', ['variantId', 'sku']);
  const [rows, kinds] = await Promise.all([loadVariants(deps, { storeId: who.storeId, ...(by.variantId ? { id: by.variantId } : { sku: by.sku!.trim() }) }), sellableKinds(deps)]);
  return viewOf(found(rows[0], 'variant'), kinds);
}

export interface StockGrid {
  productId: string;
  colours: { id: string; key: string; nameEn: string }[];
  sizes: { id: string; key: string; label: string }[];
  cells: { colourId: string | null; sizeId: string | null; variantId: string; sku: string; sellable: number; damaged: number; inStock: boolean }[];
  totals: { sellable: number; damaged: number };
}

/** A product's stock as a colour × size grid (live variants only). */
export async function stockGrid(deps: InventoryDeps, who: Who, productId: string): Promise<StockGrid> {
  await allow(deps, who, 'inventory.read');
  found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
  const [rows, kinds] = await Promise.all([loadVariants(deps, { storeId: who.storeId, productId, archivedAt: null }), sellableKinds(deps)]);
  const colours = new Map<string, { id: string; key: string; nameEn: string }>();
  const sizes = new Map<string, { id: string; key: string; label: string; sortOrder: number }>();
  for (const v of rows) {
    if (v.colour) colours.set(v.colour.id, v.colour);
    if (v.size) sizes.set(v.size.id, v.size);
  }
  const cells = rows.map((v) => {
    const s = viewOf(v, kinds);
    return { colourId: v.colour?.id ?? null, sizeId: v.size?.id ?? null, variantId: v.id, sku: v.sku, sellable: s.sellable, damaged: s.damaged, inStock: v.inStock };
  });
  return {
    productId,
    colours: [...colours.values()],
    sizes: [...sizes.values()].sort((a, b) => a.sortOrder - b.sortOrder).map(({ sortOrder: _s, ...z }) => z),
    cells,
    totals: { sellable: cells.reduce((s, c) => s + c.sellable, 0), damaged: cells.reduce((s, c) => s + c.damaged, 0) },
  };
}
