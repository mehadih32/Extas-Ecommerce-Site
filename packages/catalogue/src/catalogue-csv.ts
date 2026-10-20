// PR 34 — bulk CSV import and export of the catalogue.
// - One row per variant (its ERP SKU), with its product's fields; a row without an SKU only touches the product. The
//   product's link (`product`) and the SKU are the keys. Columns, limits and separators are settings (`catalogue.csv.*`).
// - Import is previewed first, row by row: what each row creates or changes (before → after) and every problem, with
//   its column. Applying needs the preview's hash, so what is saved is exactly what was seen (PREVIEW_CHANGED).
// - An import never removes anything: an empty cell leaves the value as it is, a product or variant missing from the
//   file stays, tags and collections are only added, nothing is archived. A retired SKU is never reused.
// - Prices only with `catalogue.prices` (CLAUDE.md rule 6): a row that would change a price without it is refused.
// - Export writes the catalogue's own columns only: never cost prices, ERP prices, or anything of the owner's (PR 509).
// - Every import and export is recorded (CatalogImportJob) and in the audit log.
import { createHash } from 'node:crypto';
import { can } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import type { CsvColumn } from '@extas/settings';
import { allow, logChange, setting, TX, type CatalogueDeps, type Who } from './context';
import { addToCollection, addTags } from './collections';
import { CsvSyntaxError, formatMoneyCell, parseBool, parseMoney, readTable, uncell, writeCsv } from './csv';
import { CatalogueError, isCatalogueError } from './errors';
import { namingSettings, slugProblem } from './naming';
import { createProduct, productInput, updateProduct, type ProductPatch } from './products';
import { isSlug } from './text';
import { createVariant, updateVariant, type VariantPatch } from './variants';

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------

interface CsvSettings {
  columns: CsvColumn[];
  maxRows: number;
  maxBytes: number;
  delimiter: string;
  listSeparator: string;
  maxReports: number;
  maxTags: number;
  maxInCollection: number;
  skuPattern: RegExp;
  digits: number;
}

async function csvSettings(deps: CatalogueDeps, who: Who): Promise<CsvSettings> {
  const s = <K extends Parameters<typeof setting>[2]>(k: K) => setting(deps, who, k);
  const [columns, maxRows, maxBytes, delimiter, listSeparator, maxReports, maxTags, maxInCollection, skuPattern, currency, locale] = await Promise.all([
    s('catalogue.csv.columns'),
    s('catalogue.csv.maxRows'),
    s('catalogue.csv.maxBytes'),
    s('catalogue.csv.delimiter'),
    s('catalogue.csv.listSeparator'),
    s('catalogue.csv.maxRowReports'),
    s('catalogue.tags.maxPerProduct'),
    s('catalogue.collections.maxProducts'),
    s('catalogue.skuPattern'),
    s('store.currency'),
    s('store.locale'),
  ]);
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  return { columns, maxRows, maxBytes, delimiter, listSeparator, maxReports, maxTags, maxInCollection, skuPattern: new RegExp(skuPattern), digits };
}

// ---------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------

export interface CsvExportQuery {
  /** Only this category and its sub-categories. */
  categoryId?: string;
  includeArchived?: boolean;
}

export interface CsvExport {
  fileName: string;
  csv: string;
  rows: number;
  products: number;
}

export async function exportCatalogueCsv(deps: CatalogueDeps, who: Who, query: CsvExportQuery = {}): Promise<CsvExport> {
  await allow(deps, who, 'catalogue.export');
  const s = await csvSettings(deps, who);
  const now = deps.now?.() ?? new Date();
  let categoryIds: string[] | undefined;
  if (query.categoryId) {
    const all = await deps.db.category.findMany({ where: { storeId: who.storeId }, select: { id: true, parentId: true } });
    if (!all.some((c) => c.id === query.categoryId)) throw new CatalogueError('NOT_FOUND', 'no such category', ['categoryId']);
    const set = new Set([query.categoryId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of all) {
        if (c.parentId && set.has(c.parentId) && !set.has(c.id)) {
          set.add(c.id);
          grew = true;
        }
      }
    }
    categoryIds = [...set];
  }
  const products = await deps.db.product.findMany({
    where: { storeId: who.storeId, ...(query.includeArchived ? {} : { archivedAt: null }), ...(categoryIds ? { categoryId: { in: categoryIds } } : {}) },
    orderBy: [{ slug: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameBn: true,
      erpStyleCode: true,
      descriptionEn: true,
      descriptionBn: true,
      careEn: true,
      careBn: true,
      status: true,
      category: { select: { slug: true } },
      brand: { select: { slug: true } },
      variants: {
        where: query.includeArchived ? {} : { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
        // Cost and the ERP's prices are never read here.
        select: { sku: true, barcode: true, priceMinor: true, compareAtMinor: true, weightGrams: true, active: true, colour: { select: { key: true } }, size: { select: { key: true } } },
      },
    },
  });
  const ids = products.map((p) => p.id);
  const [tags, links] = await Promise.all([
    deps.db.productTag.findMany({ where: { storeId: who.storeId, productId: { in: ids }, archivedAt: null }, select: { productId: true, tag: { select: { slug: true } } } }),
    deps.db.collectionProduct.findMany({ where: { storeId: who.storeId, productId: { in: ids }, archivedAt: null }, select: { productId: true, collection: { select: { slug: true } } } }),
  ]);
  const list = (pairs: { productId: string; slug: string }[], id: string) =>
    pairs
      .filter((x) => x.productId === id)
      .map((x) => x.slug)
      .sort()
      .join(s.listSeparator);
  const tagPairs = tags.map((t) => ({ productId: t.productId, slug: t.tag.slug }));
  const colPairs = links.map((l) => ({ productId: l.productId, slug: l.collection.slug }));
  const rows: (string | number | null)[][] = [];
  for (const p of products) {
    const productCells: Partial<Record<CsvColumn, string | number | null>> = {
      product: p.slug,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      category: p.category?.slug ?? null,
      brand: p.brand?.slug ?? null,
      styleCode: p.erpStyleCode,
      tags: list(tagPairs, p.id),
      collections: list(colPairs, p.id),
      descriptionEn: p.descriptionEn,
      descriptionBn: p.descriptionBn,
      careEn: p.careEn,
      careBn: p.careBn,
      status: p.status,
    };
    const variants = p.variants.length ? p.variants : [null];
    for (const v of variants) {
      const cells: Partial<Record<CsvColumn, string | number | null>> = {
        ...productCells,
        sku: v?.sku ?? null,
        colour: v?.colour?.key ?? null,
        size: v?.size?.key ?? null,
        barcode: v?.barcode ?? null,
        price: v ? formatMoneyCell(v.priceMinor, s.digits) : null,
        compareAt: v ? formatMoneyCell(v.compareAtMinor, s.digits) : null,
        weightGrams: v?.weightGrams ?? null,
        active: v ? String(v.active) : null,
      };
      rows.push(s.columns.map((c) => cells[c] ?? null));
    }
  }
  const csv = writeCsv(s.columns, rows, s.delimiter);
  await deps.db.$transaction(async (tx) => {
    const job = await tx.catalogImportJob.create({
      data: { storeId: who.storeId, kind: 'CSV_EXPORT', status: 'SUCCEEDED', rowsTotal: rows.length, rowsOk: rows.length, createdById: who.actor.staffUserId ?? null, finishedAt: now, result: { query: { ...query }, columns: s.columns, products: products.length } as Prisma.InputJsonValue },
    });
    await logChange(tx, who, 'catalogue.csv.export', 'CatalogImportJob', job.id, null, { rows: rows.length, products: products.length, query: { ...query } });
  }, TX);
  return { fileName: `catalogue-${now.toISOString().slice(0, 10)}.csv`, csv, rows: rows.length, products: products.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Import: the plan (preview) and its application
// ---------------------------------------------------------------------------------------------------------------

export type CsvIssueCode =
  | 'MISSING_VALUE'
  | 'INVALID_VALUE'
  | 'UNKNOWN_KEY'
  | 'ARCHIVED'
  | 'SKU_FORMAT'
  | 'SKU_TAKEN'
  | 'SKU_RETIRED'
  | 'DUPLICATE_SKU'
  | 'VARIANT_EXISTS'
  | 'SLUG_TAKEN'
  | 'CONFLICTING_VALUE'
  | 'PRICES_NOT_ALLOWED'
  | 'TOO_MANY'
  /** Applying the row failed although its preview passed (something changed meanwhile). */
  | 'FAILED';

export interface CsvIssue {
  code: CsvIssueCode;
  column: string | null;
  detail?: string;
}

export interface CsvChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface CsvRowResult {
  line: number;
  product: string;
  sku: string | null;
  action: 'create' | 'update' | 'unchanged' | 'error';
  productAction: 'create' | 'update' | null;
  variantAction: 'create' | 'update' | null;
  changes: CsvChange[];
  issues: CsvIssue[];
}

export interface CsvPreview {
  columns: { used: CsvColumn[]; ignored: string[] };
  totals: { rows: number; create: number; update: number; unchanged: number; error: number; productsCreated: number; variantsCreated: number };
  /** Errors first, then changes, at most `catalogue.csv.maxRowReports`. */
  rows: CsvRowResult[];
  truncated: boolean;
  /** Whether this person may change prices (rows that would are refused otherwise). */
  canSetPrices: boolean;
  hash: string;
}

type Op =
  | { op: 'createProduct'; slug: string; data: { nameEn: string; nameBn?: string; categoryId?: string; brandId?: string; erpStyleCode?: string; descriptionEn?: string; descriptionBn?: string; careEn?: string; careBn?: string } }
  | { op: 'updateProduct'; slug: string; patch: ProductPatch }
  | { op: 'createVariant'; slug: string; sku: string; data: { colourId?: string; sizeId?: string; barcode?: string; priceMinor?: number; compareAtMinor?: number; weightGrams?: number; active?: boolean } }
  | { op: 'updateVariant'; sku: string; variantId: string; patch: VariantPatch }
  | { op: 'addTags'; slug: string; tagIds: string[] }
  | { op: 'addCollections'; slug: string; collectionIds: string[] };

interface Planned {
  preview: CsvPreview;
  ops: { line: number; ops: Op[] }[];
}

const PRODUCT_TEXT = ['nameEn', 'nameBn', 'styleCode', 'descriptionEn', 'descriptionBn', 'careEn', 'careBn'] as const;
const FIELD_OF: Record<(typeof PRODUCT_TEXT)[number] | 'category' | 'brand', string> = {
  nameEn: 'nameEn',
  nameBn: 'nameBn',
  styleCode: 'erpStyleCode',
  descriptionEn: 'descriptionEn',
  descriptionBn: 'descriptionBn',
  careEn: 'careEn',
  careBn: 'careBn',
  category: 'categoryId',
  brand: 'brandId',
};
/** A product text cell passes the same check as the product form (lengths from the product schema). */
const textOk = (field: string, v: string): boolean => (productInput.shape as Record<string, { safeParse(x: unknown): { success: boolean } }>)[field]?.safeParse(v).success ?? false;

async function plan(deps: CatalogueDeps, who: Who, text: string): Promise<Planned> {
  const s = await csvSettings(deps, who);
  if (typeof text !== 'string' || !text.trim()) throw new CatalogueError('CSV_INVALID', 'the file is empty', ['csv']);
  if (Buffer.byteLength(text, 'utf8') > s.maxBytes) throw new CatalogueError('CSV_INVALID', 'the file is too big', [`bytes > ${s.maxBytes}`]);
  let table;
  try {
    table = readTable(text, s.delimiter);
  } catch (e) {
    if (e instanceof CsvSyntaxError) throw new CatalogueError('CSV_INVALID', 'a quote is never closed', [`line: ${e.line}`]);
    throw e;
  }
  const known = new Set<string>(s.columns);
  const dup = table.header.filter((h, i) => table.header.indexOf(h) !== i);
  if (dup.length) throw new CatalogueError('CSV_INVALID', 'a column is in the header twice', dup.map((d) => `column: ${d}`));
  if (!table.header.includes('product')) throw new CatalogueError('CSV_INVALID', 'the header needs a product column', ['column: product']);
  if (table.rows.length > s.maxRows) throw new CatalogueError('CSV_INVALID', 'too many rows in one file', [`rows: ${table.rows.length} > ${s.maxRows}`]);
  const used = table.header.filter((h): h is CsvColumn => known.has(h) && h !== 'status');
  const ignored = table.header.filter((h) => !known.has(h) || h === 'status');
  const col = new Map(table.header.map((h, i) => [h, i]));
  const cell = (cells: string[], c: CsvColumn): string => {
    const i = col.get(c);
    return i === undefined || !used.includes(c) ? '' : uncell((cells[i] ?? '').trim());
  };
  const split = (v: string) => [...new Set(v.split(s.listSeparator).map((x) => x.trim()).filter(Boolean))];

  // --- what the file names, looked up once ---
  const slugs = [...new Set(table.rows.map((r) => cell(r.cells, 'product')).filter(Boolean))];
  const skus = [...new Set(table.rows.map((r) => cell(r.cells, 'sku')).filter(Boolean))];
  const many = (c: CsvColumn) => [...new Set(table.rows.flatMap((r) => split(cell(r.cells, c))))];
  const one = (c: CsvColumn) => [...new Set(table.rows.map((r) => cell(r.cells, c)).filter(Boolean))];
  const storeId = who.storeId;
  const [products, variants, categories, brands, colours, sizes, tags, collections, canSetPrices, ns] = await Promise.all([
    deps.db.product.findMany({
      where: { storeId, slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameBn: true,
        erpStyleCode: true,
        descriptionEn: true,
        descriptionBn: true,
        careEn: true,
        careBn: true,
        categoryId: true,
        brandId: true,
        archivedAt: true,
        variants: { where: { archivedAt: null }, select: { colourId: true, sizeId: true } },
      },
    }),
    deps.db.productVariant.findMany({ where: { storeId, sku: { in: skus } }, select: { id: true, sku: true, productId: true, colourId: true, sizeId: true, barcode: true, priceMinor: true, compareAtMinor: true, weightGrams: true, active: true, archivedAt: true } }),
    deps.db.category.findMany({ where: { storeId, slug: { in: one('category') } }, select: { id: true, slug: true, archivedAt: true } }),
    deps.db.brand.findMany({ where: { storeId, slug: { in: one('brand') } }, select: { id: true, slug: true, archivedAt: true } }),
    deps.db.colour.findMany({ where: { storeId, key: { in: one('colour') } }, select: { id: true, key: true, archivedAt: true } }),
    deps.db.size.findMany({ where: { storeId, key: { in: one('size') } }, select: { id: true, key: true, archivedAt: true } }),
    deps.db.tag.findMany({ where: { storeId, slug: { in: many('tags') } }, select: { id: true, slug: true, archivedAt: true } }),
    deps.db.collection.findMany({ where: { storeId, slug: { in: many('collections') } }, select: { id: true, slug: true, kind: true, archivedAt: true, _count: { select: { products: { where: { archivedAt: null } } } } } }),
    can(deps.db, who.actor, 'catalogue.prices', { storeId }),
    namingSettings(deps, who),
  ]);
  const productIds = products.map((p) => p.id);
  const [tagLinks, colLinks] = await Promise.all([
    deps.db.productTag.findMany({ where: { storeId, productId: { in: productIds }, archivedAt: null }, select: { productId: true, tagId: true } }),
    deps.db.collectionProduct.findMany({ where: { storeId, productId: { in: productIds }, archivedAt: null }, select: { productId: true, collectionId: true } }),
  ]);

  // --- the simulated catalogue, updated row by row as the plan goes ---
  interface ProductState {
    id: string | null;
    archived: boolean;
    fields: Record<string, string | null>;
    /** colour|size pairs with a live variant. */
    pairs: Set<string>;
    tags: Set<string>;
    collections: Set<string>;
  }
  const state = new Map<string, ProductState>();
  for (const p of products) {
    state.set(p.slug, {
      id: p.id,
      archived: p.archivedAt != null,
      fields: { nameEn: p.nameEn, nameBn: p.nameBn, erpStyleCode: p.erpStyleCode, descriptionEn: p.descriptionEn, descriptionBn: p.descriptionBn, careEn: p.careEn, careBn: p.careBn, categoryId: p.categoryId, brandId: p.brandId },
      pairs: new Set(p.variants.map((v) => `${v.colourId}|${v.sizeId}`)),
      tags: new Set(tagLinks.filter((t) => t.productId === p.id).map((t) => t.tagId)),
      collections: new Set(colLinks.filter((c) => c.productId === p.id).map((c) => c.collectionId)),
    });
  }
  const variantBySku = new Map(variants.map((v) => [v.sku, { ...v }]));
  const skusSeen = new Map<string, number>();
  const collectionSize = new Map(collections.map((c) => [c.id, c._count.products]));
  const bySlug = <T extends { slug: string }>(rows: T[]) => new Map(rows.map((r) => [r.slug, r]));
  const byKey = <T extends { key: string }>(rows: T[]) => new Map(rows.map((r) => [r.key, r]));
  const catMap = bySlug(categories);
  const brandMap = bySlug(brands);
  const colourMap = byKey(colours);
  const sizeMap = byKey(sizes);
  const tagMap = bySlug(tags);
  const colMap = bySlug(collections);
  /** Values a product field was given by an earlier row of this file (a later different value is a conflict). */
  const given = new Map<string, string>();

  const results: CsvRowResult[] = [];
  const opsByRow: { line: number; ops: Op[] }[] = [];

  for (const r of table.rows) {
    const issues: CsvIssue[] = [];
    const changes: CsvChange[] = [];
    const ops: Op[] = [];
    const issue = (code: CsvIssueCode, column: string | null, detail?: string) => issues.push({ code, column, ...(detail ? { detail } : {}) });
    const slug = cell(r.cells, 'product');
    const sku = cell(r.cells, 'sku') || null;
    let productAction: CsvRowResult['productAction'] = null;
    let variantAction: CsvRowResult['variantAction'] = null;

    if (!slug) issue('MISSING_VALUE', 'product');
    else if (!isSlug(slug) || slug.length > ns.slug.maxLength) issue('INVALID_VALUE', 'product', 'letters, digits and hyphens');
    const cur = slug ? state.get(slug) : undefined;
    if (cur?.archived) issue('ARCHIVED', 'product');

    // ---- product fields: only what the row gives; an empty cell changes nothing ----
    const wanted: Record<string, string> = {};
    for (const c of PRODUCT_TEXT) {
      const v = cell(r.cells, c);
      if (!v) continue;
      if (!textOk(FIELD_OF[c], v)) issue('INVALID_VALUE', c, 'too long');
      else wanted[FIELD_OF[c]] = v;
    }
    for (const [c, map] of [
      ['category', catMap],
      ['brand', brandMap],
    ] as const) {
      const v = cell(r.cells, c);
      if (!v) continue;
      const hit = map.get(v);
      if (!hit) issue('UNKNOWN_KEY', c, v);
      // An archived category or brand the product already has is no change (an exported file reads back cleanly).
      else if (hit.archivedAt && cur?.fields[FIELD_OF[c]] !== hit.id) issue('ARCHIVED', c, v);
      else wanted[FIELD_OF[c]] = hit.id;
    }
    for (const [f, v] of Object.entries(wanted)) {
      const k = `${slug}|${f}`;
      const prev = given.get(k);
      if (prev !== undefined && prev !== v) issue('CONFLICTING_VALUE', Object.keys(FIELD_OF).find((x) => FIELD_OF[x as keyof typeof FIELD_OF] === f) ?? f);
    }
    if (slug && !cur && !wanted.nameEn) issue('MISSING_VALUE', 'nameEn', 'a new product needs its name');
    if (slug && !cur && !issues.length) {
      const problem = await slugProblem(deps.db, storeId, ns, slug, null, null);
      if (problem) issue(problem.code === 'SLUG_TAKEN' ? 'SLUG_TAKEN' : 'INVALID_VALUE', 'product', problem.detail);
    }
    const productPatch: Record<string, string> = {};
    if (cur) {
      for (const [f, v] of Object.entries(wanted)) {
        if ((cur.fields[f] ?? null) !== v) {
          productPatch[f] = v;
          changes.push({ field: f, before: cur.fields[f] ?? null, after: v });
        }
      }
    } else if (slug) {
      for (const [f, v] of Object.entries(wanted)) changes.push({ field: f, before: null, after: v });
    }

    // ---- the variant ----
    const colourKey = cell(r.cells, 'colour');
    const sizeKey = cell(r.cells, 'size');
    const existingVariant = sku ? variantBySku.get(sku) : undefined;
    const ref = (key: string, map: Map<string, { id: string; archivedAt: Date | null }>, column: string, current: string | null | undefined) => {
      if (!key) return undefined;
      const hit = map.get(key);
      if (!hit) return void issue('UNKNOWN_KEY', column, key);
      // An archived colour or size is refused for a new variant only; the SKU that already has it reads back cleanly.
      if (hit.archivedAt && hit.id !== current) return void issue('ARCHIVED', column, key);
      return hit.id;
    };
    const colourId = ref(colourKey, colourMap, 'colour', existingVariant?.archivedAt ? null : existingVariant?.colourId);
    const sizeId = ref(sizeKey, sizeMap, 'size', existingVariant?.archivedAt ? null : existingVariant?.sizeId);
    const money = (c: 'price' | 'compareAt') => {
      const v = cell(r.cells, c);
      if (!v) return undefined;
      const m = parseMoney(v, s.digits);
      if (m === null) issue('INVALID_VALUE', c, 'a number such as 850 or 850.50');
      return m ?? undefined;
    };
    const price = money('price');
    const compareAt = money('compareAt');
    const barcode = cell(r.cells, 'barcode') || undefined;
    if (barcode && barcode.length > 64) issue('INVALID_VALUE', 'barcode', 'at most 64 characters');
    const wRaw = cell(r.cells, 'weightGrams');
    const weight = wRaw ? Number(wRaw) : undefined;
    if (wRaw && (!Number.isInteger(weight) || weight! < 0 || weight! > 100_000)) issue('INVALID_VALUE', 'weightGrams', 'whole grams');
    const aRaw = cell(r.cells, 'active');
    const active = aRaw ? parseBool(aRaw) : undefined;
    if (aRaw && active === null) issue('INVALID_VALUE', 'active', 'true or false');
    const variantGiven = price !== undefined || compareAt !== undefined || barcode !== undefined || weight !== undefined || (active !== undefined && active !== null) || colourKey || sizeKey;
    if (!sku && variantGiven) issue('MISSING_VALUE', 'sku', 'variant columns need the SKU');

    let variantPatch: VariantPatch | null = null;
    let variantCreate: Extract<Op, { op: 'createVariant' }>['data'] | null = null;
    if (sku) {
      if (sku.length > 64 || !s.skuPattern.test(sku)) issue('SKU_FORMAT', 'sku', sku);
      const firstLine = skusSeen.get(sku);
      if (firstLine !== undefined) issue('DUPLICATE_SKU', 'sku', `line ${firstLine}`);
      else skusSeen.set(sku, r.line);
      const v = variantBySku.get(sku);
      // A second row for one SKU is refused as that alone (what the first row does to it is shown there).
      if (firstLine !== undefined) {
        /* nothing more to say about this row's variant */
      } else if (v?.archivedAt) issue('SKU_RETIRED', 'sku', 'a retired SKU is never reused');
      else if (v) {
        if (!cur || v.productId !== cur.id) issue('SKU_TAKEN', 'sku', 'the SKU belongs to another product');
        if ((colourKey && colourId && colourId !== v.colourId) || (sizeKey && sizeId && sizeId !== v.sizeId)) issue('SKU_TAKEN', colourKey ? 'colour' : 'size', "an SKU's colour and size never change");
        const p: VariantPatch = {};
        const diff = <K extends keyof VariantPatch>(k: K, field: string, val: VariantPatch[K] | undefined, before: unknown) => {
          if (val === undefined || val === before) return;
          (p as Record<string, unknown>)[k] = val;
          changes.push({ field, before: (before ?? null) as CsvChange['before'], after: val as CsvChange['after'] });
        };
        diff('barcode', 'barcode', barcode, v.barcode);
        diff('priceMinor', 'price', price, v.priceMinor);
        diff('compareAtMinor', 'compareAt', compareAt, v.compareAtMinor);
        diff('weightGrams', 'weightGrams', weight, v.weightGrams);
        diff('active', 'active', active ?? undefined, v.active);
        const nextPrice = p.priceMinor ?? v.priceMinor;
        const nextCompare = p.compareAtMinor ?? v.compareAtMinor;
        if (nextPrice != null && nextCompare != null && nextCompare <= nextPrice) issue('INVALID_VALUE', 'compareAt', 'the compare-at price must be above the price');
        if ((p.priceMinor !== undefined || p.compareAtMinor !== undefined) && !canSetPrices) issue('PRICES_NOT_ALLOWED', p.priceMinor !== undefined ? 'price' : 'compareAt');
        if (Object.keys(p).length) variantPatch = p;
      } else {
        const pair = `${colourId ?? null}|${sizeId ?? null}`;
        if (cur?.pairs.has(pair)) issue('VARIANT_EXISTS', colourKey ? 'colour' : 'size', 'the product already has a variant in this colour and size');
        if (price !== undefined && compareAt !== undefined && compareAt <= price) issue('INVALID_VALUE', 'compareAt', 'the compare-at price must be above the price');
        if ((price !== undefined || compareAt !== undefined) && !canSetPrices) issue('PRICES_NOT_ALLOWED', price !== undefined ? 'price' : 'compareAt');
        variantCreate = {
          ...(colourId ? { colourId } : {}),
          ...(sizeId ? { sizeId } : {}),
          ...(barcode ? { barcode } : {}),
          ...(price !== undefined ? { priceMinor: price } : {}),
          ...(compareAt !== undefined ? { compareAtMinor: compareAt } : {}),
          ...(weight !== undefined ? { weightGrams: weight } : {}),
          ...(active !== undefined && active !== null ? { active } : {}),
        };
        changes.push({ field: 'sku', before: null, after: sku });
        for (const [f, val] of Object.entries(variantCreate)) if (f !== 'colourId' && f !== 'sizeId') changes.push({ field: f === 'priceMinor' ? 'price' : f === 'compareAtMinor' ? 'compareAt' : f, before: null, after: val as CsvChange['after'] });
        if (colourKey) changes.push({ field: 'colour', before: null, after: colourKey });
        if (sizeKey) changes.push({ field: 'size', before: null, after: sizeKey });
      }
    }

    // ---- tags and collections: only added ----
    const tagIds: string[] = [];
    for (const t of split(cell(r.cells, 'tags'))) {
      const hit = tagMap.get(t);
      if (!hit) issue('UNKNOWN_KEY', 'tags', t);
      else if (cur?.tags.has(hit.id)) continue;
      else if (hit.archivedAt) issue('ARCHIVED', 'tags', t);
      else tagIds.push(hit.id);
    }
    if ((cur?.tags.size ?? 0) + tagIds.length > s.maxTags) issue('TOO_MANY', 'tags', `at most ${s.maxTags}`);
    const collectionIds: string[] = [];
    for (const c of split(cell(r.cells, 'collections'))) {
      const hit = colMap.get(c);
      if (!hit) issue('UNKNOWN_KEY', 'collections', c);
      else if (cur?.collections.has(hit.id)) continue;
      else if (hit.archivedAt) issue('ARCHIVED', 'collections', c);
      else if (hit.kind === 'RULE') issue('INVALID_VALUE', 'collections', `${c}: its products follow its rule`);
      else {
        if ((collectionSize.get(hit.id) ?? 0) + 1 > s.maxInCollection) issue('TOO_MANY', 'collections', `${c}: at most ${s.maxInCollection}`);
        else collectionIds.push(hit.id);
      }
    }
    if (tagIds.length) changes.push({ field: 'tags', before: null, after: tags.filter((t) => tagIds.includes(t.id)).map((t) => t.slug).join(s.listSeparator) });
    if (collectionIds.length) changes.push({ field: 'collections', before: null, after: collections.filter((c) => collectionIds.includes(c.id)).map((c) => c.slug).join(s.listSeparator) });

    // ---- the row's result and, when it is clean, its operations; the simulation moves on ----
    if (!issues.length && slug) {
      if (!cur) {
        productAction = 'create';
        const w = wanted as Record<string, string>;
        ops.push({
          op: 'createProduct',
          slug,
          data: {
            nameEn: w.nameEn!,
            ...(w.nameBn ? { nameBn: w.nameBn } : {}),
            ...(w.categoryId ? { categoryId: w.categoryId } : {}),
            ...(w.brandId ? { brandId: w.brandId } : {}),
            ...(w.erpStyleCode ? { erpStyleCode: w.erpStyleCode } : {}),
            ...(w.descriptionEn ? { descriptionEn: w.descriptionEn } : {}),
            ...(w.descriptionBn ? { descriptionBn: w.descriptionBn } : {}),
            ...(w.careEn ? { careEn: w.careEn } : {}),
            ...(w.careBn ? { careBn: w.careBn } : {}),
          },
        });
        state.set(slug, { id: null, archived: false, fields: { ...wanted }, pairs: new Set(), tags: new Set(), collections: new Set() });
      } else if (Object.keys(productPatch).length) {
        productAction = 'update';
        ops.push({ op: 'updateProduct', slug, patch: productPatch as ProductPatch });
        Object.assign(cur.fields, productPatch);
      }
      for (const [f, v] of Object.entries(wanted)) given.set(`${slug}|${f}`, v);
      const st = state.get(slug)!;
      if (sku && variantCreate) {
        variantAction = 'create';
        ops.push({ op: 'createVariant', slug, sku, data: variantCreate });
        st.pairs.add(`${variantCreate.colourId ?? null}|${variantCreate.sizeId ?? null}`);
        variantBySku.set(sku, { id: '', sku, productId: st.id ?? '', colourId: variantCreate.colourId ?? null, sizeId: variantCreate.sizeId ?? null, barcode: variantCreate.barcode ?? null, priceMinor: variantCreate.priceMinor ?? null, compareAtMinor: variantCreate.compareAtMinor ?? null, weightGrams: variantCreate.weightGrams ?? null, active: variantCreate.active ?? true, archivedAt: null });
      } else if (sku && variantPatch) {
        variantAction = 'update';
        const v = variantBySku.get(sku)!;
        ops.push({ op: 'updateVariant', sku, variantId: v.id, patch: variantPatch });
        Object.assign(v, variantPatch);
      }
      if (tagIds.length) {
        ops.push({ op: 'addTags', slug, tagIds });
        for (const t of tagIds) st.tags.add(t);
      }
      if (collectionIds.length) {
        ops.push({ op: 'addCollections', slug, collectionIds });
        for (const c of collectionIds) {
          st.collections.add(c);
          collectionSize.set(c, (collectionSize.get(c) ?? 0) + 1);
        }
      }
    }
    const action: CsvRowResult['action'] = issues.length ? 'error' : productAction === 'create' || variantAction === 'create' ? 'create' : ops.length ? 'update' : 'unchanged';
    results.push({ line: r.line, product: slug, sku, action, productAction, variantAction, changes: issues.length ? [] : changes, issues });
    if (ops.length) opsByRow.push({ line: r.line, ops });
  }

  const count = (a: CsvRowResult['action']) => results.filter((x) => x.action === a).length;
  const ordered = [...results.filter((x) => x.action === 'error'), ...results.filter((x) => x.action === 'create' || x.action === 'update'), ...results.filter((x) => x.action === 'unchanged')];
  const hash = createHash('sha256').update(JSON.stringify({ storeId, results, opsByRow })).digest('hex');
  return {
    preview: {
      columns: { used, ignored },
      totals: {
        rows: results.length,
        create: count('create'),
        update: count('update'),
        unchanged: count('unchanged'),
        error: count('error'),
        productsCreated: results.filter((x) => x.productAction === 'create').length,
        variantsCreated: results.filter((x) => x.variantAction === 'create').length,
      },
      rows: ordered.slice(0, s.maxReports),
      truncated: ordered.length > s.maxReports,
      canSetPrices,
      hash,
    },
    ops: opsByRow,
  };
}

/** What the file would do, row by row. Nothing is saved. */
export async function previewCsvImport(deps: CatalogueDeps, who: Who, csv: string): Promise<CsvPreview> {
  await allow(deps, who, 'catalogue.import');
  await allow(deps, who, 'catalogue.write');
  return (await plan(deps, who, csv)).preview;
}

export interface CsvImportResult {
  jobId: string;
  applied: number;
  skipped: number;
  failed: { line: number; code: string; details: string[] }[];
  totals: CsvPreview['totals'];
}

/**
 * Applies the file exactly as previewed (the hash must match). Rows with problems are skipped, never half-applied
 * guesses; each clean row goes through the same services as the admin forms (SKU rules, price history, links, audit).
 */
export async function applyCsvImport(deps: CatalogueDeps, who: Who, csv: string, hash: string): Promise<CsvImportResult> {
  await allow(deps, who, 'catalogue.import');
  await allow(deps, who, 'catalogue.write');
  const p = await plan(deps, who, csv);
  if (p.preview.hash !== hash) throw new CatalogueError('PREVIEW_CHANGED', 'the catalogue or the file changed since the preview; preview again');
  const now = deps.now?.() ?? new Date();
  const [maxTags, maxInCollection] = await Promise.all([setting(deps, who, 'catalogue.tags.maxPerProduct'), setting(deps, who, 'catalogue.collections.maxProducts')]);
  const job = await deps.db.catalogImportJob.create({ data: { storeId: who.storeId, kind: 'CSV_IMPORT', status: 'RUNNING', rowsTotal: p.preview.totals.rows, createdById: who.actor.staffUserId ?? null } });
  const ids = new Map<string, string>();
  const productId = async (slug: string) => {
    const known = ids.get(slug);
    if (known) return known;
    const row = await deps.db.product.findUniqueOrThrow({ where: { storeId_slug: { storeId: who.storeId, slug } }, select: { id: true } });
    ids.set(slug, row.id);
    return row.id;
  };
  const failed: CsvImportResult['failed'] = [];
  let applied = 0;
  for (const row of p.ops) {
    try {
      for (const op of row.ops) {
        switch (op.op) {
          case 'createProduct':
            ids.set(op.slug, (await createProduct(deps, who, { ...op.data, slug: op.slug })).id);
            break;
          case 'updateProduct':
            await updateProduct(deps, who, await productId(op.slug), op.patch);
            break;
          case 'createVariant':
            await createVariant(deps, who, { sku: op.sku, productId: await productId(op.slug), ...op.data });
            break;
          case 'updateVariant':
            await updateVariant(deps, who, op.variantId || (await deps.db.productVariant.findUniqueOrThrow({ where: { storeId_sku: { storeId: who.storeId, sku: op.sku } }, select: { id: true } })).id, op.patch);
            break;
          case 'addTags': {
            const pid = await productId(op.slug);
            await deps.db.$transaction((tx) => addTags(tx, who, [{ productId: pid, tagIds: op.tagIds }], maxTags), TX);
            break;
          }
          case 'addCollections': {
            const pid = await productId(op.slug);
            await deps.db.$transaction(async (tx) => {
              for (const c of op.collectionIds) await addToCollection(tx, who, c, [pid], maxInCollection);
            }, TX);
            break;
          }
        }
      }
      applied++;
    } catch (e) {
      if (!isCatalogueError(e)) console.warn(`catalogue csv: line ${row.line}: ${(e instanceof Error ? e.message : String(e)).split('\n').slice(-1)[0]}`);
      failed.push({ line: row.line, code: isCatalogueError(e) ? e.code : 'FAILED', details: isCatalogueError(e) ? e.details : [] });
    }
  }
  const skipped = p.preview.totals.error;
  await deps.db.$transaction(async (tx) => {
    await tx.catalogImportJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        rowsOk: applied + p.preview.totals.unchanged,
        rowsFailed: skipped + failed.length,
        finishedAt: deps.now?.() ?? new Date(),
        result: { totals: p.preview.totals, applied, skipped, failed: failed.slice(0, p.preview.rows.length || 1), hash } as Prisma.InputJsonValue,
      },
    });
    await logChange(tx, who, 'catalogue.csv.import', 'CatalogImportJob', job.id, null, { totals: p.preview.totals, applied, skipped, failed: failed.length, at: now.toISOString() });
  }, TX);
  return { jobId: job.id, applied, skipped, failed, totals: p.preview.totals };
}
