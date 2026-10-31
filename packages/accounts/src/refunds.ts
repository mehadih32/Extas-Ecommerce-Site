// Go-live gate F-041 (follow-up of PR 172) — what the customer sees of the refunds on his own order, on its page in My
// account: each refund's amount, how it goes back (the way he paid, or his wallet) and where it stands, in his words —
// being checked, approved and on its way, sent (with the day), or not approved. Review R3: a request not yet approved
// is shown as a request waiting for the shop's OK, never as money on its way. Never the team's notes, names or the
// payout reference. Read for the customer whose order it is (his account, or the browser that placed it; anyone else
// gets null, like a missing order). Nothing here moves money.
import { checkStoreId, type AccountsDeps } from './context';

/** His words for a refund's state: waiting for the shop's OK, approved (its money on the way), sent, not approved. */
export type CustomerRefundState = 'checking' | 'sending' | 'sent' | 'closed';

export interface CustomerRefund {
  amountMinor: number;
  /** `wallet`: store credit in his wallet; otherwise back the way he paid. */
  toWallet: boolean;
  state: CustomerRefundState;
  /** When it was asked; when it was sent, for a sent one. */
  at: Date;
}

/**
 * Review R3 (M1): a return refund the system closed because the money paid for his re-ship exchange (@extas/payments
 * EXCHANGE_USED_NOTE; kept in step by a test) — it was never his to wait for, so his page leaves it out.
 */
export const EXCHANGE_USED_NOTE = 'Used for exchange';

const STATE: Record<string, CustomerRefundState> = { REQUESTED: 'checking', APPROVED: 'sending', FAILED: 'sending', COMPLETED: 'sent', REJECTED: 'closed' };

/** The refunds of one of his orders, oldest first (an empty list when there is none; null when it is not his). */
export async function orderRefunds(deps: AccountsDeps, input: { storeId: number; number: string; customerId: string | null; visitorId: string | null }): Promise<CustomerRefund[] | null> {
  checkStoreId(input.storeId);
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: input.storeId, number: input.number } }, select: { id: true, customerId: true, visitorId: true, status: true, archivedAt: true } });
  const his = !!o && o.status !== 'DRAFT' && !o.archivedAt && ((!!input.customerId && o.customerId === input.customerId) || (!!input.visitorId && o.visitorId === input.visitorId));
  if (!o || !his) return null;
  const rows = await deps.db.refund.findMany({
    where: { storeId: input.storeId, orderId: o.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 20, // hardcode-ok: an order has a few refunds at most (its cancel or return, the wallet part, a correction)
    select: { amountMinor: true, method: true, status: true, createdAt: true, completedAt: true, requestedById: true, decisionNote: true },
  });
  return rows.filter((r) => !(r.status === 'REJECTED' && !r.requestedById && r.decisionNote?.startsWith(EXCHANGE_USED_NOTE))).map((r) => {
    const state = STATE[r.status] ?? 'checking';
    return { amountMinor: r.amountMinor, toWallet: r.method === 'wallet', state, at: state === 'sent' && r.completedAt ? r.completedAt : r.createdAt };
  });
}
