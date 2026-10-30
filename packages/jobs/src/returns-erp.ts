// CN-028 · PR 612–614 (CN-029 Phase 1) — each v6 store's turn of returns and exchanges with its own ERP
// (@extas/orders `runErpReturns`): the return lists waiting to be sent, and (PR 613, 614) the owner's checks applied,
// the nightly compare and the exchanges kept in step. One run per store and slot of `erp.events.pullMinutes`; the
// slot is the run key. A store still on ERP contract v5 is never planned.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { isV6 } from '@extas/inventory';
import { runErpReturns, type OrdersDeps } from '@extas/orders';
import { nowOf, type JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const RETURNS_ERP_JOB = 'orders.returns.erp';
export const RETURNS_ERP_QUEUE = 'returns';

const MINUTE = 60_000;

/** The orders deps of a job: the same database and settings, the inventory's ERP connections, the job's clock. */
export const returnsDeps = (deps: JobDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, inventory: deps.inventory, now: () => nowOf(deps) });

export const runReturnsErp = (deps: JobDeps, storeId: number) => runErpReturns(returnsDeps(deps), storeId);

/** Each live store on ERP contract v6: one run per slot of `erp.events.pullMinutes`. */
export const returnsErpPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const minutes = await deps.settings.value('erp.events.pullMinutes');
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    if (!(await isV6(deps, s.id))) continue;
    const payload = { storeId: s.id };
    out.push({ queue: RETURNS_ERP_QUEUE, name: RETURNS_ERP_JOB, payload, key: runKey(RETURNS_ERP_JOB, payload, slotOf(now.getTime(), minutes * MINUTE)) });
  }
  return out;
};
