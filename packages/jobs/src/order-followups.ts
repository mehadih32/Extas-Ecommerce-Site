// PR 153 follow-up 192 — the order timers on the worker's schedule (@extas/orders `orderFollowUps`): each live store
// with a timer on (`orders.hold.reviewHours` or `orders.advance.waitHours` above 0; both 0 as shipped) gets one
// `orders.followUps.run` per hour; the hour is the run key. The run only raises a call task for a person and a timeline
// row (an order on hold too long, an advance past its deadline); it never cancels or releases anything (CN-018). Safe to
// run twice: an order with an open task of the same reason gets no second one.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { orderFollowUps, type FollowUpResult } from '@extas/orders';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import { returnsDeps } from './returns-erp';
import type { Planner } from './worker';

export const ORDER_FOLLOW_UPS_JOB = 'orders.followUps.run';
export const ORDER_FOLLOW_UPS_QUEUE = 'orders';

/** One run an hour: both timers are counted in whole hours, so a later hour is never what the team notices. */
const SLOT_MS = 3_600_000;

/** One store's pass. */
export function runOrderFollowUps(deps: JobDeps, storeId: number): Promise<FollowUpResult> {
  return orderFollowUps(returnsDeps(deps), storeId);
}

/** Each live store with a timer on: one run per hour. */
export const orderFollowUpsPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const [review, wait] = await Promise.all([deps.settings.value('orders.hold.reviewHours', { storeId: s.id }), deps.settings.value('orders.advance.waitHours', { storeId: s.id })]);
    if (!(review > 0) && !(wait > 0)) continue;
    const payload = { storeId: s.id };
    out.push({ queue: ORDER_FOLLOW_UPS_QUEUE, name: ORDER_FOLLOW_UPS_JOB, payload, key: runKey(ORDER_FOLLOW_UPS_JOB, payload, slotOf(now.getTime(), SLOT_MS)) });
  }
  return out;
};
