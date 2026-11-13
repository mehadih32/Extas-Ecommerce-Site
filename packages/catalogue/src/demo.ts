// S28 · PR 684 — demo (sample) products: generic samples that fill the categories while real products arrive. They are
// real `Product` rows with `isDemo` set, so every shop page draws them like any product, but they are never for sale
// (the bag refuses them with a "coming soon" pop-up), and the places that tell the outside world about products (the
// sitemaps, the Merchant feed, search and AI files) and the places that count (stock, reports, finance, the ERP) leave
// them out. Whether they show is `catalogue.demo` (off as shipped): the master switch, a switch per category (a
// category's branch goes with it), and "hide by itself" once a category has enough real products. Showing or hiding is
// the product's status (PUBLISHED / UNPUBLISHED), set by `reconcileDemo` whenever the switches change or a real product
// is published. Nothing is deleted. Reading needs `catalogue.read`; every change `catalogue.write`; audited.
import { emitCacheEvent } from '@extas/cache/events';
import { CatalogueError } from './errors';
import { allow, logChange, setting, type CatalogueDeps, type Who } from './context';
import { demoShowsIn, type DemoCategory } from './demo-pick';

export { demoShowsIn, ancestorsOf, realInBranch, type DemoCategory, type DemoRule } from './demo-pick';

export interface DemoCategoryRow {
  id: string;
  parentId: string | null;
  nameEn: string;
  nameBn: string | null;
  demo: number;
  real: number;
  /** Not turned off by hand (its own switch). */
  switchOn: boolean;
  /** Its demo products show in the shop now. */
  showing: boolean;
}

export interface DemoView {
  on: boolean;
  categories: DemoCategoryRow[];
  demoTotal: number;
  showingTotal: number;
  /** Categories with no real product yet. */
  emptyCategories: number;
}

async function snapshot(deps: CatalogueDeps, who: Who) {
  const [cats, demo, real] = await Promise.all([
    deps.db.category.findMany({
      where: { storeId: who.storeId, archivedAt: null },
      select: { id: true, parentId: true, nameEn: true, nameBn: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    }),
    deps.db.product.groupBy({ by: ['categoryId'], where: { storeId: who.storeId, isDemo: true, archivedAt: null }, _count: { _all: true } }),
    deps.db.product.groupBy({ by: ['categoryId'], where: { storeId: who.storeId, isDemo: false, status: 'PUBLISHED', archivedAt: null }, _count: { _all: true } }),
  ]);
  const demoBy = new Map(demo.filter((r) => r.categoryId).map((r) => [r.categoryId as string, r._count._all]));
  const realBy = new Map(real.filter((r) => r.categoryId).map((r) => [r.categoryId as string, r._count._all]));
  return { cats, demoBy, realBy };
}

export async function demoView(deps: CatalogueDeps, who: Who): Promise<DemoView> {
  await allow(deps, who, 'catalogue.read');
  const set = await setting(deps, who, 'catalogue.demo');
  const { cats, demoBy, realBy } = await snapshot(deps, who);
  const tree: DemoCategory[] = cats.map((c) => ({ id: c.id, parentId: c.parentId }));
  const rows: DemoCategoryRow[] = cats.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    nameEn: c.nameEn,
    nameBn: c.nameBn,
    demo: demoBy.get(c.id) ?? 0,
    real: realBy.get(c.id) ?? 0,
    switchOn: !set.off.includes(c.id),
    showing: (demoBy.get(c.id) ?? 0) > 0 && demoShowsIn(set, tree, realBy, c.id),
  }));
  return {
    on: set.on,
    categories: rows,
    demoTotal: rows.reduce((a, r) => a + r.demo, 0),
    showingTotal: rows.reduce((a, r) => a + (r.showing ? r.demo : 0), 0),
    emptyCategories: rows.filter((r) => r.real === 0).length,
  };
}

/** Shows or hides every demo product to match the switches. Returns how many changed. */
export async function reconcileDemo(deps: CatalogueDeps, who: Who): Promise<{ shown: number; hidden: number }> {
  await allow(deps, who, 'catalogue.write');
  return reconcileDemoCore(deps, who);
}

/** The same without the permission check: a publisher publishing a real product may make demo products give way. */
export async function reconcileDemoCore(deps: CatalogueDeps, who: Who): Promise<{ shown: number; hidden: number }> {
  const set = await setting(deps, who, 'catalogue.demo');
  const { cats, realBy } = await snapshot(deps, who);
  const tree: DemoCategory[] = cats.map((c) => ({ id: c.id, parentId: c.parentId }));
  const now = deps.now?.() ?? new Date();
  const products = await deps.db.product.findMany({ where: { storeId: who.storeId, isDemo: true, archivedAt: null }, select: { id: true, status: true, categoryId: true } });
  const show: string[] = [];
  const hide: string[] = [];
  for (const p of products) {
    const want = demoShowsIn(set, tree, realBy, p.categoryId);
    if (want && p.status !== 'PUBLISHED') show.push(p.id);
    if (!want && p.status === 'PUBLISHED') hide.push(p.id);
  }
  if (!show.length && !hide.length) return { shown: 0, hidden: 0 };
  await deps.db.$transaction(async (tx) => {
    if (show.length) {
      await tx.product.updateMany({ where: { id: { in: show }, storeId: who.storeId }, data: { status: 'PUBLISHED', publishedAt: now, unpublishedAt: null } });
      await tx.categoryProduct.updateMany({ where: { storeId: who.storeId, productId: { in: show } }, data: { isVisible: true } });
    }
    if (hide.length) {
      await tx.product.updateMany({ where: { id: { in: hide }, storeId: who.storeId }, data: { status: 'UNPUBLISHED', unpublishedAt: now } });
      await tx.categoryProduct.updateMany({ where: { storeId: who.storeId, productId: { in: hide } }, data: { isVisible: false } });
    }
    await logChange(tx, who, 'demo.reconcile', 'Product', 'demo', null, { shown: show.length, hidden: hide.length });
  });
  emitCacheEvent({ kind: 'product', storeId: who.storeId, productIds: [...show, ...hide], reason: 'publish' });
  return { shown: show.length, hidden: hide.length };
}

const LIMIT_SIZES = 4; // hardcode-ok: the size columns a demo product gets, a display limit not a business rule

/** Makes sample products: one for every category that has none yet (or just one category). Hidden until the switches show them. */
export async function seedDemoProducts(deps: CatalogueDeps, who: Who, input: { categoryId?: string | null } = {}): Promise<{ made: number }> {
  await allow(deps, who, 'catalogue.write');
  const set = await setting(deps, who, 'catalogue.demo');
  const [colour, sizes, cats, have] = await Promise.all([
    deps.db.colour.findFirst({ where: { storeId: who.storeId, archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
    deps.db.size.findMany({
      where: { storeId: who.storeId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      take: LIMIT_SIZES,
      select: { id: true, key: true },
    }),
    deps.db.category.findMany({
      where: { storeId: who.storeId, archivedAt: null, ...(input.categoryId ? { id: input.categoryId } : {}) },
      select: { id: true, slug: true, nameEn: true, nameBn: true },
      take: 200,
    }),
    deps.db.product.groupBy({ by: ['categoryId'], where: { storeId: who.storeId, isDemo: true }, _count: { _all: true } }),
  ]);
  if (input.categoryId && !cats.length) throw new CatalogueError('NOT_FOUND', 'no such category');
  if (!colour || !sizes.length) throw new CatalogueError('CONFLICT', 'the shop needs a colour and a size first', ['NO_COLOUR_OR_SIZE']);
  const done = new Set(have.map((h) => h.categoryId));
  const todo = cats.filter((c) => !done.has(c.id));
  let made = 0;
  for (const c of todo) {
    await deps.db.$transaction(async (tx) => {
      const slug = `demo-${c.slug}`.slice(0, 80);
      if (await tx.product.findFirst({ where: { storeId: who.storeId, slug }, select: { id: true } })) return;
      const p = await tx.product.create({
        data: {
          storeId: who.storeId,
          categoryId: c.id,
          slug,
          nameEn: `Sample ${c.nameEn}`,
          nameBn: `নমুনা ${c.nameBn ?? c.nameEn}`,
          descriptionEn: 'A sample product that keeps this category from looking empty. It is not for sale.',
          descriptionBn: 'এটা একটা নমুনা প্রোডাক্ট, যাতে ক্যাটাগরিটা ফাঁকা না দেখায়। এটা বিক্রির জন্য নয়।',
          status: 'UNPUBLISHED',
          isDemo: true,
          inStock: true,
          minPriceMinor: set.samplePriceMinor,
        },
        select: { id: true },
      });
      await tx.productColour.create({ data: { storeId: who.storeId, productId: p.id, colourId: colour.id, sortOrder: 0 } });
      for (const [i, z] of sizes.entries()) {
        await tx.productVariant.create({
          data: {
            storeId: who.storeId,
            productId: p.id,
            colourId: colour.id,
            sizeId: z.id,
            sku: `DEMO-${c.slug}-${z.key}`.slice(0, 80),
            priceMinor: set.samplePriceMinor,
            active: true,
            inStock: true,
            sortOrder: i,
          },
        });
      }
      await tx.categoryProduct.create({ data: { storeId: who.storeId, categoryId: c.id, productId: p.id, isVisible: true, inStock: true, priceMinor: set.samplePriceMinor } });
      await logChange(tx, who, 'demo.seed', 'Product', p.id, null, { categoryId: c.id });
      made += 1;
    });
  }
  return { made };
}

/** Turns a demo product into an ordinary draft the owner finishes (name, price, photos). Never leaves a sample price live. */
export async function demoToDraft(deps: CatalogueDeps, who: Who, productId: string): Promise<void> {
  await allow(deps, who, 'catalogue.write');
  const p = await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId, isDemo: true }, select: { id: true, status: true } });
  if (!p) throw new CatalogueError('NOT_FOUND', 'no such demo product');
  await deps.db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: p.id }, data: { isDemo: false, status: 'DRAFT', inStock: false } });
    await tx.productVariant.updateMany({ where: { productId: p.id, storeId: who.storeId }, data: { active: false, inStock: false } });
    await logChange(tx, who, 'demo.toDraft', 'Product', p.id, { isDemo: true, status: p.status }, { isDemo: false, status: 'DRAFT' });
  });
}
