// PR 725 (CN-049, the owner's decision of 15 Nov 2026) — one switch shows or hides the whole practice shop.
// Practice products are PUBLISHED while practice mode is on and DRAFT while it is off. The shop already shows only PUBLISHED
// products (product page, category listing, search index, sitemaps, collections, the bag), so flipping the one status
// hides or shows every practice product everywhere with no per-screen rule. The same switch moves the practice combos
// (RUNNING / DRAFT) and journal posts (PUBLISHED / UNPUBLISHED), and the categories the practice products needed (visible
// while on; hidden again when off, unless a real product is in them). Nothing is deleted: "off" only changes the status,
// "on" changes it back. The search index follows by itself (the product's change time moves, the planner re-indexes) and
// the page cache is told once. A practice product the owner archived himself is left alone.
import type { PrismaClient } from '@extas/db/client';
import { emitCacheEvent } from '@extas/cache';
import { DEMO_PACK, PRACTICE_SLUG } from './data';

type Db = Pick<PrismaClient, 'product' | 'combo' | 'blogPost' | 'category'>;

export interface VisibilityResult {
  /** Products made live now. */
  shown: number;
  /** Products taken off the shop now. */
  hidden: number;
}

const own = { startsWith: PRACTICE_SLUG } as const;

/** How many practice rows (products, combos, posts) are not in the state practice mode asks for (0 = nothing to do; cheap counts). */
export async function practiceVisibilityDrift(db: Db, storeId: number, on: boolean): Promise<number> {
  const [p, c, b] = await Promise.all([
    db.product.count({ where: { storeId, isPractice: true, archivedAt: null, ...(on ? { status: { not: 'PUBLISHED' as const } } : { status: 'PUBLISHED' as const }) } }),
    db.combo.count({ where: { storeId, slug: own, archivedAt: null, status: on ? ('DRAFT' as const) : ('RUNNING' as const) } }),
    db.blogPost.count({ where: { storeId, slug: own, archivedAt: null, status: on ? ('UNPUBLISHED' as const) : ('PUBLISHED' as const) } }),
  ]);
  return p + c + b;
}

/** The categories the practice products sit in follow the switch: shown while on; hidden again while off when no real product is in them. */
async function syncCategories(db: Db, storeId: number, on: boolean): Promise<void> {
  const shown = DEMO_PACK.categories.filter((c) => !c.hidden).map((c) => c.slug);
  const used = (await db.product.findMany({ where: { storeId, isPractice: true, categoryId: { not: null } }, select: { categoryId: true }, distinct: ['categoryId'] })).map((r) => r.categoryId!);
  if (!used.length) return;
  if (on) {
    await db.category.updateMany({ where: { storeId, id: { in: used }, slug: { in: shown }, isVisible: false, archivedAt: null }, data: { isVisible: true } });
    return;
  }
  await db.category.updateMany({ where: { storeId, id: { in: used }, slug: { in: shown }, isVisible: true, products: { none: { isPractice: false, archivedAt: null } } }, data: { isVisible: false } });
}

/** Brings every practice product, combo and post to the state of the switch. Safe to run again at any time. */
export async function syncPracticeVisibility(db: Db, storeId: number, on: boolean, now: Date = new Date()): Promise<VisibilityResult> {
  if (!(await practiceVisibilityDrift(db, storeId, on))) return { shown: 0, hidden: 0 };
  const r = { shown: 0, hidden: 0 };
  if (on) {
    r.shown = (await db.product.updateMany({ where: { storeId, isPractice: true, archivedAt: null, status: { not: 'PUBLISHED' } }, data: { status: 'PUBLISHED', publishedAt: now, unpublishedAt: null } })).count;
    await db.combo.updateMany({ where: { storeId, slug: own, archivedAt: null, status: 'DRAFT' }, data: { status: 'RUNNING' } });
    await db.blogPost.updateMany({ where: { storeId, slug: own, archivedAt: null, status: 'UNPUBLISHED' }, data: { status: 'PUBLISHED' } });
  } else {
    r.hidden = (await db.product.updateMany({ where: { storeId, isPractice: true, archivedAt: null, status: 'PUBLISHED' }, data: { status: 'DRAFT', unpublishedAt: now } })).count;
    await db.combo.updateMany({ where: { storeId, slug: own, archivedAt: null, status: 'RUNNING' }, data: { status: 'DRAFT' } });
    await db.blogPost.updateMany({ where: { storeId, slug: own, archivedAt: null, status: 'PUBLISHED' }, data: { status: 'UNPUBLISHED' } });
  }
  await syncCategories(db, storeId, on);
  emitCacheEvent({ kind: 'all', storeId });
  return r;
}
