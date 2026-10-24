// PR 175 (SIM-F-017; BACKEND-ARCHITECTURE §6.5.2, §7.7) — a parcel's events and the state they give it. Whatever
// reports on a parcel (the booking's answer, a tracking poll, a courier webhook later in PR 184, a person) goes through
// `applyEvents`: under the parcel's row lock the events are stored once each (the courier's event id is unique per
// parcel, so a repeated poll or webhook adds nothing), and the parcel's state is worked out again from all its events
// (pure.ts `stateOf`: the newest understood event wins, a late old event never moves it back, a finished parcel stays
// finished). A courier word the adapter does not know is stored raw and flagged, never guessed.
//
// Staff record what the courier told them on the phone (a failed try, an address problem, lost, damaged) with a reason
// from the list (`recordException`): the same event store, marked as staff's, with the audit row. Nothing here moves
// money or changes the order: the order's own status follows in PR 184.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EXCEPTION_REASONS, type CourierEvent, type ExceptionState } from '@extas/adapters';
import type { Prisma } from '@extas/db/client';
import { allow, logChange, nowOf, parse, TX, type ShippingDeps, type Tx, type Who } from './context';
import { ShippingError } from './errors';
import { EXCEPTION_STATUSES, FINAL_STATES, stateOf, type EventFact, type ShipmentStatus } from './pure';

/** Where an event came from. */
export type EventSource = 'booking' | 'poll' | 'webhook' | 'staff';

export interface Applied {
  shipmentId: string;
  /** Events stored now (a repeat of a known event is not stored again). */
  added: number;
  /** Events whose courier word is not in the adapter's table (stored raw, flagged). */
  unmapped: number;
  from: ShipmentStatus;
  status: ShipmentStatus;
  changed: boolean;
}

interface EventData {
  unmapped?: true;
  codCollectedMinor?: number;
  chargeMinor?: number;
}

const EVENT_FACT_SELECT = { status: true, rawStatus: true, reasonKey: true, occurredAt: true, createdAt: true, data: true } as const;

function factOf(row: Prisma.ShipmentEventGetPayload<{ select: typeof EVENT_FACT_SELECT }>): EventFact {
  const d = (row.data ?? {}) as EventData;
  return {
    status: row.status,
    mapped: d.unmapped !== true,
    rawStatus: row.rawStatus,
    reasonKey: row.reasonKey,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    codCollectedMinor: typeof d.codCollectedMinor === 'number' ? d.codCollectedMinor : null,
    chargeMinor: typeof d.chargeMinor === 'number' ? d.chargeMinor : null,
  };
}

/** Locks one parcel of the store (and only it) for the rest of the transaction. */
export async function lockShipment(tx: Tx, storeId: number, shipmentId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Shipment" WHERE "id" = ${shipmentId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new ShippingError('NOT_FOUND', 'no such parcel', ['shipmentId']);
  return tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
}

/**
 * Stores `events` on the parcel (each once) and works its state out again, inside `tx` (the caller's transaction, under
 * the parcel's lock taken here). `actorId`: the staff member, for staff events.
 */
export async function applyEventsIn(tx: Tx, ref: { storeId: number; shipmentId: string }, events: readonly CourierEvent[], source: EventSource, opts: { now: Date; actorId?: string | null } = { now: new Date() }): Promise<Applied> {
  const current = await lockShipment(tx, ref.storeId, ref.shipmentId);
  const rows: Prisma.ShipmentEventCreateManyInput[] = events.map((e) => {
    const data: EventData = {};
    if (!e.status) data.unmapped = true;
    if (e.codCollectedMinor !== null) data.codCollectedMinor = e.codCollectedMinor;
    if (e.chargeMinor !== null) data.chargeMinor = e.chargeMinor;
    return {
      storeId: ref.storeId,
      shipmentId: ref.shipmentId,
      // an unknown word keeps the parcel's state on its row; `data.unmapped` says it was not understood
      status: (e.status ?? current.status) as ShipmentStatus,
      rawStatus: e.rawStatus.slice(0, 120),
      message: e.note?.slice(0, 500) ?? null,
      reasonKey: e.reasonKey,
      occurredAt: e.occurredAt,
      providerEventId: e.providerEventId.slice(0, 200),
      source,
      data: Object.keys(data).length ? (data as Prisma.InputJsonObject) : undefined,
      actorId: opts.actorId ?? null,
    };
  });
  const added = rows.length ? (await tx.shipmentEvent.createMany({ data: rows, skipDuplicates: true })).count : 0;
  const all = await tx.shipmentEvent.findMany({ where: { shipmentId: ref.shipmentId }, select: EVENT_FACT_SELECT });
  const next = stateOf(current, all.map(factOf));
  const data: Prisma.ShipmentUpdateInput = {};
  if (next.status !== current.status) data.status = next.status;
  if (next.providerStatus !== current.providerStatus) data.providerStatus = next.providerStatus;
  if (next.exceptionKey !== current.exceptionKey) data.exceptionKey = next.exceptionKey;
  // the earliest the events say (a late old event can move a date earlier, never later)
  for (const k of ['pickedAt', 'deliveredAt', 'returnedAt'] as const) {
    const v = next[k];
    if (v && (!current[k] || v.getTime() < current[k]!.getTime())) data[k] = v;
  }
  if (next.codCollectedMinor !== current.codCollectedMinor) data.codCollectedMinor = next.codCollectedMinor;
  if (next.chargeMinor !== current.chargeMinor) data.chargeMinor = next.chargeMinor;
  if (source === 'poll') data.lastTrackedAt = opts.now;
  if (Object.keys(data).length) await tx.shipment.update({ where: { id: ref.shipmentId }, data });
  return { shipmentId: ref.shipmentId, added, unmapped: events.filter((e) => !e.status).length, from: current.status, status: next.status, changed: next.status !== current.status };
}

/** `applyEventsIn` in its own transaction. */
export function applyEvents(deps: Pick<ShippingDeps, 'db' | 'now'>, ref: { storeId: number; shipmentId: string }, events: readonly CourierEvent[], source: EventSource): Promise<Applied> {
  return deps.db.$transaction((tx) => applyEventsIn(tx, ref, events, source, { now: nowOf(deps) }), TX);
}

export const exceptionInput = z
  .object({
    status: z.enum(EXCEPTION_STATUSES),
    reasonKey: z.string().trim().min(1).max(60),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => (EXCEPTION_REASONS[v.status as ExceptionState] as readonly string[]).includes(v.reasonKey), { message: 'not a reason of this exception', path: ['reasonKey'] });

/**
 * SIM-F-017 — staff record an exception the courier told them about (a failed try, an address problem, lost, damaged)
 * with its reason and a note. Only on a parcel the courier holds; the parcel shows it at once; audited.
 */
export async function recordException(deps: ShippingDeps, who: Who, shipmentId: string, input: unknown): Promise<Applied> {
  await allow(deps, who, 'delivery.exceptions');
  const v = parse(exceptionInput, input, 'exception');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const s = await lockShipment(tx, who.storeId, shipmentId);
    if (FINAL_STATES.has(s.status) || !s.consignmentId || s.status === 'CANCEL_REQUESTED') throw new ShippingError('NOT_ACTIVE', 'the courier does not hold this parcel now', ['shipmentId'], { status: s.status });
    const event: CourierEvent = { providerEventId: `staff:${randomUUID()}`, status: v.status, rawStatus: `staff:${v.status.toLowerCase()}`, occurredAt: now, note: v.note ?? null, reasonKey: v.reasonKey, codCollectedMinor: null, chargeMinor: null };
    const r = await applyEventsIn(tx, { storeId: who.storeId, shipmentId }, [event], 'staff', { now, actorId: who.actor.staffUserId });
    await logChange(tx, who, 'shipment.exception', 'Shipment', shipmentId, { status: r.from }, { status: r.status, exception: v.status, reasonKey: v.reasonKey, note: v.note ?? null });
    return r;
  }, TX);
}
