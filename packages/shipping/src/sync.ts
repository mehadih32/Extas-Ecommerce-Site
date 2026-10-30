// PR 184 (BACKEND-ARCHITECTURE §6.5.0 mapping rules, §8.3; SIM-F-005, SIM-F-017, SIM-F-018) — the order follows its
// parcel. Whatever the courier reports (a poll, the staff's "Read now", a webhook later) is stored on the parcel first
// (events.ts); then `syncOrder` moves the order through the one order service, never around it: picked up → in
// transit (the pick-up is the hand-over when nobody pressed it), delivered → delivered, returned → returned, partly
// delivered → partly delivered once a person has named the kept pieces (the door record, PR 166). A failed try, an
// address problem, a lost or damaged parcel never move the order: the parcel and the order page show them. Each step is
// its own command with its timeline row and audit row (actor COURIER), so a step that is refused (the order is on hold,
// its cancel is waiting for the courier's answer) is simply left for a person and tried again on the next read.
//
// The courier's "out for delivery" is not an order status; it is written once per trip on the order's timeline as
// `shipment.outForDelivery`, which starts the out-for-delivery and delivery-day messages (follow-up 283, PR 148).
//
// Nothing here moves money, changes COD or decides a refund: a door's money is the payments service's (PR 166).
import { isV6 } from '@extas/inventory';
import { isOrdersError, orderStep, type By, type OrdersDeps } from '@extas/orders';
import type { ShippingDeps } from './context';
import { orderMovesFor, type OrderMove, type ShipmentStatus } from './pure';
import { holdsDelivered } from './truth';
import { reportParcelToErp, type ErpParcelReport } from './erp-v6';

/** The order's timeline type for the courier's "out for delivery" (`@extas/messages` OUT_FOR_DELIVERY_EVENT). */
export const OUT_FOR_DELIVERY_EVENT = 'shipment.outForDelivery';

/** The courier acting through its reports. */
export const courierBy = (provider: string | null): By => ({ actorType: 'COURIER', actorId: null, source: provider ? `courier:${provider}` : 'courier' });

/** Refusals that mean "not now": the order waits for a person (on hold, cancel pending …) and is tried again later. */
const WAITS = new Set(['ILLEGAL_TRANSITION', 'NOT_BOOKED', 'CANCEL_PENDING', 'STALE', 'IN_REVIEW']);

export interface Synced {
  orderId: string;
  /** The order steps run now, in order. */
  moved: OrderMove[];
  /** Why a step did not run (the order service's refusal code), or null. */
  waits: string | null;
  /** The courier's "out for delivery" was written on the order's timeline now. */
  outForDelivery: boolean;
  /** PR 611: what went to the ERP (v6 only). */
  erp?: ErpParcelReport;
}

const ordersDeps = (deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/** Parcel states that say nothing about the order (the booking is the order service's; a cancel is a person's, D5). */
const SILENT: ReadonlySet<ShipmentStatus> = new Set(['BOOKING', 'BOOKING_FAILED', 'CANCEL_REQUESTED', 'CANCELLED']);

/** Options the later PRs of the stage add to one sync (PR 525: hold a "delivered" that a person must check first). */
export interface SyncHooks {
  holdDelivered?: (s: { id: string; orderId: string; storeId: number }) => Promise<boolean>;
}

/** The hooks every sync of the shop runs with: PR 525's true-delivery check holds a contradicted "Delivered". */
export function shopHooks(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>): SyncHooks {
  return { holdDelivered: (s) => holdsDelivered(deps, s) };
}

/**
 * Moves one parcel's order to where the parcel is (see the file header). Safe to run any number of times: a step the
 * order already passed is not planned again, and a refused one is reported, not thrown.
 */
export async function syncOrder(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, ref: { storeId: number; shipmentId: string }, hooks: SyncHooks = shopHooks(deps)): Promise<Synced | null> {
  const s = await deps.db.shipment.findFirst({
    where: { id: ref.shipmentId, storeId: ref.storeId },
    select: { id: true, storeId: true, orderId: true, status: true, codCollectedMinor: true, pickedAt: true, deliveredAt: true, returnedAt: true, courierAccount: { select: { providerKey: true } }, order: { select: { status: true } } },
  });
  if (!s || SILENT.has(s.status)) return null;
  // the order's own active parcel only (an older failed or cancelled try never speaks for it)
  const active = await deps.db.shipment.findFirst({ where: { storeId: s.storeId, orderId: s.orderId, status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (active?.id !== s.id) return null;
  const out: Synced = { orderId: s.orderId, moved: [], waits: null, outForDelivery: false };
  const by = courierBy(s.courierAccount.providerKey);
  let kept: string[] | null = null;
  if (s.status === 'PARTIALLY_DELIVERED') {
    // the kept pieces as a person recorded them at the door (a partial still waiting for our approval does not count)
    const door = await deps.db.codCollection.findFirst({
      where: { storeId: s.storeId, orderId: s.orderId, outcome: 'PARTIAL', state: { in: ['RECORDED', 'APPROVED'] }, OR: [{ shipmentId: s.id }, { shipmentId: null }] },
      orderBy: { createdAt: 'desc' },
      select: { keptItemIds: true },
    });
    kept = door?.keptItemIds ?? null;
  }
  const holdDelivered = s.status === 'DELIVERED' && hooks.holdDelivered ? await hooks.holdDelivered(s) : false;
  const moves = orderMovesFor(s, s.order.status, { keptItemIds: kept, holdDelivered });
  const atOf: Record<OrderMove, Date | null> = { courierPickedUp: s.pickedAt, delivered: s.deliveredAt, partiallyDelivered: s.deliveredAt, returned: s.returnedAt };
  for (const step of moves) {
    try {
      const at = atOf[step];
      await orderStep(ordersDeps(deps), { storeId: s.storeId, orderId: s.orderId }, by, step, { ...(at ? { at } : {}), ...(step === 'partiallyDelivered' && kept ? { keptItemIds: kept } : {}), ...(step === 'returned' && (s.codCollectedMinor ?? 0) > 0 ? { chargePaidMinor: s.codCollectedMinor! } : {}) }, { eventData: { shipmentId: s.id, courierStatus: s.status } });
      out.moved.push(step);
    } catch (e) {
      if (isOrdersError(e) && WAITS.has(e.code)) {
        out.waits = e.code;
        break;
      }
      throw e;
    }
  }
  if (s.status === 'OUT_FOR_DELIVERY') out.outForDelivery = await noteOutForDelivery(deps, s, by);
  // PR 611 (ERP contract v6): the pickup and every courier result go to the ERP. A failure here never stops the order
  // following its parcel: the tracking run's catch-up (`reportErpLagging`) sends it later.
  if (await isV6(deps, s.storeId)) {
    try {
      out.erp = await reportParcelToErp(deps, { storeId: s.storeId, shipmentId: s.id });
    } catch (e) {
      out.erp = { shipment: false, delivery: false, waits: `ERROR: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) };
    }
  }
  return out;
}

/**
 * Follow-up 283: one `shipment.outForDelivery` on the order's timeline for each time the courier took the parcel out
 * (a second trip after a failed try is a second one; the messages' own dedupe still sends the customer one message).
 */
async function noteOutForDelivery(deps: Pick<ShippingDeps, 'db'>, s: { id: string; storeId: number; orderId: string }, by: By): Promise<boolean> {
  const trips = (await deps.db.shipmentEvent.findMany({ where: { shipmentId: s.id, status: 'OUT_FOR_DELIVERY' }, select: { data: true, occurredAt: true } })).filter((e) => (e.data as { unmapped?: boolean } | null)?.unmapped !== true);
  const noted = await deps.db.orderEvent.count({ where: { storeId: s.storeId, orderId: s.orderId, type: OUT_FOR_DELIVERY_EVENT, data: { path: ['shipmentId'], equals: s.id } } });
  if (!trips.length || noted >= trips.length) return false;
  await deps.db.orderEvent.create({ data: { storeId: s.storeId, orderId: s.orderId, type: OUT_FOR_DELIVERY_EVENT, actorType: by.actorType, actorId: by.actorId, source: by.source, data: { shipmentId: s.id, trip: noted + 1 } } });
  return true;
}

/**
 * The orders whose parcel is ahead of them (a parcel finished while the order was on hold, a read whose order step
 * failed, a parcel the worker no longer reads because it is finished): each one synced again. Bounded by `batch`.
 */
export async function syncLagging(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, storeId: number, batch: number, hooks: SyncHooks = shopHooks(deps)): Promise<{ checked: number; moved: number }> {
  const rows = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT s."id"::text AS id
    FROM "Shipment" s JOIN "Order" o ON o."id" = s."orderId"
    WHERE s."storeId" = ${storeId} AND o."archivedAt" IS NULL
      -- PR 525: a "Delivered" a person must check first is not caught up
      AND NOT EXISTS (SELECT 1 FROM "DeliveryCheck" d WHERE d."shipmentId" = s."id" AND d."state"::text = 'OPEN')
      AND (
        (s."status"::text IN ('PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','ATTEMPT_FAILED','ADDRESS_PROBLEM','LOST','DAMAGED','RETURNING','DELIVERED','PARTIALLY_DELIVERED','RETURNED')
          AND o."status"::text IN ('CONFIRMED','PROCESSING','PACKED','HANDED_OVER'))
        OR (o."status"::text = 'IN_TRANSIT' AND (
          s."status"::text IN ('DELIVERED','RETURNED')
          -- a partial moves the order only once a person named the kept pieces
          OR (s."status"::text = 'PARTIALLY_DELIVERED' AND EXISTS (
            SELECT 1 FROM "CodCollection" c WHERE c."storeId" = s."storeId" AND c."orderId" = s."orderId" AND c."outcome"::text = 'PARTIAL' AND c."state"::text IN ('RECORDED','APPROVED')))
        ))
      )
    ORDER BY s."updatedAt" ASC
    LIMIT ${Math.max(0, batch)}`;
  let moved = 0;
  for (const r of rows) {
    const x = await syncOrder(deps, { storeId, shipmentId: r.id }, hooks);
    if (x?.moved.length) moved += 1;
  }
  return { checked: rows.length, moved };
}
