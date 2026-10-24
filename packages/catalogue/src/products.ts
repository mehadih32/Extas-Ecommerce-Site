// PR 19 — the product: one style (an ERP style code), sold under a brand, in a main category, made of a fabric, with its
// colours (ProductColour: order, colour note, true-colour photo) and its variants (variants.ts: one per colour × size,
// keyed by the ERP SKU). Names and links go through naming.ts (PR 590), so a changed link always forwards.
// - A new product starts as a draft. Publishing, unpublishing and bulk actions are PR 21's; this layer never shows a
//   product to customers by itself.
// - The main category gets a listing row (CategoryProduct, hidden until the product is published) so the category page
//   index (PR 603) has it; extra listings belong to PR 52.
// - Nothing is deleted: a product is archived (only when not on sale), a colour is taken off by archiving its row.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { emitCacheEvent } from '@extas/cache/events';
import { allow, assertImage, changed, found, logChange, parse, TX, type CatalogueDeps, type Db, type Tx, type Who } from './context';
import { effectiveGarmentTypeOf } from './categories';
import { CatalogueError } from './errors';
import { readComposition, type Composition } from './fabrics';
import { applyNaming, brandOf, namingSettings, slugProblem, sourceOf, namingInclude, templateSlug, uniqueSlug, type NamingBrand, type NameSource } from './naming';
import { productPath } from './text';
import { ORDER_STEP, variantView, variantInclude, type VariantView } from './variants';

const text = (max: number) => z.string().trim().min(1).max(max);
const fields = {
  nameEn: text(200),
  nameBn: text(200).nullable().optional(),
  slug: z.string().trim().max(200).optional(),
  brandId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  fabricId: z.uuid().nullable().optional(),
  erpStyleCode: text(60).nullable().optional(),
  feedTitle: text(300).nullable().optional(),
  descriptionEn: text(10_000).nullable().optional(),
  descriptionBn: text(10_000).nullable().optional(),
  careEn: text(1000).nullable().optional(),
  careBn: text(1000).nullable().optional(),
};
export const productInput = z.object(fields).strict();
export const productPatch = z.object({ ...fields, nameEn: fields.nameEn.optional(), archived: z.boolean().optional() }).strict();
export type ProductInput = z.input<typeof productInput>;
export type ProductPatch = z.input<typeof productPatch>;

export interface ProductColourView {
  id: string;
  colourId: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  hex: string;
  noteEn: string | null;
  noteBn: string | null;
  /** This product's own true-colour photo, else the colour library's. */
  trueColourAssetId: string | null;
  sortOrder: number;
  archived: boolean;
}

export interface ProductView {
  id: string;
  slug: string;
  path: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  brandId: string | null;
  brand: NamingBrand;
  category: { id: string; slug: string; nameEn: string; nameBn: string | null } | null;
  garmentType: { id: string; key: string; nameEn: string; nameBn: string } | null;
  fabric: { id: string; nameEn: string; nameBn: string | null; composition: Composition | null; gsm: number | null } | null;
  erpStyleCode: string | null;
  feedTitle: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  careEn: string | null;
  careBn: string | null;
  inStock: boolean;
  minPriceMinor: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  colours: ProductColourView[];
  variants: VariantView[];
}

const productInclude = {
  ...namingInclude,
  category: { select: { id: true, slug: true, nameEn: true, nameBn: true } },
  fabric: { select: { id: true, nameEn: true, nameBn: true, composition: true, gsm: true } },
  colours: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { colour: { select: { id: true, key: true, nameEn: true, nameBn: true, hex: true, trueColourAssetId: true } } },
  },
  variants: { orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }], include: variantInclude },
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function nameSource(r: ProductRow): NameSource {
  return sourceOf({ ...r, colours: r.colours.filter((c) => !c.archivedAt) });
}

async function loadProduct(db: Db, storeId: number, id: string): Promise<ProductRow> {
  return found(await db.product.findFirst({ where: { id, storeId }, include: productInclude }), 'product');
}

export async function getProduct(deps: CatalogueDeps, who: Who, id: string): Promise<ProductView> {
  await allow(deps, who, 'catalogue.read');
  const ns = await namingSettings(deps, who);
  const r = await loadProduct(deps.db, who.storeId, id);
  const gt = await effectiveGarmentTypeOf(deps.db, who.storeId, r.categoryId);
  return {
    id: r.id,
    slug: r.slug,
    path: productPath(ns.prefix, r.slug),
    nameEn: r.nameEn,
    nameBn: r.nameBn,
    status: r.status,
    brandId: r.brandId,
    brand: brandOf(nameSource(r), ns),
    category: r.category,
    garmentType: gt,
    fabric: r.fabric ? { id: r.fabric.id, nameEn: r.fabric.nameEn, nameBn: r.fabric.nameBn, composition: readComposition(r.fabric.composition), gsm: r.fabric.gsm } : null,
    erpStyleCode: r.erpStyleCode,
    feedTitle: r.feedTitle,
    descriptionEn: r.descriptionEn,
    descriptionBn: r.descriptionBn,
    careEn: r.careEn,
    careBn: r.careBn,
    inStock: r.inStock,
    minPriceMinor: r.minPriceMinor,
    archived: r.archivedAt != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    colours: r.colours.map((c) => ({
      id: c.id,
      colourId: c.colourId,
      key: c.colour.key,
      nameEn: c.colour.nameEn,
      nameBn: c.colour.nameBn,
      hex: c.colour.hex,
      noteEn: c.noteEn,
      noteBn: c.noteBn,
      trueColourAssetId: c.trueColourAssetId ?? c.colour.trueColourAssetId,
      sortOrder: c.sortOrder,
      archived: c.archivedAt != null,
    })),
    variants: r.variants.map(variantView),
  };
}

export interface ProductListItem {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  brandId: string | null;
  categoryId: string | null;
  erpStyleCode: string | null;
  inStock: boolean;
  minPriceMinor: number | null;
  variants: number;
  colours: number;
  archived: boolean;
  updatedAt: string;
}

export const productListQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    categoryId: z.uuid().optional(),
    brandId: z.uuid().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED']).optional(),
    includeArchived: z.boolean().optional(),
    take: z.int().min(1).max(200).optional(),
    skip: z.int().min(0).optional(),
  })
  .strict();
export type ProductListQuery = z.input<typeof productListQuery>;

export async function listProducts(deps: CatalogueDeps, who: Who, query: ProductListQuery = {}): Promise<{ items: ProductListItem[]; total: number }> {
  await allow(deps, who, 'catalogue.read');
  const d = parse(productListQuery, query, 'product list');
  const q = d.q;
  const where: Prisma.ProductWhereInput = {
    storeId: who.storeId,
    ...(d.includeArchived ? {} : { archivedAt: null }),
    ...(d.categoryId ? { categoryId: d.categoryId } : {}),
    ...(d.brandId ? { brandId: d.brandId } : {}),
    ...(d.status ? { status: d.status } : {}),
    ...(q
      ? {
          OR: [
            { nameEn: { contains: q, mode: 'insensitive' } },
            { nameBn: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q.toLowerCase() } },
            { erpStyleCode: { contains: q, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    deps.db.product.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: d.take ?? 50,
      skip: d.skip ?? 0,
      include: { _count: { select: { variants: { where: { archivedAt: null } }, colours: { where: { archivedAt: null } } } } },
    }),
    deps.db.product.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      status: r.status,
      brandId: r.brandId,
      categoryId: r.categoryId,
      erpStyleCode: r.erpStyleCode,
      inStock: r.inStock,
      minPriceMinor: r.minPriceMinor,
      variants: r._count.variants,
      colours: r._count.colours,
      archived: r.archivedAt != null,
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
  };
}

async function checkRefs(tx: Tx, storeId: number, d: { brandId?: string | null; categoryId?: string | null; fabricId?: string | null }) {
  const live = async (row: { archivedAt: Date | null } | null, what: string, f: string) => {
    if (!row) throw new CatalogueError('NOT_FOUND', `no such ${what}`, [f]);
    if (row.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', `the ${what} is archived`, [f]);
  };
  if (d.brandId) await live(await tx.brand.findFirst({ where: { id: d.brandId, storeId }, select: { archivedAt: true } }), 'brand', 'brandId');
  if (d.categoryId) await live(await tx.category.findFirst({ where: { id: d.categoryId, storeId }, select: { archivedAt: true } }), 'category', 'categoryId');
  if (d.fabricId) await live(await tx.fabric.findFirst({ where: { id: d.fabricId, storeId }, select: { archivedAt: true } }), 'fabric', 'fabricId');
}

/** The main category's listing row (hidden until published; the summary columns copied from the product). */
async function ensureListing(tx: Tx, storeId: number, productId: string, categoryId: string | null) {
  if (!categoryId) return;
  const p = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { inStock: true, minPriceMinor: true, sortRank: true, status: true } });
  await tx.categoryProduct.upsert({
    where: { categoryId_productId: { categoryId, productId } },
    create: { storeId, categoryId, productId, isVisible: p.status === 'PUBLISHED', inStock: p.inStock, priceMinor: p.minPriceMinor, sortRank: p.sortRank },
    update: {},
  });
}

export async function createProduct(deps: CatalogueDeps, who: Who, input: ProductInput): Promise<ProductView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(productInput, input, 'product');
  const ns = await namingSettings(deps, who);
  const id = await deps.db.$transaction(async (tx) => {
    await checkRefs(tx, who.storeId, d);
    const brand = d.brandId ? await tx.brand.findFirst({ where: { id: d.brandId, storeId: who.storeId }, select: { id: true, name: true, isOwnLabel: true } }) : null;
    const category = d.categoryId ? await tx.category.findFirst({ where: { id: d.categoryId, storeId: who.storeId }, select: { id: true, nameEn: true, nameBn: true } }) : null;
    let slug: string;
    if (d.slug) {
      const problem = await slugProblem(tx, who.storeId, ns, d.slug, null, null);
      if (problem) throw new CatalogueError(problem.code, 'this link cannot be used', [problem.detail]);
      slug = d.slug;
    } else {
      const src: NameSource = { id: null, status: null, nameEn: d.nameEn, nameBn: d.nameBn ?? null, slug: '', feedTitle: null, categoryId: d.categoryId ?? null, pdpBlocks: null, minPriceMinor: null, brand, category, colours: [] };
      const gt = await effectiveGarmentTypeOf(tx, who.storeId, d.categoryId ?? null);
      slug = await uniqueSlug(tx, who.storeId, ns, templateSlug(src, ns, gt), null, null);
    }
    const row = await tx.product.create({
      data: {
        storeId: who.storeId,
        slug,
        nameEn: d.nameEn,
        nameBn: d.nameBn ?? null,
        brandId: d.brandId ?? null,
        categoryId: d.categoryId ?? null,
        fabricId: d.fabricId ?? null,
        erpStyleCode: d.erpStyleCode ?? null,
        feedTitle: d.feedTitle ?? null,
        descriptionEn: d.descriptionEn ?? null,
        descriptionBn: d.descriptionBn ?? null,
        careEn: d.careEn ?? null,
        careBn: d.careBn ?? null,
        status: 'DRAFT',
      },
    });
    await ensureListing(tx, who.storeId, row.id, row.categoryId);
    await logChange(tx, who, 'product.create', 'Product', row.id, null, { slug, nameEn: row.nameEn, brandId: row.brandId, categoryId: row.categoryId, fabricId: row.fabricId, erpStyleCode: row.erpStyleCode, status: row.status });
    return row.id;
  }, TX);
  return getProduct(deps, who, id);
}

export async function updateProduct(deps: CatalogueDeps, who: Who, id: string, patch: ProductPatch): Promise<ProductView> {
  await allow(deps, who, 'catalogue.write');
  const { archived, nameEn, nameBn, slug, brandId, feedTitle, ...d } = parse(productPatch, patch, 'product');
  const ns = await namingSettings(deps, who);
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const cur = found(await tx.product.findFirst({ where: { id, storeId: who.storeId } }), 'product');
    await checkRefs(tx, who.storeId, { ...(d.categoryId !== cur.categoryId ? { categoryId: d.categoryId } : {}), ...(d.fabricId !== cur.fabricId ? { fabricId: d.fabricId } : {}) });
    if (archived === true && !cur.archivedAt && cur.status === 'PUBLISHED') throw new CatalogueError('CONFLICT', 'take the product off sale before archiving it', ['status']);
    await applyNaming(tx, who, ns, cur.id, { nameEn, nameBn, slug, brandId, feedTitle }, now);
    const before = {
      categoryId: cur.categoryId,
      fabricId: cur.fabricId,
      erpStyleCode: cur.erpStyleCode,
      descriptionEn: cur.descriptionEn,
      descriptionBn: cur.descriptionBn,
      careEn: cur.careEn,
      careBn: cur.careBn,
      archivedAt: cur.archivedAt,
    };
    const next = {
      ...before,
      ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)),
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? now) : null,
    } as typeof before;
    const diff = changed(before, next);
    if (!Object.keys(diff.after).length) return;
    await tx.product.update({ where: { id: cur.id }, data: next });
    if (next.categoryId !== cur.categoryId) await ensureListing(tx, who.storeId, cur.id, next.categoryId);
    const action = archived === true && !cur.archivedAt ? 'product.archive' : archived === false && cur.archivedAt ? 'product.restore' : 'product.update';
    await logChange(tx, who, action, 'Product', cur.id, diff.before, diff.after);
  }, TX);
  // PR 602: its words, its category or its being archived show on its page and its lists
  emitCacheEvent({ kind: 'product', storeId: who.storeId, productIds: [id], reason: 'content' });
  return getProduct(deps, who, id);
}

// ---------------------------------------------------------------------------------------------------------------
// The product's colours
// ---------------------------------------------------------------------------------------------------------------

export const productColoursInput = z
  .object({
    colours: z
      .array(
        z
          .object({
            colourId: z.uuid(),
            noteEn: text(300).nullable().optional(),
            noteBn: text(300).nullable().optional(),
            trueColourAssetId: z.uuid().nullable().optional(),
          })
          .strict(),
      )
      .max(60)
      .refine((l) => new Set(l.map((c) => c.colourId)).size === l.length, { message: 'each colour once' }),
  })
  .strict();
export type ProductColoursInput = z.input<typeof productColoursInput>;


/**
 * Sets the product's colours in the order given, with their notes and true-colour photos. A colour left out is taken
 * off (archived), never deleted — and only when no live variant is in it (COLOUR_IN_USE).
 */
export async function setProductColours(deps: CatalogueDeps, who: Who, productId: string, input: ProductColoursInput): Promise<ProductView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(productColoursInput, input, 'product colours');
  for (const c of d.colours) await assertImage(deps.db, who.storeId, c.trueColourAssetId, 'trueColourAssetId');
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const product = found(await tx.product.findFirst({ where: { id: productId, storeId: who.storeId } }), 'product');
    const ids = d.colours.map((c) => c.colourId);
    const colours = await tx.colour.findMany({ where: { storeId: who.storeId, id: { in: ids } }, select: { id: true, archivedAt: true } });
    const known = new Map(colours.map((c) => [c.id, c]));
    const missing = ids.filter((i) => !known.has(i));
    if (missing.length) throw new CatalogueError('NOT_FOUND', 'no such colour', missing.map((m) => `colourId: ${m}`));
    const existing = await tx.productColour.findMany({ where: { productId: product.id } });
    const byColour = new Map(existing.map((e) => [e.colourId, e]));
    const removed = existing.filter((e) => !e.archivedAt && !ids.includes(e.colourId));
    if (removed.length) {
      const used = await tx.productVariant.groupBy({ by: ['colourId'], where: { storeId: who.storeId, productId: product.id, archivedAt: null, colourId: { in: removed.map((r) => r.colourId) } }, _count: { _all: true } });
      if (used.length) throw new CatalogueError('COLOUR_IN_USE', 'live variants are in these colours; archive them first', used.map((u) => `colourId: ${u.colourId} (${u._count._all})`));
    }
    const before = existing.filter((e) => !e.archivedAt).map((e) => ({ colourId: e.colourId, sortOrder: e.sortOrder, noteEn: e.noteEn, noteBn: e.noteBn, trueColourAssetId: e.trueColourAssetId }));
    for (const [i, c] of d.colours.entries()) {
      const cur = byColour.get(c.colourId);
      const isNew = !cur || cur.archivedAt;
      if (isNew && known.get(c.colourId)!.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the colour is archived', [`colourId: ${c.colourId}`]);
      const data = {
        sortOrder: i * ORDER_STEP,
        noteEn: c.noteEn === undefined ? (cur?.noteEn ?? null) : c.noteEn,
        noteBn: c.noteBn === undefined ? (cur?.noteBn ?? null) : c.noteBn,
        trueColourAssetId: c.trueColourAssetId === undefined ? (cur?.trueColourAssetId ?? null) : c.trueColourAssetId,
        archivedAt: null,
      };
      if (cur) await tx.productColour.update({ where: { id: cur.id }, data });
      else await tx.productColour.create({ data: { storeId: who.storeId, productId: product.id, colourId: c.colourId, ...data } });
    }
    for (const r of removed) await tx.productColour.update({ where: { id: r.id }, data: { archivedAt: now } });
    const after = d.colours.map((c, i) => ({ colourId: c.colourId, sortOrder: i * ORDER_STEP }));
    await logChange(tx, who, 'product.colours', 'Product', product.id, { colours: before }, { colours: after, removed: removed.map((r) => r.colourId) });
  }, TX);
  emitCacheEvent({ kind: 'product', storeId: who.storeId, productIds: [productId], reason: 'content' });
  return getProduct(deps, who, productId);
}
