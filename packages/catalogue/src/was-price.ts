// PR 38 — the "was" (struck-through) price, with the honesty rule enforced (Blueprint D1.7, D10 "Off unless chosen",
// App. B #71). A struck price only ever comes from something real:
// - MRP: the brand's list price for genuine branded goods — the variant's compare-at price, never on the shop's own
//   label (unless the owner switches `catalogue.wasPrice.mrpOwnLabel` on);
// - PRICE_HISTORY: a real former price out of the automatic price history (PriceHistory, written on every price
//   change): the lowest price in effect during `catalogue.wasPrice.historyDays` before the current price began, shown
//   for that many days after the change;
// - COMBO: the sum of the pieces' own prices, on a combo or set (never on a single product);
// - LAUNCH_PRICE: a launch or limited-time price with a real end date — those come with the campaign engine (S10),
//   so until then it shows nothing.
// The source is chosen per product → category → parent categories → the store (`catalogue.wasPrice.defaultSource`,
// the owner's decision, empty by default): with nothing chosen there is no struck price anywhere. This code never
// makes up a price: it only reads prices that were set (with `catalogue.prices`) and recorded.
import { z } from 'zod';
import { wasPriceSourceSchema } from '@extas/settings';
import { allow, found, logChange, parse, setting, TX, type CatalogueDeps, type Db, type Who } from './context';
import { CatalogueError } from './errors';

export type WasPriceSource = z.output<typeof wasPriceSourceSchema>;

/** Why a struck price shows or not (the admin explains it; the storefront only reads `wasMinor`). */
export type WasPriceReason =
  | 'SHOWN'
  /** Nothing chosen anywhere (the owner has not decided): no struck price. */
  | 'NOT_CHOSEN'
  /** "None" chosen. */
  | 'OFF'
  | 'NO_PRICE'
  /** MRP chosen, but the variant has no compare-at (list) price. */
  | 'NO_MRP'
  /** MRP chosen, but the product is the shop's own label (or has no brand). */
  | 'MRP_OWN_LABEL'
  /** The candidate is not above today's price. */
  | 'NOT_HIGHER'
  /** No earlier price in the history. */
  | 'NO_HISTORY'
  /** The price changed longer ago than the history window: it is simply the price now. */
  | 'TOO_OLD'
  /** COMBO applies to combos and sets, not to a single product. */
  | 'COMBO_ONLY'
  /** A launch price needs a real end date (campaign engine, S10). */
  | 'NO_END_DATE';

export interface WasPriceInput {
  source: WasPriceSource | null;
  priceMinor: number | null;
  compareAtMinor: number | null;
  /** The product's brand; null = none recorded. */
  brand: { isOwnLabel: boolean } | null;
  mrpOwnLabel: boolean;
  /** The variant's recorded prices, any order. */
  history: { priceMinor: number; effectiveFrom: Date }[];
  historyDays: number;
  now: Date;
}

export interface WasPriceResult {
  wasMinor: number | null;
  reason: WasPriceReason;
  /** PRICE_HISTORY: when the current price began. */
  since: Date | null;
}

const DAY_MS = 86_400_000;
const no = (reason: WasPriceReason, since: Date | null = null): WasPriceResult => ({ wasMinor: null, reason, since });

/** The honesty rule itself: pure, so it is tested on its own. */
export function wasPriceFor(i: WasPriceInput): WasPriceResult {
  if (i.source === null) return no('NOT_CHOSEN');
  if (i.source === 'NONE') return no('OFF');
  if (i.priceMinor == null) return no('NO_PRICE');
  switch (i.source) {
    case 'MRP': {
      if (i.compareAtMinor == null) return no('NO_MRP');
      if ((!i.brand || i.brand.isOwnLabel) && !i.mrpOwnLabel) return no('MRP_OWN_LABEL');
      return i.compareAtMinor > i.priceMinor ? { wasMinor: i.compareAtMinor, reason: 'SHOWN', since: null } : no('NOT_HIGHER');
    }
    case 'PRICE_HISTORY': {
      const h = [...i.history].filter((r) => r.effectiveFrom <= i.now).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
      if (!h.length || h[h.length - 1]!.priceMinor !== i.priceMinor) return no('NO_HISTORY');
      // The current price began at the first row of the last run at today's price.
      let k = h.length - 1;
      while (k > 0 && h[k - 1]!.priceMinor === i.priceMinor) k--;
      if (k === 0) return no('NO_HISTORY');
      const since = h[k]!.effectiveFrom;
      const window = i.historyDays * DAY_MS;
      if (i.now.getTime() - since.getTime() > window) return no('TOO_OLD', since);
      const from = new Date(since.getTime() - window);
      // Prices in effect during [from, since): the one in effect at `from`, and every one that began inside.
      const inForce = h.slice(0, k).filter((r, idx, arr) => r.effectiveFrom >= from || (arr[idx + 1]?.effectiveFrom ?? since) > from);
      if (!inForce.length) return no('NO_HISTORY', since);
      const lowest = Math.min(...inForce.map((r) => r.priceMinor));
      return lowest > i.priceMinor ? { wasMinor: lowest, reason: 'SHOWN', since } : no('NOT_HIGHER', since);
    }
    case 'COMBO':
      return no('COMBO_ONLY');
    case 'LAUNCH_PRICE':
      return no('NO_END_DATE');
  }
}

/** A combo's or set's struck price: the sum of its pieces' own prices, when every piece has one and it is higher. */
export function comboWasFor(setPriceMinor: number | null, pieces: { priceMinor: number | null; quantity: number }[]): { sumMinor: number | null; wasMinor: number | null; reason: WasPriceReason } {
  if (setPriceMinor == null || !pieces.length || pieces.some((p) => p.priceMinor == null)) return { sumMinor: null, wasMinor: null, reason: 'NO_PRICE' };
  const sum = pieces.reduce((s, p) => s + p.priceMinor! * p.quantity, 0);
  return sum > setPriceMinor ? { sumMinor: sum, wasMinor: sum, reason: 'SHOWN' } : { sumMinor: sum, wasMinor: null, reason: 'NOT_HIGHER' };
}

// ---------------------------------------------------------------------------------------------------------------
// Where the source comes from: product → category → parents → store
// ---------------------------------------------------------------------------------------------------------------

export interface SourceChoice {
  source: WasPriceSource | null;
  from: 'product' | 'category' | 'store' | 'none';
  /** The category that set it (from = category). */
  categoryId: string | null;
}

async function categorySource(db: Db, storeId: number, categoryId: string | null): Promise<{ source: WasPriceSource; categoryId: string } | null> {
  for (let id = categoryId, guard = 0; id && guard < 64; guard++) {
    const c = await db.category.findFirst({ where: { id, storeId }, select: { id: true, parentId: true, wasPriceSource: true } });
    if (!c) return null;
    if (c.wasPriceSource) return { source: c.wasPriceSource, categoryId: c.id };
    id = c.parentId;
  }
  return null;
}

async function sourceFor(deps: CatalogueDeps, who: Who, product: { wasPriceSource: WasPriceSource | null; categoryId: string | null }): Promise<SourceChoice> {
  if (product.wasPriceSource) return { source: product.wasPriceSource, from: 'product', categoryId: null };
  const c = await categorySource(deps.db, who.storeId, product.categoryId);
  if (c) return { source: c.source, from: 'category', categoryId: c.categoryId };
  const store = await setting(deps, who, 'catalogue.wasPrice.defaultSource');
  return store ? { source: store, from: 'store', categoryId: null } : { source: null, from: 'none', categoryId: null };
}

export interface VariantWasPrice {
  variantId: string;
  sku: string;
  priceMinor: number | null;
  wasMinor: number | null;
  reason: WasPriceReason;
  since: string | null;
}

export interface ProductWasPrice {
  productId: string;
  choice: SourceChoice;
  variants: VariantWasPrice[];
}

/** The struck price of each live variant of a product, with the reason (the storefront reads `wasMinor` only). */
export async function resolveWasPrice(deps: CatalogueDeps, who: Who, productId: string): Promise<ProductWasPrice> {
  await allow(deps, who, 'catalogue.read');
  const p = found(
    await deps.db.product.findFirst({
      where: { id: productId, storeId: who.storeId },
      select: { id: true, categoryId: true, wasPriceSource: true, brand: { select: { isOwnLabel: true } }, variants: { where: { archivedAt: null }, select: { id: true, sku: true, priceMinor: true, compareAtMinor: true }, orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }] } },
    }),
    'product',
  );
  const [choice, historyDays, mrpOwnLabel] = await Promise.all([sourceFor(deps, who, p), setting(deps, who, 'catalogue.wasPrice.historyDays'), setting(deps, who, 'catalogue.wasPrice.mrpOwnLabel')]);
  const now = deps.now?.() ?? new Date();
  const history = choice.source === 'PRICE_HISTORY' ? await deps.db.priceHistory.findMany({ where: { storeId: who.storeId, variantId: { in: p.variants.map((v) => v.id) } }, select: { variantId: true, priceMinor: true, effectiveFrom: true } }) : [];
  return {
    productId: p.id,
    choice,
    variants: p.variants.map((v) => {
      const r = wasPriceFor({ source: choice.source, priceMinor: v.priceMinor, compareAtMinor: v.compareAtMinor, brand: p.brand, mrpOwnLabel, history: history.filter((h) => h.variantId === v.id), historyDays, now });
      return { variantId: v.id, sku: v.sku, priceMinor: v.priceMinor, wasMinor: r.wasMinor, reason: r.reason, since: r.since?.toISOString() ?? null };
    }),
  };
}

/** A combo's struck price (S03 decides where it shows; the value is only ever this sum). */
export async function comboWasPrice(deps: CatalogueDeps, who: Who, comboId: string): Promise<{ comboId: string; setPriceMinor: number | null; sumMinor: number | null; wasMinor: number | null; reason: WasPriceReason }> {
  await allow(deps, who, 'catalogue.read');
  const c = found(await deps.db.combo.findFirst({ where: { id: comboId, storeId: who.storeId }, select: { id: true, setPriceMinor: true, items: { select: { productId: true, fixedVariantId: true, quantity: true } } } }), 'combo');
  const variantIds = c.items.flatMap((i) => (i.fixedVariantId ? [i.fixedVariantId] : []));
  const productIds = c.items.flatMap((i) => (!i.fixedVariantId && i.productId ? [i.productId] : []));
  const [variants, products] = await Promise.all([
    deps.db.productVariant.findMany({ where: { storeId: who.storeId, id: { in: variantIds } }, select: { id: true, priceMinor: true } }),
    deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: productIds } }, select: { id: true, minPriceMinor: true } }),
  ]);
  const pieces = c.items.map((i) => ({
    quantity: i.quantity,
    priceMinor: i.fixedVariantId ? (variants.find((v) => v.id === i.fixedVariantId)?.priceMinor ?? null) : i.productId ? (products.find((p) => p.id === i.productId)?.minPriceMinor ?? null) : null,
  }));
  return { comboId: c.id, setPriceMinor: c.setPriceMinor, ...comboWasFor(c.setPriceMinor, pieces) };
}

// ---------------------------------------------------------------------------------------------------------------
// Choosing the source (the owner's decision: needs catalogue.prices)
// ---------------------------------------------------------------------------------------------------------------

export interface CategorySourceRow {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  parentId: string | null;
  /** Its own choice; null = follows its parent (or the store). */
  own: WasPriceSource | null;
  effective: SourceChoice;
}

export async function wasPriceSources(deps: CatalogueDeps, who: Who): Promise<{ store: WasPriceSource | null; categories: CategorySourceRow[] }> {
  await allow(deps, who, 'catalogue.read');
  const [store, cats] = await Promise.all([
    setting(deps, who, 'catalogue.wasPrice.defaultSource'),
    deps.db.category.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: { id: true, slug: true, nameEn: true, nameBn: true, parentId: true, wasPriceSource: true }, orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }] }),
  ]);
  const by = new Map(cats.map((c) => [c.id, c]));
  const effective = (id: string): SourceChoice => {
    for (let cur = by.get(id), guard = 0; cur && guard < 64; cur = cur.parentId ? by.get(cur.parentId) : undefined, guard++) {
      if (cur.wasPriceSource) return { source: cur.wasPriceSource, from: 'category', categoryId: cur.id };
    }
    return store ? { source: store, from: 'store', categoryId: null } : { source: null, from: 'none', categoryId: null };
  };
  return { store, categories: cats.map((c) => ({ id: c.id, slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, parentId: c.parentId, own: c.wasPriceSource, effective: effective(c.id) })) };
}

export const wasPriceSourceInput = z
  .object({ categoryId: z.uuid().optional(), productId: z.uuid().optional(), source: wasPriceSourceSchema.nullable() })
  .strict()
  .refine((v) => Boolean(v.categoryId) !== Boolean(v.productId), { message: 'a category or a product' });
export type WasPriceSourceInput = z.input<typeof wasPriceSourceInput>;

/** Sets (or clears, to follow the level above) the source of a category or a product. */
export async function setWasPriceSource(deps: CatalogueDeps, who: Who, input: WasPriceSourceInput): Promise<SourceChoice> {
  await allow(deps, who, 'catalogue.prices');
  const d = parse(wasPriceSourceInput, input, '"was" price source');
  await deps.db.$transaction(async (tx) => {
    if (d.categoryId) {
      const c = found(await tx.category.findFirst({ where: { id: d.categoryId, storeId: who.storeId }, select: { id: true, wasPriceSource: true, archivedAt: true } }), 'category');
      if (c.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the category is archived', ['categoryId']);
      if (c.wasPriceSource === d.source) return;
      await tx.category.update({ where: { id: c.id }, data: { wasPriceSource: d.source } });
      await logChange(tx, who, 'category.wasPriceSource', 'Category', c.id, { wasPriceSource: c.wasPriceSource }, { wasPriceSource: d.source });
    } else {
      const p = found(await tx.product.findFirst({ where: { id: d.productId, storeId: who.storeId }, select: { id: true, wasPriceSource: true } }), 'product');
      if (p.wasPriceSource === d.source) return;
      await tx.product.update({ where: { id: p.id }, data: { wasPriceSource: d.source } });
      await logChange(tx, who, 'product.wasPriceSource', 'Product', p.id, { wasPriceSource: p.wasPriceSource }, { wasPriceSource: d.source });
    }
  }, TX);
  if (d.productId) {
    const p = await deps.db.product.findFirstOrThrow({ where: { id: d.productId, storeId: who.storeId }, select: { wasPriceSource: true, categoryId: true } });
    return sourceFor(deps, who, p);
  }
  const row = (await wasPriceSources(deps, who)).categories.find((c) => c.id === d.categoryId);
  return row ? row.effective : { source: null, from: 'none', categoryId: null };
}
