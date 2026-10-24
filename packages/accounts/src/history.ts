// S05 · PR 150 — the read side of his whole order history and of one order's life (lifecycle.ts says what each shows).
// Read for the signed-in customer only, in his store, as the order stores it; nothing here moves an order (CN-022).
import type { Prisma } from '@extas/db/client';
import { checkStoreId, setting, type AccountsDeps } from './context';
import { cardsOf, orderWhere, type OrderCard } from './dashboard';
import { LIFE_EVENT_TYPES, lifecycleOf, ORDER_SHOWS, SHOW_STATES, showOf, type LifeEventRow, type LifeStep, type OrderShow } from './lifecycle';
import type { OrderState } from './pure';

export interface OrderHistory {
  /** This page's cards, newest first. */
  cards: OrderCard[];
  /** The group shown, and how many of his orders each group holds. */
  show: OrderShow;
  counts: Record<OrderShow, number>;
  /** The page shown (from 1; a page past the end shows the last one) and how many pages the group has (at least 1). */
  page: number;
  pages: number;
  /** Orders a page (`account.lists.orders`). */
  perPage: number;
}

/** His orders, one page of one group at a time (`account.lists.orders` a page), with every group's count. */
export async function orderHistory(deps: AccountsDeps, input: { storeId: number; customerId: string; show?: OrderShow; page?: number; now?: Date }): Promise<OrderHistory> {
  checkStoreId(input.storeId);
  const base = orderWhere(input.storeId, input.customerId);
  const [{ orders: perPage }, groups] = await Promise.all([setting(deps, input.storeId, 'account.lists'), deps.db.order.groupBy({ by: ['status'], where: base, _count: { _all: true } })]);
  const counts = Object.fromEntries(ORDER_SHOWS.map((k) => [k, 0])) as Record<OrderShow, number>;
  for (const g of groups) {
    const k = showOf(g.status as OrderState);
    if (!k) continue;
    counts[k] += g._count._all;
    counts.all += g._count._all;
  }
  const show = input.show ?? 'all';
  const where: Prisma.OrderWhereInput = show === 'all' ? base : { ...base, status: { in: [...SHOW_STATES[show]] } };
  const pages = Math.max(1, Math.ceil(counts[show] / perPage));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), pages);
  const cards = counts[show] ? await cardsOf(deps, input.storeId, where, { skip: (page - 1) * perPage, take: perPage }, input.now ?? new Date()) : [];
  return { cards, show, counts, page, pages, perPage };
}

/** The order as "What happened" reads it. */
const LIFE_SELECT = {
  id: true,
  customerId: true,
  visitorId: true,
  status: true,
  archivedAt: true,
  placedAt: true,
  confirmedAt: true,
  packedAt: true,
  handedOverAt: true,
  deliveredAt: true,
  cancelledAt: true,
  returnedAt: true,
} satisfies Prisma.OrderSelect;

/**
 * One order's life for the customer whose order it is (his account, or the browser that placed it; anyone else gets
 * null, like a missing order). The added and removed pieces are named as the order stored them.
 */
export async function orderLifecycle(deps: AccountsDeps, input: { storeId: number; number: string; customerId: string | null; visitorId: string | null }): Promise<LifeStep[] | null> {
  checkStoreId(input.storeId);
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: input.storeId, number: input.number } }, select: LIFE_SELECT });
  const his = !!o && o.status !== 'DRAFT' && !o.archivedAt && ((!!input.customerId && o.customerId === input.customerId) || (!!input.visitorId && o.visitorId === input.visitorId));
  if (!o || !his) return null;
  const rows = await deps.db.orderEvent.findMany({
    where: { storeId: input.storeId, orderId: o.id, type: { in: [...LIFE_EVENT_TYPES] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
    select: { type: true, actorType: true, createdAt: true, data: true },
  });
  // the pieces an add-on row or its removal names (the row keeps the line's id)
  const itemIds = [
    ...new Set(
      rows.flatMap((r) => {
        const id = r.type === 'order.addLine' || r.type === 'order.removeLine' ? (r.data as { itemId?: unknown } | null)?.itemId : null;
        return typeof id === 'string' ? [id] : [];
      }),
    ),
  ];
  const items = itemIds.length
    ? await deps.db.orderItem.findMany({ where: { storeId: input.storeId, orderId: o.id, id: { in: itemIds } }, select: { id: true, productName: true, colourName: true, sizeLabel: true } })
    : [];
  const labelOf = new Map(items.map((i) => [i.id, [i.productName, i.colourName, i.sizeLabel].filter(Boolean).join(' · ')]));
  const events: LifeEventRow[] = rows.map((r) => {
    const itemId = (r.data as { itemId?: unknown } | null)?.itemId;
    return { type: r.type, actorType: r.actorType, at: r.createdAt, data: r.data, line: typeof itemId === 'string' ? (labelOf.get(itemId) ?? null) : null };
  });
  return lifecycleOf({ status: o.status as OrderState, times: o }, events);
}
