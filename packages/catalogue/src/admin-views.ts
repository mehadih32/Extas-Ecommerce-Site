// PR 21 — what the product admin screens read (demo 90-admin-catalog.js: the product list with its counters, search and
// category chips; the stock per variant in the edit form). Read-only: every change goes through the services
// (products.ts, variants.ts, naming.ts, publish.ts). Stock is shown, never typed here: it comes from the ERP (S09).
import { SOLD_STATUS } from './ranking';
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, type CatalogueDeps, type Db, type Who } from './context';
import { categoryTree, flatten } from './categories';
import { readStoredHealth, type PublishCheckKey } from './health';

// PR 784 (admin prototype v5 parity): `scheduled` (ready to go live at a later time) joins the filters; `draft` also holds the
// ready-to-publish ones that are not scheduled (the prototype's Draft chip), `ready` stays for old links.
export const ADMIN_STATUS_FILTERS = ['live', 'ready', 'draft', 'off', 'archived', 'scheduled'] as const;
export type AdminStatusFilter = (typeof ADMIN_STATUS_FILTERS)[number];
const STATUS_OF: Record<Exclude<AdminStatusFilter, 'archived' | 'draft' | 'scheduled'>, Prisma.ProductWhereInput['status']> = {
  live: 'PUBLISHED',
  ready: 'READY_TO_PUBLISH',
  off: 'UNPUBLISHED',
};

export const adminListQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(ADMIN_STATUS_FILTERS).optional(),
    categoryId: z.uuid().optional(),
    page: z.int().min(1).optional(),
    /** PR 722 (prototype "Sort: best selling"): `best` = pieces sold in the last 30 days, most first; else newest first. */
    sort: z.enum(['new', 'best', 'margin', 'stock']).optional(),
  })
  .strict();
export type AdminListQuery = z.input<typeof adminListQuery>;

export interface AdminProductRow {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  archived: boolean;
  categoryPathEn: string[];
  categoryPathBn: string[];
  colours: { hex: string; nameEn: string; nameBn: string | null }[];
  /** Size labels of the live variants, smallest first. */
  sizes: string[];
  variants: number;
  fromPriceMinor: number | null;
  stockPieces: number;
  healthScore: number;
  /** Failing checks from the last check (blocking first); null = never checked. */
  issues: { key: PublishCheckKey; level: 'block' | 'warn' }[] | null;
  /** The photo to show: the primary photo, else a front photo, else the first. */
  thumbAssetId: string | null;
}

export interface AdminProductList {
  items: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: { products: number; categories: number; live: number; ready: number; needPhotos: number; lowStockSizes: number };
  categories: { id: string; nameEn: string; nameBn: string | null; products: number }[];
}

/** Available pieces per variant (all locations). */
export async function stockByVariant(db: Db, storeId: number, variantIds: string[]): Promise<Map<string, number>> {
  if (!variantIds.length) return new Map();
  const rows = await db.stockLevel.groupBy({ by: ['variantId'], where: { variantId: { in: variantIds }, variant: { storeId } }, _sum: { available: true } });
  return new Map(rows.map((r) => [r.variantId, Math.max(0, r._sum.available ?? 0)]));
}

/** Stock per variant of one product, for the edit form. */
export async function productStock(deps: CatalogueDeps, who: Who, productId: string): Promise<Record<string, number>> {
  await allow(deps, who, 'catalogue.read');
  const ids = (await deps.db.productVariant.findMany({ where: { storeId: who.storeId, productId }, select: { id: true } })).map((v) => v.id);
  return Object.fromEntries(await stockByVariant(deps.db, who.storeId, ids));
}

export async function adminProductList(deps: CatalogueDeps, who: Who, query: AdminListQuery = {}): Promise<AdminProductList> {
  await allow(deps, who, 'catalogue.read');
  const d = parse(adminListQuery, query, 'product list');
  const [pageSize, lowPieces, practice] = await Promise.all([setting(deps, who, 'catalogue.admin.pageSize'), setting(deps, who, 'catalogue.admin.lowStockPieces'), setting(deps, who, 'practice.enabled')]);
  const db = deps.db;
  const storeId = who.storeId;
  const q = d.q;
  const nowAt = (deps.now ?? (() => new Date()))();
  // PR 725: with practice mode off, practice products are in no list and no counter (they are kept, not deleted)
  const hidePractice = practice.on ? {} : { isPractice: false };
  const where: Prisma.ProductWhereInput = {
    storeId,
    ...hidePractice,
    ...(d.status === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(d.status && d.status !== 'archived' && d.status !== 'draft' && d.status !== 'scheduled' ? { status: STATUS_OF[d.status] } : {}),
    ...(d.status === 'scheduled' ? { status: 'READY_TO_PUBLISH' as const, publishedAt: { gt: nowAt } } : {}),
    ...(d.status === 'draft' ? { status: { in: ['DRAFT', 'READY_TO_PUBLISH'] as ('DRAFT' | 'READY_TO_PUBLISH')[] }, AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: nowAt } }] }] } : {}),
    ...(d.categoryId ? { categoryId: d.categoryId } : {}),
    ...(q
      ? {
          OR: [
            { nameEn: { contains: q, mode: 'insensitive' } },
            { nameBn: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q.toLowerCase() } },
            { erpStyleCode: { contains: q, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
            { category: { OR: [{ nameEn: { contains: q, mode: 'insensitive' } }, { nameBn: { contains: q, mode: 'insensitive' } }] } },
            { colours: { some: { archivedAt: null, colour: { OR: [{ nameEn: { contains: q, mode: 'insensitive' } }, { nameBn: { contains: q, mode: 'insensitive' } }, { synonyms: { has: q.toLowerCase() } }] } } } },
          ],
        }
      : {}),
  };
  const page = d.page ?? 1;
  // PR 722: best selling — order every matching product by its pieces sold in 30 days, then take this page's ids.
  let bestIds: string[] | null = null;
  if (d.sort === 'best' || d.sort === 'margin' || d.sort === 'stock') {
    const since = new Date(nowAt.getTime() - 30 * 86_400_000);
    const all = await db.product.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    let score = new Map<string, number>();
    let dir = -1;
    if (d.sort === 'best') {
      const sold = await db.orderItem.groupBy({ by: ['productId'], where: { storeId, productId: { not: null }, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } }, _sum: { quantity: true } });
      score = new Map(sold.map((r) => [r.productId as string, r._sum.quantity ?? 0]));
    } else if (d.sort === 'stock') {
      // PR 784 (prototype "Sort: stock (low first)"): the pieces on hand, fewest first
      const vs = await db.productVariant.findMany({ where: { storeId, archivedAt: null, productId: { in: all.map((r) => r.id) } }, select: { id: true, productId: true } });
      const st = await stockByVariant(db, storeId, vs.map((v) => v.id));
      for (const v of vs) score.set(v.productId, (score.get(v.productId) ?? 0) + (st.get(v.id) ?? 0));
      dir = 1;
    } else {
      // PR 784 (prototype "Sort: margin"): the average margin of its sizes (price against the ERP buying price), highest first
      const vs = await db.productVariant.findMany({ where: { storeId, archivedAt: null, productId: { in: all.map((r) => r.id) }, priceMinor: { gt: 0 }, shopPriceMinor: { gt: 0 } }, select: { productId: true, priceMinor: true, shopPriceMinor: true } });
      const acc = new Map<string, number[]>();
      for (const v of vs) acc.set(v.productId, [...(acc.get(v.productId) ?? []), ((v.priceMinor! - v.shopPriceMinor!) / v.priceMinor!) * 100]);
      for (const [id, xs] of acc) score.set(id, xs.reduce((x, y) => x + y, 0) / xs.length);
    }
    bestIds = all
      .map((r, i) => ({ id: r.id, n: score.get(r.id) ?? (dir === 1 ? Number.MAX_SAFE_INTEGER : -1), i }))
      .sort((x, y) => (x.n === y.n ? x.i - y.i : dir === -1 ? y.n - x.n : x.n - y.n))
      .slice((page - 1) * pageSize, page * pageSize)
      .map((r) => r.id);
  }
  const [rows0, total, tree] = await Promise.all([
    db.product.findMany({
      where: bestIds ? { storeId, id: { in: bestIds } } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(bestIds ? {} : { take: pageSize, skip: (page - 1) * pageSize }),
      include: {
        colours: { where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { colour: { select: { hex: true, nameEn: true, nameBn: true } } } },
        variants: { where: { archivedAt: null }, select: { id: true, size: { select: { label: true, sortOrder: true } } } },
      },
    }),
    db.product.count({ where }),
    categoryTree(deps, who),
  ]);
  const rows = bestIds ? [...rows0].sort((a, b) => bestIds!.indexOf(a.id) - bestIds!.indexOf(b.id)) : rows0;
  const nodes = new Map(flatten(tree).map((n) => [n.id, n]));

  const ids = rows.map((r) => r.id);
  const photos = ids.length
    ? await db.productMedia.findMany({
        where: { storeId, productId: { in: ids }, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { productId: true, assetId: true, role: true, isPrimary: true },
      })
    : [];
  const thumb = new Map<string, string>();
  for (const pass of [(p: (typeof photos)[number]) => p.isPrimary, (p: (typeof photos)[number]) => p.role === 'FRONT', () => true]) {
    for (const p of photos) if (!thumb.has(p.productId) && pass(p)) thumb.set(p.productId, p.assetId);
  }
  const stock = await stockByVariant(db, storeId, rows.flatMap((r) => r.variants.map((v) => v.id)));

  const items: AdminProductRow[] = rows.map((r) => {
    const n = r.categoryId ? nodes.get(r.categoryId) : undefined;
    const sizes = [...new Map(r.variants.filter((v) => v.size).map((v) => [v.size!.label, v.size!.sortOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
    const h = readStoredHealth(r.healthIssues);
    const issues = h ? h.checks.filter((c) => !c.ok).sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1)).map((c) => ({ key: c.key, level: c.level })) : null;
    return {
      id: r.id,
      slug: r.slug,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      status: r.status,
      archived: r.archivedAt != null,
      categoryPathEn: n?.pathEn ?? [],
      categoryPathBn: n?.pathBn ?? [],
      colours: r.colours.map((c) => c.colour),
      sizes,
      variants: r.variants.length,
      fromPriceMinor: r.minPriceMinor,
      stockPieces: r.variants.reduce((s, v) => s + (stock.get(v.id) ?? 0), 0),
      healthScore: r.healthScore,
      issues,
      thumbAssetId: thumb.get(r.id) ?? null,
    };
  });

  // The counters cover the whole store (not just the page), like the demo's.
  const live = { storeId, archivedAt: null, ...hidePractice } as const;
  const [all, byStatus, byCategory, health, allStock] = await Promise.all([
    db.product.count({ where: live }),
    db.product.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
    db.product.groupBy({ by: ['categoryId'], where: live, _count: { _all: true } }),
    db.product.findMany({ where: live, select: { healthIssues: true } }),
    db.stockLevel.groupBy({ by: ['variantId'], where: { variant: { storeId, archivedAt: null, product: { archivedAt: null, ...hidePractice } } }, _sum: { available: true } }),
  ]);
  const status = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const needPhotos = health.filter((h) => readStoredHealth(h.healthIssues)?.checks.some((c) => c.key === 'photos' && !c.ok)).length;
  const lowStockSizes = allStock.filter((s) => (s._sum.available ?? 0) > 0 && (s._sum.available ?? 0) <= lowPieces).length;
  const categories = byCategory
    .filter((c) => c.categoryId && nodes.has(c.categoryId))
    .map((c) => {
      const node = nodes.get(c.categoryId!)!;
      return { id: node.id, nameEn: node.nameEn, nameBn: node.nameBn, products: c._count._all, order: [...nodes.keys()].indexOf(node.id) };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...c }) => c);
  return {
    items,
    total,
    page,
    pageSize,
    counts: { products: all, categories: categories.length, live: status('PUBLISHED'), ready: status('READY_TO_PUBLISH'), needPhotos, lowStockSizes },
    categories,
  };
}

export { suggestSku } from './sku';
