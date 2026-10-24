// PR 175 — the parcels as staff see them (BACKEND-ARCHITECTURE §5.6 DLV-03): the list by state (with the courier now,
// the exceptions of SIM-F-017, failed bookings, finished) and one parcel with every event, newest first — the courier's
// words beside the shop's state, the exception reason, who recorded a staff event. Read only.
// PR 184 (SIM-F-018): the `late` view — parcels still with the courier past their order's band promise (its most hours
// from placing, plus the owner's grace hours of `account.track.late`, the same promise the customer's page keeps).
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, nowOf, parse, setting, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { ACTIVE_STATES, EXCEPTION_STATUSES, type ShipmentStatus } from './pure';

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
 * SIM-F-018 — the store's parcels still with the courier and past their promise (pure.ts `lateOf`, in SQL): the band's
 * most hours from placing, plus the grace hours; a band without hours or an address the shop could not settle is never
 * late.
 */
export async function lateParcelIds(deps: Pick<ShippingDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<string[]> {
  const grace = (await setting(deps, storeId, 'account.track.late')).graceHours;
  const now = nowOf(deps);
  const rows = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT s."id"::text AS id
    FROM "Shipment" s
    JOIN "Order" o ON o."id" = s."orderId"
    JOIN "DeliveryBand" b ON b."id" = o."deliveryBandId"
    WHERE s."storeId" = ${storeId} AND o."archivedAt" IS NULL
      AND s."status"::text = ANY(${[...ACTIVE_STATES] as string[]})
      AND b."hoursMax" > 0 AND o."addressUnclear" IS NOT TRUE
      AND o."placedAt" + make_interval(hours => b."hoursMax" + ${grace}::int) < ${now}`;
  return rows.map((r) => r.id);
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
