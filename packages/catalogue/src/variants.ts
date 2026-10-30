// PR 19 — variants, keyed by the ERP SKU (D3.7, B3.7). One variant = one colour × one size of one product.
// - The SKU is the key: it matches `catalogue.skuPattern`, is unique in the store, never changes once made, and a
//   retired (archived) SKU is never given to another garment (SKU_RETIRED). The same SKU coming back for the same
//   product, colour and size is a restore.
// - One live variant per product, colour and size (VARIANT_EXISTS).
// - A variant's colour is put on the product automatically (ProductColour), at the end of its colour list.
// - Prices are the shop's (B3.7): setting the sale or compare-at price needs `catalogue.prices`; every price change
//   writes a PriceHistory row (the "was" price and the 30-day rules read it). The compare-at price is above the price.
// - Stock is not set here (the ERP sync and the stock pool own it); the product summary is refreshed after each change.
// - PR 609: a new selling price below the floor over the buying price is refused (price-floor.ts, BELOW_FLOOR).
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, changed, found, logChange, parse, setting, TX, type CatalogueDeps, type Tx, type Who } from './context';
import { CatalogueError } from './errors';
import { assertVariantFloor } from './price-floor';
import { refreshProductSummary } from './summary';

/** The gap between positions, so one can be slotted in between without renumbering. */
export const ORDER_STEP = 10;

export const variantInclude = {
  colour: { select: { id: true, key: true, nameEn: true, hex: true } },
  size: { select: { id: true, key: true, label: true, sortOrder: true } },
} satisfies Prisma.ProductVariantInclude;
type VariantRow = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

export interface VariantView {
  id: string;
  productId: string;
  sku: string;
  colour: { id: string; key: string; nameEn: string; hex: string } | null;
  size: { id: string; key: string; label: string; sortOrder: number } | null;
  barcode: string | null;
  erpVariantId: string | null;
  erpRetailPriceMinor: number | null;
  priceMinor: number | null;
  compareAtMinor: number | null;
  weightGrams: number | null;
  active: boolean;
  inStock: boolean;
  sortOrder: number;
  archived: boolean;
}

export const variantView = (v: VariantRow): VariantView => ({
  id: v.id,
  productId: v.productId,
  sku: v.sku,
  colour: v.colour,
  size: v.size,
  barcode: v.barcode,
  erpVariantId: v.erpVariantId,
  erpRetailPriceMinor: v.erpRetailPriceMinor,
  priceMinor: v.priceMinor,
  compareAtMinor: v.compareAtMinor,
  weightGrams: v.weightGrams,
  active: v.active,
  inStock: v.inStock,
  sortOrder: v.sortOrder,
  archived: v.archivedAt != null,
});

const money = z.int().min(0).nullable().optional();
const editable = {
  barcode: z.string().trim().min(1).max(64).nullable().optional(),
  erpVariantId: z.string().trim().min(1).max(64).nullable().optional(),
  priceMinor: money,
  compareAtMinor: money,
  weightGrams: z.int().min(0).max(100_000).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.int().min(0).max(1_000_000).optional(),
};
export const variantInput = z
  .object({ sku: z.string().trim().min(1).max(64), productId: z.uuid(), colourId: z.uuid().nullable().optional(), sizeId: z.uuid().nullable().optional(), ...editable })
  .strict();
export const variantPatch = z.object({ ...editable, archived: z.boolean().optional() }).strict();
export type VariantInput = z.input<typeof variantInput>;
export type VariantPatch = z.input<typeof variantPatch>;

async function assertSku(deps: CatalogueDeps, who: Who, sku: string) {
  const pattern = await setting(deps, who, 'catalogue.skuPattern');
  if (!new RegExp(pattern).test(sku)) throw new CatalogueError('SKU_FORMAT', 'the SKU does not match the shop\'s SKU pattern', [`sku: ${sku}`]);
}

function assertPrices(price: number | null | undefined, compareAt: number | null | undefined) {
  if (price != null && compareAt != null && compareAt <= price) throw new CatalogueError('INVALID_INPUT', 'the compare-at price must be above the price', ['compareAtMinor']);
}

const touchesPrice = (d: { priceMinor?: number | null; compareAtMinor?: number | null }) => d.priceMinor !== undefined || d.compareAtMinor !== undefined;

async function writePrice(tx: Tx, who: Who, variantId: string, priceMinor: number | null, compareAtMinor: number | null, now: Date) {
  if (priceMinor == null) return;
  await tx.priceHistory.create({ data: { storeId: who.storeId, variantId, priceMinor, compareAtMinor, source: 'admin-api', actorId: who.actor.staffUserId, effectiveFrom: now } });
}

async function liveRef(tx: Tx, kind: 'colour' | 'size', storeId: number, id: string | null | undefined) {
  if (!id) return;
  const row = kind === 'colour' ? await tx.colour.findFirst({ where: { id, storeId }, select: { archivedAt: true } }) : await tx.size.findFirst({ where: { id, storeId }, select: { archivedAt: true } });
  if (!row) throw new CatalogueError('NOT_FOUND', `no such ${kind}`, [`${kind}Id`]);
  if (row.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', `the ${kind} is archived`, [`${kind}Id`]);
}

/** Puts a colour on the product (or brings back a taken-off one), at the end of its colour list. */
export async function attachColour(tx: Tx, who: Who, productId: string, colourId: string): Promise<void> {
  const cur = await tx.productColour.findUnique({ where: { productId_colourId: { productId, colourId } } });
  if (cur && !cur.archivedAt) return;
  const last = await tx.productColour.findFirst({ where: { productId, archivedAt: null }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const sortOrder = last ? last.sortOrder + ORDER_STEP : 0;
  if (cur) await tx.productColour.update({ where: { id: cur.id }, data: { archivedAt: null, sortOrder } });
  else await tx.productColour.create({ data: { storeId: who.storeId, productId, colourId, sortOrder } });
  await logChange(tx, who, 'product.colour.attach', 'Product', productId, null, { colourId, sortOrder });
}

async function assertFree(tx: Tx, storeId: number, productId: string, colourId: string | null, sizeId: string | null, exceptId?: string) {
  const twin = await tx.productVariant.findFirst({ where: { storeId, productId, colourId, sizeId, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { sku: true } });
  if (twin) throw new CatalogueError('VARIANT_EXISTS', 'the product already has a variant in this colour and size', [`sku: ${twin.sku}`]);
}

const loadVariant = async (tx: Tx | CatalogueDeps['db'], storeId: number, id: string) => found(await tx.productVariant.findFirst({ where: { id, storeId }, include: variantInclude }), 'variant');

export async function getVariant(deps: CatalogueDeps, who: Who, id: string): Promise<VariantView> {
  await allow(deps, who, 'catalogue.read');
  return variantView(await loadVariant(deps.db, who.storeId, id));
}

/** The variant with this ERP SKU (live or retired), or null. */
export async function variantBySku(deps: CatalogueDeps, who: Who, sku: string): Promise<VariantView | null> {
  await allow(deps, who, 'catalogue.read');
  const v = await deps.db.productVariant.findUnique({ where: { storeId_sku: { storeId: who.storeId, sku: sku.trim() } }, include: variantInclude });
  return v ? variantView(v) : null;
}

export async function createVariant(deps: CatalogueDeps, who: Who, input: VariantInput): Promise<VariantView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(variantInput, input, 'variant');
  if (touchesPrice(d)) await allow(deps, who, 'catalogue.prices');
  await assertSku(deps, who, d.sku);
  assertPrices(d.priceMinor, d.compareAtMinor);
  const now = deps.now?.() ?? new Date();
  const id = await deps.db.$transaction(async (tx) => {
    const same = await tx.productVariant.findUnique({ where: { storeId_sku: { storeId: who.storeId, sku: d.sku } } });
    if (same?.archivedAt) throw new CatalogueError('SKU_RETIRED', 'this SKU was retired and is never reused', [`sku: ${d.sku}`]);
    if (same) throw new CatalogueError('SKU_TAKEN', 'another variant has this SKU', [`sku: ${d.sku}`]);
    const product = found(await tx.product.findFirst({ where: { id: d.productId, storeId: who.storeId }, select: { id: true, archivedAt: true } }), 'product');
    if (product.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the product is archived', ['productId']);
    await liveRef(tx, 'colour', who.storeId, d.colourId);
    await liveRef(tx, 'size', who.storeId, d.sizeId);
    await assertFree(tx, who.storeId, product.id, d.colourId ?? null, d.sizeId ?? null);
    let sortOrder = d.sortOrder;
    if (sortOrder === undefined) {
      const last = await tx.productVariant.findFirst({ where: { productId: product.id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
      sortOrder = last ? last.sortOrder + 1 : 0;
    }
    const row = await tx.productVariant.create({
      data: {
        storeId: who.storeId,
        productId: product.id,
        sku: d.sku,
        colourId: d.colourId ?? null,
        sizeId: d.sizeId ?? null,
        barcode: d.barcode ?? null,
        erpVariantId: d.erpVariantId ?? null,
        priceMinor: d.priceMinor ?? null,
        compareAtMinor: d.compareAtMinor ?? null,
        weightGrams: d.weightGrams ?? null,
        active: d.active ?? true,
        sortOrder,
      },
    });
    if (row.colourId) await attachColour(tx, who, product.id, row.colourId);
    await writePrice(tx, who, row.id, row.priceMinor, row.compareAtMinor, now);
    await refreshProductSummary(tx, who.storeId, product.id);
    await logChange(tx, who, 'variant.create', 'ProductVariant', row.id, null, { sku: row.sku, productId: row.productId, colourId: row.colourId, sizeId: row.sizeId, priceMinor: row.priceMinor, compareAtMinor: row.compareAtMinor, active: row.active });
    return row.id;
  }, TX);
  return getVariant(deps, who, id);
}

export async function updateVariant(deps: CatalogueDeps, who: Who, id: string, patch: VariantPatch): Promise<VariantView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(variantPatch, patch, 'variant');
  const now = deps.now?.() ?? new Date();
  const cur0 = await loadVariant(deps.db, who.storeId, id);
  const priceMoves = (d.priceMinor !== undefined && d.priceMinor !== cur0.priceMinor) || (d.compareAtMinor !== undefined && d.compareAtMinor !== cur0.compareAtMinor);
  if (priceMoves) await allow(deps, who, 'catalogue.prices');
  if (d.priceMinor !== undefined && d.priceMinor !== cur0.priceMinor) await assertVariantFloor(deps, who, cur0, d.priceMinor);
  await deps.db.$transaction(async (tx) => {
    const cur = await loadVariant(tx, who.storeId, id);
    if (archived === false && cur.archivedAt) {
      await assertFree(tx, who.storeId, cur.productId, cur.colourId, cur.sizeId, cur.id);
      const p = await tx.product.findUniqueOrThrow({ where: { id: cur.productId }, select: { archivedAt: true } });
      if (p.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the product is archived', ['productId']);
    }
    const before = {
      barcode: cur.barcode,
      erpVariantId: cur.erpVariantId,
      priceMinor: cur.priceMinor,
      compareAtMinor: cur.compareAtMinor,
      weightGrams: cur.weightGrams,
      active: cur.active,
      sortOrder: cur.sortOrder,
      archivedAt: cur.archivedAt,
    };
    const next = {
      ...before,
      ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? now) : null,
    } as typeof before;
    assertPrices(next.priceMinor, next.compareAtMinor);
    const diff = changed(before, next);
    if (!Object.keys(diff.after).length) return;
    await tx.productVariant.update({ where: { id: cur.id }, data: next });
    if (next.priceMinor !== cur.priceMinor || next.compareAtMinor !== cur.compareAtMinor) await writePrice(tx, who, cur.id, next.priceMinor, next.compareAtMinor, now);
    if (!next.archivedAt && cur.colourId) await attachColour(tx, who, cur.productId, cur.colourId);
    await refreshProductSummary(tx, who.storeId, cur.productId);
    const action = archived === true && !cur.archivedAt ? 'variant.retire' : archived === false && cur.archivedAt ? 'variant.restore' : 'variant.update';
    await logChange(tx, who, action, 'ProductVariant', cur.id, { sku: cur.sku, ...diff.before }, { sku: cur.sku, ...diff.after });
  }, TX);
  return getVariant(deps, who, id);
}

/**
 * Creates or updates the variant with this SKU (the ERP import and the product form both use it). An existing SKU must
 * stay with its product, colour and size: an SKU's garment never changes. A retired SKU comes back only for the same
 * garment (a restore), otherwise SKU_RETIRED.
 */
export async function upsertVariantBySku(deps: CatalogueDeps, who: Who, input: VariantInput): Promise<{ variant: VariantView; created: boolean }> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(variantInput, input, 'variant');
  const cur = await deps.db.productVariant.findUnique({ where: { storeId_sku: { storeId: who.storeId, sku: d.sku } } });
  if (!cur) return { variant: await createVariant(deps, who, d), created: true };
  const same = cur.productId === d.productId && cur.colourId === (d.colourId ?? null) && cur.sizeId === (d.sizeId ?? null);
  if (!same) throw new CatalogueError(cur.archivedAt ? 'SKU_RETIRED' : 'SKU_TAKEN', "an SKU's product, colour and size never change", [`sku: ${d.sku}`]);
  const patch: VariantPatch = {
    barcode: d.barcode,
    erpVariantId: d.erpVariantId,
    priceMinor: d.priceMinor,
    compareAtMinor: d.compareAtMinor,
    weightGrams: d.weightGrams,
    active: d.active,
    sortOrder: d.sortOrder,
  };
  return { variant: await updateVariant(deps, who, cur.id, { ...patch, ...(cur.archivedAt ? { archived: false } : {}) }), created: false };
}

export async function listVariants(deps: CatalogueDeps, who: Who, productId: string, opts: { includeArchived?: boolean } = {}): Promise<VariantView[]> {
  await allow(deps, who, 'catalogue.read');
  found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
  const rows = await deps.db.productVariant.findMany({
    where: { storeId: who.storeId, productId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
    include: variantInclude,
  });
  return rows.map(variantView);
}
