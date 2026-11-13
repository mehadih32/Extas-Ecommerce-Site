// S28 · PR 686 — the shop-ranking run (@extas/catalogue `updateRankScores`): each live store gets one `catalogue.ranking.run` a
// night; the day is the run key. The run writes every live product's score (a preview) and, only while the owner's
// `shop.ranking` setting has "autoApply" on, puts the new order on the shop. It never changes a price, a stock figure or a page.
// This module imports `./keys`, never `./scheduler`.
import { updateRankScores } from '@extas/catalogue';
import { bGradeClosed, sellableUnits } from '@extas/inventory';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const RANKING_JOB = 'catalogue.ranking.run';
export const RANKING_QUEUE = 'catalogue';

/** One run a night. */
const SLOT_MS = 86_400_000;

const levels = {
  select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } },
} as const;

/** The pieces that can be sold now of each variant, counted as the product page counts them (the same rule as the shop's reader). */
function sellableOf(deps: JobDeps, storeId: number) {
  return async (variantIds: string[]): Promise<Map<string, number>> => {
    const ids = [...new Set(variantIds)];
    if (!ids.length) return new Map();
    const [kinds, closed, rows] = await Promise.all([
      deps.settings.value('inventory.sellableLocationKinds', { storeId }),
      bGradeClosed({ settings: deps.settings }, storeId),
      deps.db.productVariant.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, inStock: true, grade: true, stockLevels: levels } }),
    ]);
    const k = new Set(kinds);
    return new Map(rows.map((v) => [v.id, v.inStock && !(closed && v.grade === 'B') ? sellableUnits(v.stockLevels, k) : 0]));
  };
}

/** One store's run. */
export function runRankingJob(deps: JobDeps, storeId: number): Promise<{ products: number; changed: number; applied: boolean }> {
  return updateRankScores({ db: deps.db, settings: deps.settings, sellable: sellableOf(deps, storeId), ...(deps.now ? { now: deps.now } : {}) }, storeId);
}

/** Each live store: one run a day. */
export const rankingPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  return stores.map((s) => {
    const payload = { storeId: s.id };
    return { queue: RANKING_QUEUE, name: RANKING_JOB, payload, key: runKey(RANKING_JOB, payload, slotOf(now.getTime(), SLOT_MS)) };
  });
};
