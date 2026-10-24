// PR 175 — the parcels as staff see them (BACKEND-ARCHITECTURE §5.6 DLV-03): the list by state (with the courier now,
// the exceptions of SIM-F-017, failed bookings, finished) and one parcel with every event, newest first — the courier's
// words beside the shop's state, the exception reason, who recorded a staff event. Read only.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, parse, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { ACTIVE_STATES, EXCEPTION_STATUSES, type ShipmentStatus } from './pure';

export const PARCEL_VIEWS = ['active', 'exceptions', 'failed', 'finished', 'all'] as const;
export type ParcelView = (typeof PARCEL_VIEWS)[number];

const WHERE: Record<ParcelView, Prisma.ShipmentWhereInput> = {
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

/** The store's parcels in one view, newest first. */
export async function listParcels(deps: ShippingDeps, who: Who, query: unknown = {}): Promise<{ rows: ParcelRow[]; next: string | null; counts: Record<ParcelView, number> }> {
  await allow(deps, who, 'delivery.parcels');
  const q = parse(parcelQuery, query, 'parcel list query');
  const base: Prisma.ShipmentWhereInput = { storeId: who.storeId, ...(q.courierAccountId ? { courierAccountId: q.courierAccountId } : {}), ...(q.orderId ? { orderId: q.orderId } : {}) };
  const [rows, ...counts] = await Promise.all([
    deps.db.shipment.findMany({
      where: { ...base, ...WHERE[q.view] },
      select: ROW_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    ...PARCEL_VIEWS.map((v) => deps.db.shipment.count({ where: { ...base, ...WHERE[v] } })),
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
