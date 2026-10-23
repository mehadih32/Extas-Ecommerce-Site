// PR 144 (CN-020 (5)) — the customer cancels his own order: with one tap until the owner's cut-off
// (`orders.cancel.customer`, by default "until the team confirms"), then as a request the team answers, until the
// courier is booked. After booking there is no cancel button; he asks support, and the team uses cancel after booking.
//
// The order is his when it carries his customer id (signed in) or the browser id that placed it (a guest's bag cookie);
// anything else is "no such order", so nobody learns another person's order numbers. The cut-off is checked again under
// the order's row lock, so a confirm in the same second wins cleanly and his tap becomes a request (or is refused).
import { z } from 'zod';
import { parse, setting, type OrdersDeps } from './context';
import { cancelWith } from './commands';
import { OrdersError } from './errors';
import { customerCancelMode, type CustomerCancelMode } from './pure';
import { execute, factsOf, MACHINE_SELECT, machineOf, type By, type CommandResult } from './service';

/** Who the shop says is asking: the signed-in customer, the browser that placed the order, or both. */
export interface CustomerRef {
  storeId: number;
  customerId: string | null;
  visitorId: string | null;
}

export const customerCancelInput = z.object({ number: z.string().trim().min(1).max(40), reasonKey: z.string().trim().min(1).max(60), note: z.string().trim().max(500).optional() }).strict();

const customerBy = (c: CustomerRef): By => ({ actorType: 'CUSTOMER', actorId: c.customerId, source: 'shop' });

/** His order by number, or NOT_FOUND. */
async function ownOrder(deps: OrdersDeps, c: CustomerRef, number: string): Promise<{ id: string }> {
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: c.storeId, number } }, select: { id: true, customerId: true, visitorId: true } });
  const his = o && ((c.customerId && o.customerId === c.customerId) || (c.visitorId && o.visitorId === c.visitorId));
  if (!o || !his) throw new OrdersError('NOT_FOUND', 'no such order', ['number']);
  return { id: o.id };
}

/** What his order page offers now (the shop shows the button or the "you asked" line from it). */
export async function customerCancelState(deps: OrdersDeps, c: CustomerRef, number: string): Promise<{ mode: CustomerCancelMode; reasons: { key: string; en: string; bn: string }[] }> {
  const { id } = await ownOrder(deps, c, number);
  const [cfg, reasons, o] = await Promise.all([
    setting(deps, c.storeId, 'orders.cancel.customer'),
    setting(deps, c.storeId, 'orders.cancel.customerReasons'),
    deps.db.order.findUniqueOrThrow({ where: { id }, select: MACHINE_SELECT }),
  ]);
  const f = await factsOf(deps.db, o);
  const mode = customerCancelMode(cfg, machineOf(o, f));
  return { mode, reasons: mode === 'tap' || mode === 'request' ? reasons : [] };
}

export interface CustomerCancelResult extends CommandResult {
  /** "cancelled" (one tap) or "requested" (the team decides). */
  outcome: 'cancelled' | 'requested';
}

/** The customer's cancel: one tap (CUSTOMER_BEFORE_CONFIRM) or a request (the team approves it as CUSTOMER_AFTER_CONFIRM). */
export async function customerCancel(deps: OrdersDeps, c: CustomerRef, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<CustomerCancelResult> {
  const d = parse(customerCancelInput, input, 'cancel');
  const { id } = await ownOrder(deps, c, d.number);
  const [cfg, reasons] = await Promise.all([setting(deps, c.storeId, 'orders.cancel.customer'), setting(deps, c.storeId, 'orders.cancel.customerReasons')]);
  const reason = reasons.find((r) => r.key === d.reasonKey);
  if (!reason) throw new OrdersError('REASON_REQUIRED', 'pick a reason from the list', ['reasonKey']);
  const ref = { storeId: c.storeId, orderId: id };
  const by = customerBy(c);
  const before = await deps.db.order.findUniqueOrThrow({ where: { id }, select: MACHINE_SELECT });
  const first = customerCancelMode(cfg, machineOf(before, await factsOf(deps.db, before)));
  const said = { reasonKey: reason.key, reason: { en: reason.en, bn: reason.bn }, note: d.note ?? null };

  if (first === 'tap') {
    const r = await cancelWith(deps, ref, by, 'CUSTOMER_BEFORE_CONFIRM', d.note, {
      ...opts,
      picked: false,
      extra: { by: 'customer', ...said },
      // the same check under the lock: confirmed in between → refused here, and he sees the request instead
      check: (o, f) => {
        if (customerCancelMode(cfg, machineOf(o, f)) !== 'tap') throw new OrdersError('CANCEL_NOT_ALLOWED', 'the order moved on; ask to cancel instead', ['number']);
      },
    });
    return { ...r, outcome: 'cancelled' };
  }
  if (first === 'request') {
    const r = await execute(deps, ref, by, {
      command: 'requestCancel',
      input: said,
      check: (o, f) => {
        if (customerCancelMode(cfg, machineOf(o, f)) !== 'request') throw new OrdersError('CANCEL_NOT_ALLOWED', 'this order can no longer be cancelled here', ['number']);
      },
      effect: async (_tx, _o, _f, { now }) => ({ data: { cancelRequestedAt: now, cancelRequestReason: reason.key }, reasonCode: reason.key, message: d.note ?? null, eventData: said }),
    }, opts);
    return { ...r, outcome: 'requested' };
  }
  throw new OrdersError(first === 'requested' ? 'CANCEL_REQUESTED' : 'CANCEL_NOT_ALLOWED', first === 'requested' ? 'you already asked to cancel this order' : 'this order can no longer be cancelled here', ['number'], { mode: first });
}
