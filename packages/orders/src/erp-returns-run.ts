// CN-028 · PR 612–614 (CN-029 Phase 1) — one store's background turn of returns and exchanges with its own ERP (job
// `orders.returns.erp` in @extas/jobs, planned per v6 store every `erp.events.pullMinutes`). Safe to run twice: each step
// keeps its own idempotency (a return list goes with its returnListId as the key; a pipeline move is once per piece and
// cause). In v5 it does nothing.
//   - PR 612: every return list waiting to be sent (closed while the ERP could not be reached) is sent again.
//   - PR 613: the owner's decisions already in the ledger move the pipeline pieces; once the store's clock passed
//     `returns.compare.runAt`, yesterday is compared with the ERP's `GET /returns/summary` (once a night; a difference
//     is pulled again and compared again).
//   - PR 614: every exchange waiting for the ERP's stock is tried again (regular orders come first), and the store's
//     exchanges are read back from `GET /exchanges` (the 4-day watch, settled, billed, credited, cancelled).
import { applyReturnDecisions, InventoryError, isV6 } from '@extas/inventory';
import type { OrdersDeps } from './context';
import { OrdersError } from './errors';
import { retryWaitingExchanges, syncErpExchanges } from './exchange-v6';
import { sendWaitingHandbackLists } from './handback';
import { nightlyReturnsCompare, type ReturnsCompareView } from './returns-erp';
import { inventoryOf, systemBy } from './service';

export const ERP_RETURNS_SOURCE = 'erp-returns';

export interface ErpReturnsRun {
  status: 'ok' | 'skipped';
  reason: string | null;
  lists: { sent: number; waiting: number; refused: number } | null;
  decisions: { events: number; moved: number } | null;
  /** The night's compare when it ran on this turn. */
  compare: Pick<ReturnsCompareView, 'date' | 'matched' | 'trigger' | 'error'> | null;
  /** Exchanges sent after waiting for stock, still waiting, refused; and how many the ERP's list changed. */
  exchanges: { sent: number; waiting: number; refused: number; synced: number; error: string | null } | null;
}

export async function runErpReturns(deps: OrdersDeps, storeId: number): Promise<ErpReturnsRun> {
  if (!(await isV6(deps, storeId))) return { status: 'skipped', reason: 'ERP_MODEL_V5', lists: null, decisions: null, compare: null, exchanges: null };
  const by = systemBy(ERP_RETURNS_SOURCE);
  const lists = await sendWaitingHandbackLists(deps, storeId, by);
  const decisions = await applyReturnDecisions(inventoryOf(deps), storeId);
  const retried = await retryWaitingExchanges(deps, storeId);
  let synced = 0;
  let error: string | null = null;
  try {
    synced = (await syncErpExchanges(deps, storeId)).updated;
  } catch (e) {
    // the ERP's list is read again on the next turn; nothing is lost
    if (!(e instanceof OrdersError) && !(e instanceof InventoryError)) throw e;
    error = `${e.code}: ${e.message}`;
  }
  const night = await nightlyReturnsCompare(deps, storeId);
  return { status: 'ok', reason: null, lists, decisions, compare: night ? { date: night.date, matched: night.matched, trigger: night.trigger, error: night.error } : null, exchanges: { ...retried, synced, error } };
}
