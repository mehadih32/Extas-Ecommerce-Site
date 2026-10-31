// S06 · PR 522 — multi-order bundling: several separate orders of one person inside a window become one group and one
// parcel, with a note, instead of five parcels (setting `risk.bundling`, off as shipped; the window empty until the owner
// sets it).
//
// The same person: the same identity (PR 519, with every identity merged into it) or the same number. Only orders that
// can still share a parcel join: open and not with a courier (placed, waiting for an advance, confirmed or on hold), not
// a gift (its receiver is someone else), a delivery, and to the same address as typed (spaces, case and punctuation
// aside), placed within the owner's hours before the new one. A group never holds more than the owner's most orders.
//
// The moment an order lands (switch on): "propose" (as shipped) marks it ("One parcel?") with the orders it would join,
// on its timeline, for a person to press "One parcel" (`orders.merge`); "group" puts them in one group by itself, the
// note naming every order. Each order keeps its own lines, prices, charges and payments; nothing is cancelled, held or
// blocked, and the customer is told nothing. The group is the merge's (PR 145) `OrderGroup`; an earlier group is joined.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, setting, TX, type OrdersDeps, type Who } from './context';
import { OrdersError, isOrdersError } from './errors';
import { clusterFamily, clusterOfOrder } from './identity-family';
import { phoneForms } from './phone-history';
import type { OrderState } from './pure';
import { auditRow, eventRow, execute, factsOf, lockOrder, NOT_BOOKED_SHIPMENT, staffBy, systemBy, type By } from './service';

/** The order flag of a proposal (Order.flags; the team's screens show it, never the customer). */
export const BUNDLE_FLAG = 'BUNDLE_PROPOSED';
/** The timeline types: the proposal, and an order put in the parcel. */
export const BUNDLE_PROPOSED_EVENT = 'order.bundleProposal';
export const BUNDLED_EVENT = 'order.bundled';
/** The group's reason (OrderGroup.reason; a merge from a review is MERGE). */
export const BUNDLE_REASON = 'BUNDLE';

/** Where an order may still share a parcel: open, not handed to a courier. */
export const BUNDLEABLE: readonly OrderState[] = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD'];

const HOUR_MS = 60 * 60 * 1000;
const NOTE_MAX = 2_000;

/** The address as the parcel goes: case, spaces and punctuation aside. */
export function addressKey(text: string | null | undefined): string | null {
  const k = (text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return k || null;
}

export interface BundleMate {
  orderId: string;
  number: string;
}

export interface BundlePlan {
  /** The group the parcel joins (one an order is in already), or null for a new one. */
  groupId: string | null;
  /** The other orders that join, oldest first. */
  with: BundleMate[];
}

const ORDER_SELECT = { id: true, number: true, status: true, phone: true, shippingAddressText: true, isGift: true, fulfillmentType: true, cancelPending: true, placedAt: true, orderGroupId: true, archivedAt: true } as const;

/** The same person's other orders that can share this order's parcel now, within `windowHours`. */
export async function bundlePlan(deps: OrdersDeps, storeId: number, orderId: string, cfg: { windowHours: number; maxOrders: number }): Promise<BundlePlan | null> {
  const o = await deps.db.order.findFirst({ where: { storeId, id: orderId }, select: { ...ORDER_SELECT, shipments: { where: { status: { notIn: [...NOT_BOOKED_SHIPMENT] } }, select: { id: true }, take: 1 } } });
  const key = addressKey(o?.shippingAddressText);
  if (!o || !key || o.archivedAt || o.isGift || o.fulfillmentType !== 'DELIVERY' || o.cancelPending || o.shipments.length || !BUNDLEABLE.includes(o.status as OrderState)) return null;
  const clusterId = await clusterOfOrder(deps.db, storeId, orderId);
  const family = clusterId ? await clusterFamily(deps.db, storeId, clusterId) : [];
  const linked = family.length
    ? (await deps.db.identityLink.findMany({ where: { storeId, clusterId: { in: family }, orderId: { not: null } }, select: { orderId: true }, distinct: ['orderId'] })).flatMap((l) => (l.orderId ? [l.orderId] : []))
    : [];
  const forms = phoneForms(o.phone);
  const same: Prisma.OrderWhereInput[] = [...(forms.length ? [{ phone: { in: forms } }] : []), ...(linked.length ? [{ id: { in: linked } }] : [])];
  if (!same.length) return null;
  const rows = await deps.db.order.findMany({
    where: {
      storeId,
      id: { not: o.id },
      OR: same,
      status: { in: [...BUNDLEABLE] },
      isGift: false,
      fulfillmentType: 'DELIVERY',
      cancelPending: false,
      archivedAt: null,
      placedAt: { gte: new Date(o.placedAt.getTime() - cfg.windowHours * HOUR_MS), lte: o.placedAt },
      shipments: { none: { status: { notIn: [...NOT_BOOKED_SHIPMENT] } } },
    },
    select: ORDER_SELECT,
    orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
  });
  const near = rows.filter((r) => addressKey(r.shippingAddressText) === key);
  // the group: the order's own, else the oldest one a mate is in; mates in another group stay where they are
  const groupId = o.orderGroupId ?? near.find((r) => r.orderGroupId)?.orderGroupId ?? null;
  const already = groupId ? near.filter((r) => r.orderGroupId === groupId) : [];
  const free = near.filter((r) => r.orderGroupId === null);
  const inGroup = groupId ? await deps.db.order.count({ where: { storeId, orderGroupId: groupId } }) : 0;
  // the parcel's size once this order is in it, and the room left for the free ones (the oldest first)
  const room = cfg.maxOrders - (o.orderGroupId ? inGroup : inGroup + 1);
  if (room < 0) return null;
  const joining = free.slice(0, room);
  const joinsGroup = !o.orderGroupId && groupId !== null;
  if (!joining.length && !joinsGroup) return null;
  return { groupId, with: [...already, ...joining].map((r) => ({ orderId: r.id, number: r.number })) };
}

export interface BundleApplied {
  action: 'propose' | 'group';
  groupId: string | null;
  with: BundleMate[];
}

/** The note a group made by itself carries: every order in it. */
const autoNote = (numbers: string[]) => `One parcel: ${numbers.join(', ')}`;

/**
 * The look-up the moment an order lands (switch on, window set): the proposal written on the order, or the group made.
 * Nothing else changes; an order that cannot share a parcel any more is left as it is.
 */
export async function bundleOnOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy('bundling')): Promise<BundleApplied | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.bundling');
  if (!cfg.enabled || cfg.windowHours === null) return null;
  const plan = await bundlePlan(deps, ref.storeId, ref.orderId, { windowHours: cfg.windowHours, maxOrders: cfg.maxOrders });
  if (!plan || !plan.with.length) return null;
  if (cfg.action === 'group') {
    try {
      const g = await groupOrders(deps, ref.storeId, [ref.orderId, ...plan.with.map((m) => m.orderId)], by, null);
      return { action: 'group', groupId: g.groupId, with: plan.with };
    } catch (e) {
      if (isOrdersError(e) && (e.code === 'NOT_MERGEABLE' || e.code === 'NOT_FOUND')) return null;
      throw e;
    }
  }
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'bundleProposal',
        input: { with: plan.with.map((m) => m.orderId) },
        effect: async (tx, o) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = row.flags.includes(BUNDLE_FLAG) ? row.flags : [...row.flags, BUNDLE_FLAG];
          return { data: { flags }, eventData: { with: plan.with, groupId: plan.groupId, windowHours: cfg.windowHours }, audit: { before: { flags: row.flags }, after: { flags } } };
        },
      },
      { idempotencyKey: `bundle-proposal:${ref.orderId}` },
    );
  } catch (e) {
    if (isOrdersError(e) && e.code === 'ILLEGAL_TRANSITION') return null;
    throw e;
  }
  return { action: 'propose', groupId: plan.groupId, with: plan.with };
}

export const bundleInput = z.object({ orderId: z.uuid(), note: z.string().trim().max(NOTE_MAX).optional() }).strict();

export interface BundleResult {
  groupId: string;
  orders: { orderId: string; number: string; version: number }[];
}

/** "One parcel" on an order (`orders.merge`): the order with the same person's other open orders, as the setting finds them. */
export async function bundleOrder(deps: OrdersDeps, who: Who, input: unknown): Promise<BundleResult> {
  await allow(deps, who, 'orders.merge');
  const d = parse(bundleInput, input, 'bundle');
  const cfg = await setting(deps, who.storeId, 'risk.bundling');
  if (cfg.windowHours === null) throw new OrdersError('NOT_MERGEABLE', 'the hours of the window are not set', ['windowHours']);
  const plan = await bundlePlan(deps, who.storeId, d.orderId, { windowHours: cfg.windowHours, maxOrders: cfg.maxOrders });
  if (!plan || !plan.with.length) throw new OrdersError('NOT_MERGEABLE', 'no other order can share this parcel now', ['orderId']);
  return groupOrders(deps, who.storeId, [d.orderId, ...plan.with.map((m) => m.orderId)], staffBy(who.actor, who.ctx), d.note ?? null);
}

/** Puts the orders in one group (one parcel), every row locked in one fixed order; each keeps its lines and money. */
export async function groupOrders(deps: OrdersDeps, storeId: number, orderIds: string[], by: By, note: string | null): Promise<BundleResult> {
  const ids = [...new Set(orderIds)].sort();
  if (ids.length < 2) throw new OrdersError('NOT_MERGEABLE', 'two orders or more', ['orderIds']);
  return deps.db.$transaction(async (tx) => {
    const locked = [];
    for (const id of ids) locked.push(await lockOrder(tx, storeId, id));
    for (const o of locked) {
      const f = await factsOf(tx, o);
      if (!BUNDLEABLE.includes(o.status as OrderState) || f.shipment || o.cancelPending) throw new OrdersError('NOT_MERGEABLE', `order ${o.number} is booked or finished`, ['orderIds'], { orderId: o.id, status: o.status });
    }
    const groups = [...new Set(locked.flatMap((o) => (o.orderGroupId ? [o.orderGroupId] : [])))];
    if (groups.length > 1) throw new OrdersError('NOT_MERGEABLE', 'the orders are in different parcels already', ['orderIds']);
    const numbers = [...locked].sort((a, b) => a.number.localeCompare(b.number)).map((o) => o.number);
    const text = note ?? autoNote(numbers);
    const groupId = groups[0] ?? (await tx.orderGroup.create({ data: { storeId, reason: BUNDLE_REASON, note: text, createdById: by.actorId }, select: { id: true } })).id;
    const out: BundleResult['orders'] = [];
    for (const o of locked) {
      const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
      const flags = row.flags.filter((f) => f !== BUNDLE_FLAG);
      const after = await tx.order.update({ where: { id: o.id }, data: { orderGroupId: groupId, flags, version: { increment: 1 } }, select: { version: true } });
      const others = locked.filter((x) => x.id !== o.id).map((x) => ({ orderId: x.id, number: x.number }));
      if (o.orderGroupId !== groupId) await eventRow(tx, by, { storeId, orderId: o.id, type: BUNDLED_EVENT, message: note, data: { groupId, with: others, auto: by.actorType === 'SYSTEM' } });
      await auditRow(tx, by, { storeId, action: 'order.bundle', entityType: 'Order', entityId: o.id, before: { orderGroupId: o.orderGroupId, flags: row.flags, version: o.version }, after: { orderGroupId: groupId, flags, version: after.version } });
      out.push({ orderId: o.id, number: o.number, version: after.version });
    }
    return { groupId, orders: out };
  }, TX);
}

/** The other orders in an order's parcel (its group), oldest first, with the group's note. */
export async function parcelMates(deps: Pick<OrdersDeps, 'db'>, storeId: number, orderId: string): Promise<{ note: string | null; reason: string; orders: BundleMate[] } | null> {
  const o = await deps.db.order.findFirst({ where: { storeId, id: orderId }, select: { orderGroup: { select: { id: true, note: true, reason: true } } } });
  if (!o?.orderGroup) return null;
  const rows = await deps.db.order.findMany({ where: { storeId, orderGroupId: o.orderGroup.id, id: { not: orderId } }, select: { id: true, number: true }, orderBy: [{ placedAt: 'asc' }, { id: 'asc' }] });
  return { note: o.orderGroup.note, reason: o.orderGroup.reason, orders: rows.map((r) => ({ orderId: r.id, number: r.number })) };
}
