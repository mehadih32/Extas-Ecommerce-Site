// The inventory's background work, shaped as jobs a BullMQ worker (PR 6) calls with a small JSON payload. Until that
// worker exists the same functions run inline (tests, a manual re-sync, PR 206).
//
// - `inventory.erp.pullStock` {storeId, full?} — the stock pull (PR 195).
// - `inventory.locations.ensureDefaults` — default locations and the damaged bin on every warehouse (PR 201).
// - `inventory.reservations.release` — the abandon timer: expired and abandoned holds let go (PR 197/198).
// - `inventory.erp.pushDocuments` {storeId?} — the document relay to the ERP (PR 199/200).
// - `inventory.lowStock.evaluate` — low-stock alerts over every SKU (PR 202), then the shortage cards for every SKU
//   below zero (follow-up 16, shortage.ts).
// - `inventory.erp.reconcile` {storeId} — the full check of the mirror against the ERP (PR 207).
// - `inventory.erp.pullEvents` {storeId} — PR 608: the pull of the ERP's v6 events and courier claims, every
//   `erp.events.pullMinutes` for each store that speaks v6.
// - `inventory.erp.applyEvents` — PR 608: the stored ERP events applied, every `erp.events.applySeconds` while a store
//   speaks v6.
// - `inventory.erp.checkOrders` {storeId} — PR 610: the account and its hold (`GET /account`), the held orders woken
//   when their reason is gone, and the catch-up of open orders from the ERP's own copy (follow-up 490), every
//   `erp.account.checkMinutes` for each store that speaks v6.
// - `inventory.books.checkAccount` {storeId} — PR 615: Retail's ERP account (bills, money events, pipeline, then
//   `GET /account`: lost payments and the hold caught up), every `erp.account.checkMinutes` for each store on v6.
// - `inventory.books.close` {storeId} — PR 616: the nightly books match and day close; looked for every
//   `books.close.checkMinutes`, it runs once a night after the store's `books.close.runAt`.
// - `stockPollPlan` tells the scheduler how often to pull and for which stores: every store whose ERP mode is not
//   "no ERP", every `erp.sync.stockPollMinutes` (contract: poll `updatedSince` every few minutes). `inventorySchedule`
//   is the whole timetable, every interval from settings.
import { SYSTEM } from '@extas/auth';
import type { InventoryDeps } from './context';
import { storesWithErp } from './erp-mode';
import { relayErpPushes, type RelayResult } from './erp-push';
import { applyErpEvents, type ApplyEventsResult } from './erp-events';
import { pullErpEvents, type EventsPullResult } from './erp-events-pull';
import { checkErpOrders, type OrderCheckResult } from './erp-orders-v6';
import { checkErpAccount, type AccountCheckResult } from './erp-account-check';
import { nightlyBooksClose, type BooksRunResult } from './books-match';
import { isV6 } from './erp-model';
import { ensureDefaultLocations } from './locations';
import { evaluateLowStock, type LowStockRun } from './low-stock';
import { evaluateShortages, type ShortageRun } from './shortage';
import { reconcileWithErp, type ReconcileResult } from './movements';
import { sweepReservations, type SweepResult } from './reservations';
import { pullStock, type StockPullResult } from './stock-pull';

export const INVENTORY_QUEUE = 'inventory';

export type InventoryJob =
  | { name: 'inventory.erp.pullStock'; storeId: number; full?: boolean }
  | { name: 'inventory.locations.ensureDefaults' }
  | { name: 'inventory.reservations.release' }
  | { name: 'inventory.erp.pushDocuments'; storeId?: number }
  | { name: 'inventory.lowStock.evaluate' }
  | { name: 'inventory.erp.reconcile'; storeId: number }
  | { name: 'inventory.erp.pullEvents'; storeId: number }
  | { name: 'inventory.erp.applyEvents' }
  | { name: 'inventory.erp.checkOrders'; storeId: number }
  | { name: 'inventory.books.checkAccount'; storeId: number }
  | { name: 'inventory.books.close'; storeId: number };

export type InventoryJobResult = StockPullResult | { created: number; restored: number } | SweepResult | RelayResult | (LowStockRun & { shortage: ShortageRun }) | ReconcileResult | EventsPullResult | ApplyEventsResult | OrderCheckResult | AccountCheckResult | BooksRunResult;

export async function runInventoryJob(deps: InventoryDeps, job: InventoryJob): Promise<InventoryJobResult> {
  switch (job.name) {
    case 'inventory.erp.pullStock':
      return pullStock(deps, { storeId: job.storeId, full: job.full });
    case 'inventory.locations.ensureDefaults':
      return ensureDefaultLocations(deps);
    case 'inventory.reservations.release':
      return sweepReservations(deps);
    case 'inventory.erp.pushDocuments':
      return relayErpPushes(deps, { storeId: job.storeId });
    case 'inventory.lowStock.evaluate': {
      const low = await evaluateLowStock(deps);
      return { ...low, shortage: await evaluateShortages(deps) };
    }
    case 'inventory.erp.reconcile':
      return reconcileWithErp(deps, { actor: SYSTEM, storeId: job.storeId, ctx: { source: 'job' } });
    case 'inventory.erp.pullEvents':
      return pullErpEvents(deps, { storeId: job.storeId });
    case 'inventory.erp.applyEvents':
      return applyErpEvents(deps);
    case 'inventory.erp.checkOrders':
      return checkErpOrders(deps, { storeId: job.storeId });
    case 'inventory.books.checkAccount':
      return checkErpAccount(deps, { storeId: job.storeId });
    case 'inventory.books.close':
      return nightlyBooksClose(deps, { storeId: job.storeId });
  }
}

export async function stockPollPlan(deps: InventoryDeps): Promise<{ everyMs: number; jobs: InventoryJob[] }> {
  const minutes = await deps.settings.value('erp.sync.stockPollMinutes');
  const stores = await storesWithErp(deps);
  return { everyMs: minutes * 60_000, jobs: stores.map((s) => ({ name: 'inventory.erp.pullStock', storeId: s.storeId })) };
}

/** The whole timetable for the scheduler: each entry runs its jobs every `everyMs`. */
export async function inventorySchedule(deps: InventoryDeps): Promise<{ everyMs: number; jobs: InventoryJob[] }[]> {
  const [pull, sweepS, relayS, lowMin, reconcileH, stores, eventsMin, applyS, accountMin, closeMin] = await Promise.all([
    stockPollPlan(deps),
    deps.settings.value('inventory.reservation.sweepSeconds'),
    deps.settings.value('erp.push.relaySeconds'),
    deps.settings.value('inventory.lowStock.sweepMinutes'),
    deps.settings.value('inventory.reconcile.everyHours'),
    storesWithErp(deps),
    deps.settings.value('erp.events.pullMinutes'),
    deps.settings.value('erp.events.applySeconds'),
    deps.settings.value('erp.account.checkMinutes'),
    deps.settings.value('books.close.checkMinutes'),
  ]);
  // PR 608: the v6 event pull and apply, only while a store speaks v6 (in v5 the timetable is exactly as before).
  const v6Stores: number[] = [];
  for (const s of stores) if (await isV6(deps, s.storeId)) v6Stores.push(s.storeId);
  return [
    pull,
    { everyMs: sweepS * 1000, jobs: [{ name: 'inventory.reservations.release' }] },
    { everyMs: relayS * 1000, jobs: [{ name: 'inventory.erp.pushDocuments' }] },
    { everyMs: lowMin * 60_000, jobs: [{ name: 'inventory.lowStock.evaluate' }] },
    { everyMs: reconcileH * 3_600_000, jobs: stores.map((s) => ({ name: 'inventory.erp.reconcile', storeId: s.storeId })) },
    ...(v6Stores.length
      ? [
          { everyMs: eventsMin * 60_000, jobs: v6Stores.map((storeId): InventoryJob => ({ name: 'inventory.erp.pullEvents', storeId })) },
          { everyMs: applyS * 1000, jobs: [{ name: 'inventory.erp.applyEvents' } as InventoryJob] },
          // PR 610: the account, the held orders and the catch-up of open orders.
          { everyMs: accountMin * 60_000, jobs: v6Stores.map((storeId): InventoryJob => ({ name: 'inventory.erp.checkOrders', storeId })) },
          // PR 615: Retail's ERP account, the statement catch-up and the hold.
          { everyMs: accountMin * 60_000, jobs: v6Stores.map((storeId): InventoryJob => ({ name: 'inventory.books.checkAccount', storeId })) },
          // PR 616: the nightly books match (it runs once a night, after `books.close.runAt`).
          { everyMs: closeMin * 60_000, jobs: v6Stores.map((storeId): InventoryJob => ({ name: 'inventory.books.close', storeId })) },
        ]
      : []),
  ];
}
