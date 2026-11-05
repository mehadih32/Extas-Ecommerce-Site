// S14 · PR 533 — the customer history summary at approval (Orders › To confirm, the call card): while the owner's
// `customers.approvalHistory` is on, the chosen order's number with every other order of it in the store (the phone
// history's read, PR 157, as many as `risk.history.orders`), what became of each, the exchanges that went ahead and the
// deliveries still being checked (PR 525) — summed up by approval-summary.ts. A read for `orders.read`: it never
// confirms, holds, blocks or changes an order.
// PR 534: while the owner's grading is on, the card also names the grade and the verified mark his history earns — counted
// as the good-customer override and the customer page count it (summarizeHistory), so all three agree.
import { phoneNormalizeBD } from '@extas/delivery';
import { approvalSummary, type ApprovalSummary } from './approval-summary';
import { allow, setting, UUID, type OrdersDeps, type Who } from './context';
import { gradingOf, markOf, type GradeMark } from './grades';
import { historyOptions, phoneOrders } from './phone-history';
import { summarizeHistory } from './phone-summary';

export interface ApprovalHistoryView extends ApprovalSummary {
  /** The number as the team reads it (01712-345678), or the stored text when it is not a mobile number. */
  phone: string | null;
  /** PR 534: his grade and verified mark (null while grading is off). */
  mark: GradeMark | null;
}

/** The chosen order's customer history for the person confirming it; null while switched off or for no such order. */
export async function approvalHistory(deps: OrdersDeps, who: Who, orderId: string): Promise<ApprovalHistoryView | null> {
  await allow(deps, who, 'orders.read');
  const cfg = await setting(deps, who.storeId, 'customers.approvalHistory');
  if (!cfg.enabled || !UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, phone: true } });
  if (!o) return null;
  const opts = await historyOptions(deps, who.storeId);
  const past = await phoneOrders(deps, who.storeId, o.phone, { excludeOrderId: o.id, take: opts.take });
  const ids = past.map((x) => x.id);
  const [exchanged, checking] = ids.length
    ? await Promise.all([
        deps.db.exchange.findMany({ where: { storeId: who.storeId, orderId: { in: ids }, status: { notIn: ['REJECTED', 'CANCELLED'] } }, select: { orderId: true } }),
        deps.db.deliveryCheck.findMany({ where: { storeId: who.storeId, orderId: { in: ids }, state: 'OPEN' }, select: { orderId: true } }),
      ])
    : [[], []];
  const p = o.phone ? phoneNormalizeBD(o.phone) : null;
  const summary = approvalSummary(
    past,
    { exchanged: new Set(exchanged.map((x) => x.orderId)), checking: new Set(checking.map((x) => x.orderId)) },
    { ourFault: opts.ourFault, noAnswerOutcomes: opts.noAnswerOutcomes, recent: cfg.recent, reasonsShown: cfg.reasonsShown },
  );
  const grading = await gradingOf(deps, who.storeId);
  const mark = grading ? markOf(grading, summarizeHistory(past, { ourFault: opts.ourFault, noAnswerOutcomes: opts.noAnswerOutcomes })) : null;
  return { phone: p?.ok ? p.nice : (o.phone ?? null), ...summary, mark };
}
