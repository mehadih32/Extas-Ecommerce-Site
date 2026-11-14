// PR 725 (CN-049, the owner's decision of 15 Nov 2026) — one switch shows or hides the whole practice shop.
// Practice products are PUBLISHED while practice mode is on and DRAFT while it is off. The shop already shows only PUBLISHED
// products (product page, category listing, search index, sitemaps, collections, the bag), so flipping the one status
// hides or shows every practice product everywhere with no per-screen rule. Nothing is deleted: "off" only changes the
// status, "on" changes it back. The search index follows by itself (the product's change time moves, the planner re-indexes)
// and the page cache is told once. A practice product the owner archived himself is left alone.
import type { PrismaClient } from '@extas/db/client';
import { emitCacheEvent } from '@extas/cache';

type Db = Pick<PrismaClient, 'product'>;

export interface VisibilityResult {
  /** Products made live now. */
  shown: number;
  /** Products taken off the shop now. */
  hidden: number;
}

/** How many practice products are not in the state practice mode asks for (0 = nothing to do; one cheap, indexed count). */
export async function practiceVisibilityDrift(db: Db, storeId: number, on: boolean): Promise<number> {
  return db.product.count({
    where: { storeId, isPractice: true, archivedAt: null, ...(on ? { status: { not: 'PUBLISHED' } } : { status: 'PUBLISHED' }) },
  });
}

/** Brings every practice product to the state of the switch. Safe to run again at any time. */
export async function syncPracticeVisibility(db: Db, storeId: number, on: boolean, now: Date = new Date()): Promise<VisibilityResult> {
  if (!(await practiceVisibilityDrift(db, storeId, on))) return { shown: 0, hidden: 0 };
  const r = on
    ? { shown: (await db.product.updateMany({ where: { storeId, isPractice: true, archivedAt: null, status: { not: 'PUBLISHED' } }, data: { status: 'PUBLISHED', publishedAt: now, unpublishedAt: null } })).count, hidden: 0 }
    : { shown: 0, hidden: (await db.product.updateMany({ where: { storeId, isPractice: true, archivedAt: null, status: 'PUBLISHED' }, data: { status: 'DRAFT', unpublishedAt: now } })).count };
  if (r.shown || r.hidden) emitCacheEvent({ kind: 'all', storeId });
  return r;
}
