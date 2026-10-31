// PR 175 — the parcels as staff see them (BACKEND-ARCHITECTURE §5.6 DLV-03): the list by state (with the courier now,
// the exceptions of SIM-F-017, failed bookings, finished) and one parcel with every event, newest first — the courier's
// words beside the shop's state, the exception reason, who recorded a staff event. Read only.
// PR 184 (SIM-F-018): the `late` view — parcels still with the courier past their order's band promise (its most hours
// from placing, plus the owner's grace hours of `account.track.late`, the same promise the customer's page keeps).
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, nowOf, parse, setting, type ShippingDeps, type Who } from './context';
import { orderPromises, promiseDueBy } from '@extas/delivery/promise';
import { ShippingError } from './errors';
import { ACTIVE_STATES, EXCEPTION_STATUSES, type ShipmentStatus } from './pure';

const HOUR_MS = 3_600_000;

export const PARCEL_VIEWS = ['active', 'late', 'exceptions', 'failed', 'finished', 'all'] as const;
export type ParcelView = (typeof PARCEL_VIEWS)[number];

const WHERE: Record<Exclude<ParcelView, 'late'>, Prisma.ShipmentWhereInput> = {
  active: { status: { in: [...ACTIVE_STATES, 'BOOKING', 'CANCEL_REQUESTED'] satisfies ShipmentStatus[] } },
  exceptions: { status: { in: [...EXCEPTION_STATUSES] } },
  failed: { status: 'BOOKING_FAILED' },
  finished: { status: { in: ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'] satisfies ShipmentStatus[] } },
  all: {},
};

export const parcelQuery = z
  .object({
    view: z.enum(PARCEL_VIEWS).default('active'),
    courierAccountId: z.uuid().optional(),
    orderId: z.uuid().optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const ROW_SELECT = {
  id: true,
  orderId: true,
  order: { select: { number: true } },
  courierAccountId: true,
  courierAccount: { select: { name: true, providerKey: true } },
  consignmentId: true,
  trackingCode: true,
  status: true,
  providerStatus: true,
  exceptionKey: true,
  mode: true,
  attempt: true,
  codAmountMinor: true,
  codCollectedMinor: true,
  chargeMinor: true,
  declaredValueMinor: true,
  weightGrams: true,
  bookingError: true,
  bookedAt: true,
  pickedAt: true,
  deliveredAt: true,
  returnedAt: true,
  lastTrackedAt: true,
  createdAt: true,
} as const;

export type ParcelRow = Prisma.ShipmentGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * SIM-F-018 — the store's parcels still with the courier and past their promise, plus the grace hours: the promise the
 * checkout gave (review R3, customer M2/M3: @extas/delivery `orderPromises` — the district's own hours, counted from
 * the shop's first day back for an order placed during the holiday break, none for "may arrive after Eid"). A band
 * without hours or an address the shop could not settle is never late.
 */
export async function lateParcelIds(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<string[]> {
  const grace = (await setting(deps, storeId, 'account.track.late')).graceHours;
  const now = nowOf(deps);
  const rows = await deps.db.shipment.findMany({
    where: { storeId, status: { in: [...ACTIVE_STATES] }, order: { archivedAt: null, addressUnclear: false, deliveryBandId: { not: null } } },
    select: { id: true, order: { select: { id: true, placedAt: true, areaId: true, deliveryBand: { select: { key: true, hoursMin: true, hoursMax: true } } } } },
  });
  const promises = await orderPromises(deps, storeId, rows.map((r) => ({ id: r.order.id, placedAt: r.order.placedAt, areaId: r.order.areaId, band: r.order.deliveryBand })));
  const graceMs = Math.max(0, grace) * HOUR_MS;
  return rows.filter((r) => {
    const due = promiseDueBy(promises.get(r.order.id));
    return !!due && due.getTime() + graceMs < now.getTime();
  }).map((r) => r.id);
}

/** PR 148 follow-up (SIM-F-053) — the order's timeline type for a parcel past its promise (`@extas/messages` LATE_EVENT). */
export const LATE_EVENT = 'shipment.late';

/**
 * PR 148 follow-up — each late parcel (`lateParcelIds`) gets one `shipment.late` row on its order's timeline, once per
 * parcel: the team sees it on the order, and the "late apology" notice (off as shipped) starts from it. Up to `batch`
 * parcels a run; nothing else changes.
 */
export async function noteLateParcels(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, storeId: number, batch: number): Promise<{ noted: number }> {
  const ids = await lateParcelIds(deps, storeId);
  if (!ids.length) return { noted: 0 };
  const parcels = await deps.db.shipment.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, orderId: true }, orderBy: { createdAt: 'asc' } });
  const done = new Set(
    (await deps.db.orderEvent.findMany({ where: { storeId, type: LATE_EVENT, orderId: { in: parcels.map((p) => p.orderId) } }, select: { data: true } })).map((e) => (e.data as { shipmentId?: string } | null)?.shipmentId),
  );
  const todo = parcels.filter((p) => !done.has(p.id)).slice(0, batch);
  if (todo.length) {
    await deps.db.orderEvent.createMany({ data: todo.map((p) => ({ storeId, orderId: p.orderId, type: LATE_EVENT, actorType: 'SYSTEM' as const, actorId: null, source: 'courier.track', data: { shipmentId: p.id } })) });
  }
  return { noted: todo.length };
}

/** The store's parcels in one view, newest first. */
export async function listParcels(deps: ShippingDeps, who: Who, query: unknown = {}): Promise<{ rows: ParcelRow[]; next: string | null; counts: Record<ParcelView, number> }> {
  await allow(deps, who, 'delivery.parcels');
  const q = parse(parcelQuery, query, 'parcel list query');
  const base: Prisma.ShipmentWhereInput = { storeId: who.storeId, ...(q.courierAccountId ? { courierAccountId: q.courierAccountId } : {}), ...(q.orderId ? { orderId: q.orderId } : {}) };
  const where: Record<ParcelView, Prisma.ShipmentWhereInput> = { ...WHERE, late: { id: { in: await lateParcelIds(deps, who.storeId) } } };
  const [rows, ...counts] = await Promise.all([
    deps.db.shipment.findMany({
      where: { ...base, ...where[q.view] },
      select: ROW_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    ...PARCEL_VIEWS.map((v) => deps.db.shipment.count({ where: { ...base, ...where[v] } })),
  ]);
  const more = rows.length > q.limit;
  const page = more ? rows.slice(0, q.limit) : rows;
  return { rows: page, next: more ? page[page.length - 1]!.id : null, counts: Object.fromEntries(PARCEL_VIEWS.map((v, i) => [v, counts[i]!])) as Record<ParcelView, number> };
}

/** One parcel with the receiver block sent, the note, and every event, newest first. */
export async function getParcel(deps: ShippingDeps, who: Who, shipmentId: string) {
  await allow(deps, who, 'delivery.parcels');
  const s = await deps.db.shipment.findFirst({
    where: { id: shipmentId, storeId: who.storeId },
    select: {
      ...ROW_SELECT,
      merchantRef: true,
      receiver: true,
      bookingNote: true,
      courierCityId: true,
      courierZoneId: true,
      courierAreaId: true,
      cancelRequestedAt: true,
      cancelOutcome: true,
      events: {
        select: { id: true, status: true, rawStatus: true, reasonKey: true, message: true, riderNote: true, source: true, data: true, actorId: true, occurredAt: true, createdAt: true },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
  });
  if (!s) throw new ShippingError('NOT_FOUND', 'no such parcel', ['shipmentId']);
  return s;
}
