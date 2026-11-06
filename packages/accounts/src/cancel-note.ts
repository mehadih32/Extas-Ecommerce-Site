// Follow-up 314 (PR 546, SIM-F-013) — why his own cancelled order was cancelled, as his order page says it: the same
// plain words the cancel notice sends (`messages.cancelNotice`, by the order's cancel code, in his language, else
// English), nothing for a silent reason (a fake order, his number used by someone else) or a code without words (OTHER:
// its reason is only the team's note, never shown), and for a duplicate the order of his that goes ahead — one the
// duplicate review matched, else his own other open order, the nearest in time — only when his account can open it.
import type { Prisma } from '@extas/db/client';
import type { CancelCode } from '@extas/settings';
import { checkStoreId, setting, type AccountsDeps } from './context';

export interface CancelNote {
  /** The plain reason, in his language (English when the owner left that language empty). */
  reason: string;
  /** A duplicate: his order that goes ahead (null: none, or not one his account can open). */
  kept: { number: string } | null;
}

/** The statuses of an order that is not going ahead (the same list the cancel notice uses). */
const NOT_GOING_AHEAD = ['DRAFT', 'CANCELLED', 'RETURNED', 'DELIVERED', 'PARTIALLY_DELIVERED'] as const;

/** The note for his cancelled order (null: not his, not cancelled, or nothing to say). Reads only. */
export async function orderCancelNote(
  deps: AccountsDeps,
  input: { storeId: number; number: string; customerId: string | null; visitorId: string | null; lang: 'en' | 'bn' },
): Promise<CancelNote | null> {
  checkStoreId(input.storeId);
  const o = await deps.db.order.findUnique({
    where: { storeId_number: { storeId: input.storeId, number: input.number } },
    select: { id: true, status: true, archivedAt: true, customerId: true, visitorId: true, placedAt: true, cancelReasonCode: true },
  });
  const his = !!o && !o.archivedAt && ((!!input.customerId && o.customerId === input.customerId) || (!!input.visitorId && o.visitorId === input.visitorId));
  if (!o || !his || o.status !== 'CANCELLED' || !o.cancelReasonCode) return null;
  const code = o.cancelReasonCode as CancelCode;
  const notice = await setting(deps, input.storeId, 'messages.cancelNotice');
  if (notice.silent.includes(code)) return null;
  const words = notice.reasons[code];
  const reason = (words?.[input.lang] || words?.en || '').trim();
  if (!reason) return null;
  if (code !== 'DUPLICATE_ORDER' || !input.customerId || o.customerId !== input.customerId) return { reason, kept: null };
  // the duplicate review's match, when the cancel's timeline row names its alert
  const ev = await deps.db.orderEvent.findFirst({
    where: { storeId: input.storeId, orderId: o.id, type: { in: ['order.cancel', 'order.cancelAfterBooking'] } },
    orderBy: { createdAt: 'desc' },
    select: { data: true },
  });
  const alertId = ev?.data && typeof ev.data === 'object' && !Array.isArray(ev.data) ? (ev.data as Record<string, unknown>).alertId : null;
  const alert = typeof alertId === 'string' ? await deps.db.fraudAlert.findFirst({ where: { id: alertId, storeId: input.storeId }, select: { matchedOrderIds: true } }) : null;
  const ids = alert?.matchedOrderIds.filter((id) => id !== o.id) ?? [];
  const where: Prisma.OrderWhereInput = {
    storeId: input.storeId,
    customerId: input.customerId,
    archivedAt: null,
    status: { notIn: [...NOT_GOING_AHEAD] },
    id: ids.length ? { in: ids } : { not: o.id },
  };
  const open = await deps.db.order.findMany({ where, orderBy: [{ placedAt: 'desc' }, { id: 'asc' }], take: 10, select: { number: true, placedAt: true } });
  const at = o.placedAt?.getTime() ?? 0;
  const near = open.sort((a, b) => Math.abs((a.placedAt?.getTime() ?? 0) - at) - Math.abs((b.placedAt?.getTime() ?? 0) - at))[0];
  return { reason, kept: near ? { number: near.number } : null };
}
