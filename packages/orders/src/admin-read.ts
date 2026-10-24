// PR 140 — what the admin's order list shows beside each row (§5.3 ORD-01; §6.5.0), read only: nothing here changes an
// order. The four statuses stay separate facts: the order's own status is on the row; the courier's comes from its
// Shipment (status, tracking code, courier name), the pieces and the first product of its lines, the payment pill from the money (list.ts), and the return/refund chip
// from the ReturnRecord and Refund rows (`returnRefundState`).
import { allow, type OrdersDeps, type Who } from './context';
import { openReviewIds, viewWhere, type OrderView } from './list';

/** The return / refund chip of an order (null: nothing to show). Refunds are REQUESTS until the owner approves (PR 172). */
export type ReturnRefundState = 'REFUND_APPROVED' | 'REFUND_REQUESTED' | 'RETURN_EXPECTED' | 'RETURN_RECEIVED' | 'REFUND_DONE';

/** The chip from the order's return and refund rows: waiting work first (a refund to approve or pay, a return on its way). */
export function returnRefundState(returns: readonly { receivedAt: Date | null }[], refunds: readonly { status: string }[]): ReturnRefundState | null {
  if (refunds.some((r) => r.status === 'APPROVED')) return 'REFUND_APPROVED';
  if (refunds.some((r) => r.status === 'REQUESTED')) return 'REFUND_REQUESTED';
  if (returns.some((r) => r.receivedAt === null)) return 'RETURN_EXPECTED';
  if (returns.length) return 'RETURN_RECEIVED';
  if (refunds.some((r) => r.status === 'COMPLETED')) return 'REFUND_DONE';
  return null;
}

export interface RowShipment {
  status: string;
  trackingCode: string | null;
  courierName: string;
}

export interface RowExtras {
  /** The newest courier booking (a cancelled or failed one too: the chip says so), or null when never booked. */
  shipment: RowShipment | null;
  returnRefund: ReturnRefundState | null;
  /** Pieces on the order's active lines, and the first line's product name (the list's Items column). */
  units: number;
  firstItem: string | null;
  lines: number;
}

/** The courier and return/refund facts of a page of orders (the list's chips and courier column). */
export async function listExtras(deps: OrdersDeps, who: Who, orderIds: readonly string[]): Promise<Record<string, RowExtras>> {
  await allow(deps, who, 'orders.read');
  const ids = [...new Set(orderIds)];
  if (!ids.length) return {};
  const where = { storeId: who.storeId, orderId: { in: ids } };
  const [shipments, returns, refunds, items] = await Promise.all([
    deps.db.shipment.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { orderId: true, status: true, trackingCode: true, courierAccount: { select: { name: true } } } }),
    deps.db.returnRecord.findMany({ where, select: { orderId: true, receivedAt: true } }),
    deps.db.refund.findMany({ where, select: { orderId: true, status: true } }),
    deps.db.orderItem.findMany({ where: { ...where, status: 'ACTIVE' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { orderId: true, productName: true, quantity: true } }),
  ]);
  const out: Record<string, RowExtras> = {};
  for (const id of ids) {
    const s = shipments.find((x) => x.orderId === id);
    const mine = items.filter((x) => x.orderId === id);
    out[id] = {
      units: mine.reduce((n, x) => n + x.quantity, 0),
      firstItem: mine[0]?.productName ?? null,
      lines: mine.length,
      shipment: s ? { status: s.status, trackingCode: s.trackingCode, courierName: s.courierAccount.name } : null,
      returnRefund: returnRefundState(
        returns.filter((r) => r.orderId === id),
        refunds.filter((r) => r.orderId === id),
      ),
    };
  }
  return out;
}

/** When the oldest order of a view was placed (null: the view is empty), for "oldest 2 h" beside a count. */
export async function viewOldest(deps: OrdersDeps, who: Who, view: OrderView): Promise<Date | null> {
  await allow(deps, who, 'orders.read');
  const reviews = await openReviewIds(deps, who.storeId);
  const o = await deps.db.order.findFirst({
    where: { AND: [{ storeId: who.storeId, archivedAt: null, status: { not: 'DRAFT' } }, viewWhere(view, reviews)] },
    orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
    select: { placedAt: true },
  });
  return o?.placedAt ?? null;
}

/**
 * PR 12 (follow-up 200): the order work waiting in some views, for the sidebar badge and the Dashboard's "Needs you
 * now": how many, and when the oldest was placed. No key check here: the shell shows each row only to the people whose
 * keys open its list (the counts are one per store, like the shell's other queues).
 */
export async function orderQueueCounts(db: OrdersDeps['db'], storeId: number, views: readonly OrderView[]): Promise<Record<string, { n: number; oldest: Date | null }>> {
  const reviews = await openReviewIds({ db } as OrdersDeps, storeId);
  const base = { storeId, archivedAt: null, status: { not: 'DRAFT' as const } };
  const rows = await Promise.all(
    views.map(async (v) => {
      const where = { AND: [base, viewWhere(v, reviews)] };
      const [n, first] = await Promise.all([db.order.count({ where }), db.order.findFirst({ where, orderBy: [{ placedAt: 'asc' }, { id: 'asc' }], select: { placedAt: true } })]);
      return [v, { n, oldest: first?.placedAt ?? null }] as const;
    }),
  );
  return Object.fromEntries(rows);
}
