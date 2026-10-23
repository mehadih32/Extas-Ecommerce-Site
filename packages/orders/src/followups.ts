// PR 153, F-043 — the order timers. They never change an order: an order held longer than `orders.hold.reviewHours`,
// or waiting for an advance past its deadline (`orders.advance.waitHours`), gets one call task for a person, and a
// timeline row says so. Nothing is cancelled or released by a timer (CN-018). Both are off (0) by default. The worker
// runs `orderFollowUps` on a schedule (wired with the jobs, follow-up in PROGRESS.md); a test or the admin may run it.
import { nowOf, setting, TX, type OrdersDeps } from './context';
import { eventRow, systemBy } from './service';

/** Why the team calls (CallTask.reason). */
export const FOLLOW_UP_REASONS = { holdReview: 'HOLD_REVIEW', advanceOverdue: 'ADVANCE_OVERDUE' } as const;

export interface FollowUpResult {
  holdReviews: number;
  advanceOverdue: number;
}

/** One pass for one store. Safe to run again: an order with an open task of the same reason gets no second one. */
export async function orderFollowUps(deps: OrdersDeps, storeId: number): Promise<FollowUpResult> {
  const now = nowOf(deps);
  const [reviewHours, waitHours] = await Promise.all([setting(deps, storeId, 'orders.hold.reviewHours'), setting(deps, storeId, 'orders.advance.waitHours')]);
  const by = systemBy('order-timer');
  const task = async (orderId: string, customerId: string | null, reason: string, data: Record<string, unknown>): Promise<boolean> =>
    deps.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const open = await tx.callTask.count({ where: { storeId, orderId, reason, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
      if (open) return false;
      await tx.callTask.create({ data: { storeId, orderId, customerId, reason, dueAt: now } });
      await eventRow(tx, by, { storeId, orderId, type: 'order.followUp', reasonCode: reason, data });
      return true;
    }, TX);

  let holdReviews = 0;
  if (reviewHours > 0) {
    const before = new Date(now.getTime() - reviewHours * 3_600_000);
    const held = await deps.db.order.findMany({ where: { storeId, status: 'ON_HOLD', onHoldSince: { lte: before } }, select: { id: true, customerId: true, onHoldSince: true, holdReasonCode: true }, take: 500 });
    for (const o of held) if (await task(o.id, o.customerId, FOLLOW_UP_REASONS.holdReview, { onHoldSince: o.onHoldSince, holdReasonCode: o.holdReasonCode, reviewHours })) holdReviews++;
  }
  let advanceOverdue = 0;
  if (waitHours > 0) {
    const late = await deps.db.order.findMany({ where: { storeId, status: 'AWAITING_ADVANCE', advanceDueAt: { lte: now } }, select: { id: true, customerId: true, advanceDueAt: true, advanceRequiredMinor: true, paidMinor: true }, take: 500 });
    for (const o of late) if (await task(o.id, o.customerId, FOLLOW_UP_REASONS.advanceOverdue, { advanceDueAt: o.advanceDueAt, requiredMinor: o.advanceRequiredMinor, paidMinor: o.paidMinor })) advanceOverdue++;
  }
  return { holdReviews, advanceOverdue };
}
