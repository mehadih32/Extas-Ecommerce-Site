// PR 170 — the sweep of open online payments and its planner (the job itself is in catalogue.ts with the others). Each
// store whose `payments.pending` recovery or abandon mark is on gets one `payments.pending.sweep` per slot of its
// `everyMinutes`: open gateway payments are asked about at the gateway (money that came in while the callback was lost
// is recorded) and, only when the owner set it, given up as abandoned (@extas/payments `sweepPending`). The slot is
// the run key, so a slot planned on many ticks is one run; the sweep itself is safe to run twice (the outcome writer
// changes a payment once).
import type { PaymentsDeps } from '@extas/payments';
import { recordAdvance } from '@extas/orders';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const PAYMENTS_SWEEP_JOB = 'payments.pending.sweep';
export const PAYMENTS_QUEUE = 'payments';

/** The payments service's dependencies from the worker's (the gateways come from main.ts's connection layer). */
export function paymentsDeps(deps: JobDeps): PaymentsDeps | null {
  if (!deps.payments) return null;
  return {
    db: deps.db,
    settings: deps.settings,
    now: deps.now,
    gateways: deps.payments.gateways,
    orders: {
      // an advance paid in full moves the order through the one order service
      async advancePaid(storeId, orderId, by) {
        await recordAdvance({ db: deps.db, settings: deps.settings, now: deps.now, inventory: deps.inventory }, { storeId, orderId }, { actorType: 'SYSTEM', actorId: null, source: by.source });
      },
    },
  };
}

/** Each store with the sweep on: one run per slot of its interval. */
export const paymentsPlanner: Planner = async (deps, now) => {
  if (!deps.payments) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const p = await deps.settings.value('payments.pending', { storeId: s.id });
    if (p.recoverAfterMinutes === 0 && p.abandonAfterMinutes === 0) continue;
    const payload = { storeId: s.id };
    out.push({ queue: PAYMENTS_QUEUE, name: PAYMENTS_SWEEP_JOB, payload, key: runKey(PAYMENTS_SWEEP_JOB, payload, slotOf(now.getTime(), p.everyMinutes * 60_000)) });
  }
  return out;
};
