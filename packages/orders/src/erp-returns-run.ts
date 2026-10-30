// CN-028 · PR 612–614 (CN-029 Phase 1) — one store's background turn of returns and exchanges with its own ERP (job
// `orders.returns.erp` in @extas/jobs, planned per v6 store every `erp.events.pullMinutes`). Safe to run twice: each step
// keeps its own idempotency (a return list goes with its returnListId as the key; a pipeline move is once per piece and
// cause). In v5 it does nothing.
//   - PR 612: every return list waiting to be sent (closed while the ERP could not be reached) is sent again.
import { isV6 } from '@extas/inventory';
import type { OrdersDeps } from './context';
import { sendWaitingHandbackLists } from './handback';
import { systemBy } from './service';

export const ERP_RETURNS_SOURCE = 'erp-returns';

export interface ErpReturnsRun {
  status: 'ok' | 'skipped';
  reason: string | null;
  lists: { sent: number; waiting: number; refused: number } | null;
}

export async function runErpReturns(deps: OrdersDeps, storeId: number): Promise<ErpReturnsRun> {
  if (!(await isV6(deps, storeId))) return { status: 'skipped', reason: 'ERP_MODEL_V5', lists: null };
  const by = systemBy(ERP_RETURNS_SOURCE);
  const lists = await sendWaitingHandbackLists(deps, storeId, by);
  return { status: 'ok', reason: null, lists };
}
