// The inventory's background work, shaped as jobs a BullMQ worker (PR 6) calls with a small JSON payload. Until that
// worker exists the same functions run inline (tests, a manual re-sync, PR 206).
//
// - `inventory.erp.pullStock` {storeId, full?} — the stock pull (PR 195).
// - `inventory.locations.ensureDefaults` — default locations and the damaged bin on every warehouse (PR 201).
// - `stockPollPlan` tells the scheduler how often to pull and for which stores: every store whose ERP mode is not
//   "no ERP", every `erp.sync.stockPollMinutes` (contract: poll `updatedSince` every few minutes).
import type { InventoryDeps } from './context';
import { storesWithErp } from './erp-mode';
import { ensureDefaultLocations } from './locations';
import { pullStock, type StockPullResult } from './stock-pull';

export const INVENTORY_QUEUE = 'inventory';

export type InventoryJob = { name: 'inventory.erp.pullStock'; storeId: number; full?: boolean } | { name: 'inventory.locations.ensureDefaults' };

export type InventoryJobResult = StockPullResult | { created: number; restored: number };

export async function runInventoryJob(deps: InventoryDeps, job: InventoryJob): Promise<InventoryJobResult> {
  switch (job.name) {
    case 'inventory.erp.pullStock':
      return pullStock(deps, { storeId: job.storeId, full: job.full });
    case 'inventory.locations.ensureDefaults':
      return ensureDefaultLocations(deps);
  }
}

export async function stockPollPlan(deps: InventoryDeps): Promise<{ everyMs: number; jobs: InventoryJob[] }> {
  const minutes = await deps.settings.value('erp.sync.stockPollMinutes');
  const stores = await storesWithErp(deps);
  return { everyMs: minutes * 60_000, jobs: stores.map((s) => ({ name: 'inventory.erp.pullStock', storeId: s.storeId })) };
}
