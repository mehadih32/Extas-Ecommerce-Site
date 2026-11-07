// S05 · PR 150 — the read side of his whole order history and of one order's life (lifecycle.ts says what each shows).
// Read for the signed-in customer only, in his store, as the order stores it; nothing here moves an order (CN-022).
import type { Prisma } from '@extas/db/client';
import { checkStoreId, setting, type AccountsDeps } from './context';
import { cardsOf, orderWhere, type OrderCard } from './dashboard';
import { LIFE_EVENT_TYPES, lifecycleOf, ORDER_SHOWS, parcelStepsOf, SHOW_STATES, showOf, type LifeEventRow, type LifeStep, type OrderShow } from './lifecycle';
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
 * null, like a missing order). The added, removed and resized pieces are named as the order stored them; follow-up 300:
 * on the Bengali page (`lang` 'bn') with the product's and the colour's Bengali names where the catalogue has them (the
 * size from the SKU the row names, so a resized line still reads its old size), else the stored English words.
 * Follow-up 303: `courier` (the page's `account.track.courier`) adds the courier's own steps of his parcels (never an
 * exchange's own parcel); off, the parcels are not read at all.
 */
export async function orderLifecycle(
  deps: AccountsDeps,
  input: { storeId: number; number: string; customerId: string | null; visitorId: string | null; lang?: 'en' | 'bn'; courier?: { enabled: boolean; exceptions: boolean } },
): Promise<LifeStep[] | null> {
  checkStoreId(input.storeId);
  const o = await deps.db.order.findUnique({ where: { storeId_number: { storeId: input.storeId, number: input.number } }, select: LIFE_SELECT });
  const his = !!o && o.status !== 'DRAFT' && !o.archivedAt && ((!!input.customerId && o.customerId === input.customerId) || (!!input.visitorId && o.visitorId === input.visitorId));
  if (!o || !his) return null;
  const courier = input.courier?.enabled ? input.courier : null;
  const [rows, parcels] = await Promise.all([
    deps.db.orderEvent.findMany({
      where: { storeId: input.storeId, orderId: o.id, type: { in: [...LIFE_EVENT_TYPES] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
      select: { type: true, actorType: true, createdAt: true, data: true },
    }),
    courier
      ? deps.db.shipment.findMany({
          where: { storeId: input.storeId, orderId: o.id, isExchangeLeg: false },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 10,
          select: { status: true, bookedAt: true, events: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 100, select: { status: true, occurredAt: true } } },
        })
      : [],
  ]);
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
  const bn = input.lang === 'bn' ? await bengaliLabels(deps, input.storeId, o.id, rows) : null;
  const events: LifeEventRow[] = rows.map((r) => {
    const itemId = (r.data as { itemId?: unknown } | null)?.itemId;
    const line = typeof itemId === 'string' ? (bn?.item(itemId, null) ?? labelOf.get(itemId) ?? null) : null;
    return { type: r.type, actorType: r.actorType, at: r.createdAt, data: bn && r.type === 'order.edit' ? bn.edit(r.data) : r.data, line };
  });
  const parcel = courier ? parcelStepsOf(parcels.map((p) => ({ status: p.status, bookedAt: p.bookedAt, events: p.events.map((e) => ({ status: e.status, at: e.occurredAt })) })), courier) : [];
  return lifecycleOf({ status: o.status as OrderState, times: o }, events, parcel);
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Follow-up 300 — the Bengali words for the pieces the rows name: each line's product and colour in Bengali (the stored
 * English when the catalogue has none, or the variant is gone), with the size of the SKU the row names. Two queries.
 */
async function bengaliLabels(deps: AccountsDeps, storeId: number, orderId: string, rows: readonly { type: string; data: unknown }[]) {
  const ids = new Set<string>();
  const skus = new Set<string>();
  for (const r of rows) {
    const d = rec(r.data);
    if (r.type === 'order.addLine' || r.type === 'order.removeLine') {
      const id = str(d.itemId);
      if (id) ids.add(id);
      const sku = str(d.sku);
      if (sku) skus.add(sku);
    }
    if (r.type === 'order.edit')
      for (const l of Array.isArray(d.lines) ? d.lines : []) {
        const x = rec(l);
        const id = str(x.lineId);
        if (id) ids.add(id);
        for (const k of [x.sku, x.toSku]) if (str(k)) skus.add(k as string);
      }
  }
  const items = ids.size
    ? await deps.db.orderItem.findMany({
        where: { storeId, orderId, id: { in: [...ids] } },
        select: { id: true, sku: true, variantId: true, productName: true, colourName: true, sizeLabel: true },
      })
    : [];
  const variantIds = items.flatMap((i) => (i.variantId ? [i.variantId] : []));
  const vs =
    variantIds.length || skus.size
      ? await deps.db.productVariant.findMany({
          where: { storeId, OR: [{ id: { in: variantIds } }, { sku: { in: [...skus] } }] },
          select: { id: true, sku: true, product: { select: { nameBn: true } }, colour: { select: { nameBn: true } }, size: { select: { label: true } } },
        })
      : [];
  const sizeOf = new Map(vs.map((v) => [v.sku, v.size?.label ?? null]));
  const lookOf = new Map(vs.map((v) => [v.id, v]));
  const byId = new Map(items.map((i) => [i.id, i]));
  /** One piece in Bengali: its line's names with the size of `sku` (the line's own SKU when null). */
  const item = (id: string, sku: string | null): string | null => {
    const i = byId.get(id);
    if (!i) return null;
    const size = sizeOf.get(sku ?? i.sku) ?? (sku ? null : i.sizeLabel);
    const v = i.variantId ? lookOf.get(i.variantId) : undefined;
    return [v?.product.nameBn || i.productName, v?.colour?.nameBn || i.colourName, size].filter(Boolean).join(' · ');
  };
  /** An edit row with its lines' words in Bengali (a line the order no longer has keeps the stored words). */
  const edit = (data: unknown): unknown => {
    const d = rec(data);
    if (!Array.isArray(d.lines)) return data;
    const lines = d.lines.map((l) => {
      const x = rec(l);
      const id = str(x.lineId);
      if (!id || !byId.has(id)) return l;
      return { ...x, label: item(id, str(x.sku)) ?? x.label, ...(x.toLabel !== undefined ? { toLabel: (str(x.toSku) ? item(id, str(x.toSku)) : null) ?? x.toLabel } : {}) };
    });
    return { ...d, lines };
  };
  return { item, edit };
}
