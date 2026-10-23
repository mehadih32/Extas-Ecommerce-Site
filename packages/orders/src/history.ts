// PR 141 — what one order's admin screen shows beside the order (§5.3 ORD-07), read only: the customer's history (the
// same customer account, or the same phone: how many orders, open, delivered, returned, cancelled, and the newest ones)
// and the names of the staff in its timeline.
import type { Prisma } from '@extas/db/client';
import { allow, type OrdersDeps, type Who } from './context';
import { OPEN_STATES, type OrderState } from './pure';

export interface HistoryOrder {
  id: string;
  number: string;
  status: OrderState;
  totalMinor: number;
  currency: string;
  placedAt: Date;
}

export interface OrderHistory {
  /** How the other orders were found: the same customer account, the same phone, or nothing to match on. */
  matchedBy: 'customer' | 'phone' | null;
  /** The customer's other orders (not this one), by what happened to them. */
  counts: { orders: number; open: number; delivered: number; returned: number; cancelled: number };
  /** The newest of them. */
  recent: HistoryOrder[];
}

const FINISHED: Readonly<Record<'delivered' | 'returned' | 'cancelled', readonly OrderState[]>> = {
  delivered: ['DELIVERED', 'PARTIALLY_DELIVERED'],
  returned: ['RETURNED'],
  cancelled: ['CANCELLED'],
};

/** One order's customer history (ORD-07 "the customer's history beside it"): every other placed order of the same customer or phone. */
export async function orderHistory(deps: OrdersDeps, who: Who, orderId: string, take: number): Promise<OrderHistory> {
  await allow(deps, who, 'orders.read');
  const none: OrderHistory = { matchedBy: null, counts: { orders: 0, open: 0, delivered: 0, returned: 0, cancelled: 0 }, recent: [] };
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, customerId: true, phone: true } });
  if (!o || (!o.customerId && !o.phone)) return none;
  const same: Prisma.OrderWhereInput[] = [...(o.customerId ? [{ customerId: o.customerId }] : []), ...(o.phone ? [{ phone: o.phone }] : [])];
  const where: Prisma.OrderWhereInput = { storeId: who.storeId, id: { not: o.id }, archivedAt: null, status: { not: 'DRAFT' }, OR: same };
  const [groups, recent] = await Promise.all([
    deps.db.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
    deps.db.order.findMany({ where, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: Math.max(0, take), select: { id: true, number: true, status: true, totalMinor: true, currency: true, placedAt: true } }),
  ]);
  const n = (states: readonly string[]) => groups.filter((g) => states.includes(g.status)).reduce((s, g) => s + g._count._all, 0);
  return {
    matchedBy: o.customerId ? 'customer' : 'phone',
    counts: {
      orders: groups.reduce((s, g) => s + g._count._all, 0),
      open: n(OPEN_STATES),
      delivered: n(FINISHED.delivered),
      returned: n(FINISHED.returned),
      cancelled: n(FINISHED.cancelled),
    },
    recent: recent.map((r) => ({ ...r, status: r.status as OrderState })),
  };
}

/** The display names of the staff in a timeline (an archived or unknown id has no name). */
export async function staffNames(deps: OrdersDeps, who: Who, ids: readonly (string | null)[]): Promise<Record<string, string>> {
  await allow(deps, who, 'orders.read');
  const want = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
  if (!want.length) return {};
  const rows = await deps.db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.displayName]));
}

/** The number and status of orders the page links to (a duplicate review's matches), in this store only. */
export async function orderNumbers(deps: OrdersDeps, who: Who, ids: readonly string[]): Promise<{ id: string; number: string; status: OrderState }[]> {
  await allow(deps, who, 'orders.read');
  const want = [...new Set(ids)];
  if (!want.length) return [];
  const rows = await deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: want } }, select: { id: true, number: true, status: true } });
  return rows.map((r) => ({ ...r, status: r.status as OrderState }));
}
