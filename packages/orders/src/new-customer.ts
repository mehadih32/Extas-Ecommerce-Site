// S06 · PR 545 — the new-customer verification queue ("an identity with no history anywhere goes to a phone call, never to
// a decline. No history is not a risk score"). While `risk.newCustomer` is on (off as shipped), an order whose customer
// has no earlier order anywhere in the shop — not by the phone (any of its written forms), not by the account, not by
// the identity the graph linked it to (and the identities merged into it) — gets a call task (NEW_CUSTOMER) in the call
// queue, a "New customer" mark for the team and a timeline line. A prepaid order skips the call (SIM-F-020) unless the
// owner turns `prepaid` on. Nothing else happens: the order is not held, declined, cancelled or asked for an advance, and
// no history adds nothing to the risk score (risk.ts scores only signals that fired). The call is worked from Orders ›
// Calls, where the person records what the call found (`recordCall`, calls.ts).
import type { Prisma } from '@extas/db/client';
import { setting, type OrdersDeps } from './context';
import { isOrdersError } from './errors';
import { clusterFamily, clusterOfOrder } from './identity-family';
import { phoneForms } from './phone-history';
import { isPrepaidMethod } from './risk-section';
import { execute, systemBy, type By } from './service';

/** The call queue reason (CallTask.reason; calls.ts CALL_TASK_REASONS). */
export const NEW_CUSTOMER_REASON = 'NEW_CUSTOMER';
/** The order flag (the team's screens show it, never the customer). */
export const NEW_CUSTOMER_FLAG = 'NEW_CUSTOMER';
/** The timeline type. */
export const NEW_CUSTOMER_EVENT = 'order.newCustomer';

export interface NewCustomerResult {
  callTaskId: string;
}

/** The order's customer has no earlier order anywhere in the shop (phone forms, account, identity family). */
export async function hasNoHistory(deps: OrdersDeps, ref: { storeId: number; orderId: string }): Promise<boolean> {
  const o = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { phone: true, customerId: true } });
  if (!o) return false;
  const others: Prisma.OrderWhereInput[] = [];
  const phones = phoneForms(o.phone);
  if (phones.length) others.push({ phone: { in: phones } });
  if (o.customerId) others.push({ customerId: o.customerId });
  const cluster = await clusterOfOrder(deps.db, ref.storeId, ref.orderId);
  if (cluster) {
    const family = await clusterFamily(deps.db, ref.storeId, cluster);
    const links = await deps.db.identityLink.findMany({ where: { storeId: ref.storeId, clusterId: { in: family }, orderId: { not: ref.orderId } }, select: { orderId: true } });
    const ids = links.flatMap((l) => (l.orderId ? [l.orderId] : []));
    if (ids.length) others.push({ id: { in: ids } });
  }
  if (!others.length) return true;
  const n = await deps.db.order.count({ where: { storeId: ref.storeId, id: { not: ref.orderId }, status: { not: 'DRAFT' }, OR: others } });
  return n === 0;
}

/**
 * The moment the order lands: a customer with no history gets the call (once per order), the mark and the line. Off, a
 * returning customer, a prepaid order (unless the owner chose otherwise) or a closed order: nothing, null.
 */
export async function newCustomerOnOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy('new-customer')): Promise<NewCustomerResult | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.newCustomer');
  if (!cfg.enabled) return null;
  const o = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { paymentMethod: true } });
  if (!o) return null;
  if (!cfg.prepaid && isPrepaidMethod(o.paymentMethod)) return null;
  if (!(await hasNoHistory(deps, ref))) return null;
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'newCustomer',
        input: {},
        effect: async (tx, ord) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: ord.id }, select: { flags: true, customerId: true } });
          const open = await tx.callTask.findFirst({ where: { storeId: ord.storeId, orderId: ord.id, reason: NEW_CUSTOMER_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
          const task = open ?? (await tx.callTask.create({ data: { storeId: ord.storeId, orderId: ord.id, customerId: row.customerId, reason: NEW_CUSTOMER_REASON }, select: { id: true } }));
          const flags = row.flags.includes(NEW_CUSTOMER_FLAG) ? row.flags : [...row.flags, NEW_CUSTOMER_FLAG];
          return { data: { flags }, reasonCode: NEW_CUSTOMER_REASON, eventData: { callTaskId: task.id }, audit: { before: { flags: row.flags }, after: { flags, callTaskId: task.id } } };
        },
      },
      { idempotencyKey: `new-customer:${ref.orderId}` },
    );
    // the task the step made (or a replay found)
    const task = await deps.db.callTask.findFirst({ where: { storeId: ref.storeId, orderId: ref.orderId, reason: NEW_CUSTOMER_REASON }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    return task ? { callTaskId: task.id } : null;
  } catch (e) {
    if (isOrdersError(e) && e.code === 'ILLEGAL_TRANSITION') return null;
    throw e;
  }
}
