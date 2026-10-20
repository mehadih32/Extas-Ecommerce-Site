// PR 21 — what the product admin screens read (demo 90-admin-catalog.js: the product list with its counters, search and
// category chips; the stock per variant in the edit form). Read-only: every change goes through the services
// (products.ts, variants.ts, naming.ts, publish.ts). Stock is shown, never typed here: it comes from the ERP (S09).
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, type CatalogueDeps, type Db, type Who } from './context';
import { categoryTree, flatten } from './categories';
import { readStoredHealth, type PublishCheckKey } from './health';

export const ADMIN_STATUS_FILTERS = ['live', 'ready', 'draft', 'off', 'archived'] as const;
export type AdminStatusFilter = (typeof ADMIN_STATUS_FILTERS)[number];
const STATUS_OF: Record<Exclude<AdminStatusFilter, 'archived'>, Prisma.ProductWhereInput['status']> = {
  live: 'PUBLISHED',
  ready: 'READY_TO_PUBLISH',
  draft: 'DRAFT',
  off: 'UNPUBLISHED',
};

export const adminListQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(ADMIN_STATUS_FILTERS).optional(),
    categoryId: z.uuid().optional(),
    page: z.int().min(1).optional(),
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
  const [pageSize, lowPieces] = await Promise.all([setting(deps, who, 'catalogue.admin.pageSize'), setting(deps, who, 'catalogue.admin.lowStockPieces')]);
  const db = deps.db;
  const storeId = who.storeId;
  const q = d.q;
  const where: Prisma.ProductWhereInput = {
    storeId,
    ...(d.status === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(d.status && d.status !== 'archived' ? { status: STATUS_OF[d.status] } : {}),
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
  const [rows, total, tree] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        colours: { where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { colour: { select: { hex: true, nameEn: true, nameBn: true } } } },
        variants: { where: { archivedAt: null }, select: { id: true, size: { select: { label: true, sortOrder: true } } } },
      },
    }),
    db.product.count({ where }),
    categoryTree(deps, who),
  ]);
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
  const live = { storeId, archivedAt: null } as const;
  const [all, byStatus, byCategory, health, allStock] = await Promise.all([
    db.product.count({ where: live }),
    db.product.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
    db.product.groupBy({ by: ['categoryId'], where: live, _count: { _all: true } }),
    db.product.findMany({ where: live, select: { healthIssues: true } }),
    db.stockLevel.groupBy({ by: ['variantId'], where: { variant: { storeId, archivedAt: null, product: { archivedAt: null } } }, _sum: { available: true } }),
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
