// PR 526 (SIM-F-005, SIM-F-038; BACKEND-ARCHITECTURE §6.5.5) — why a parcel came back. The courier's word on a door
// outcome (a return, a partial delivery, a failed try) is kept as the rider's note on its event (ShipmentEvent.riderNote,
// written by `applyEventsIn`). A person then records the reason from the owner's own list (`orders.refusal.reasons`:
// didn't like it, size didn't fit, not as in the picture, ordered by mistake …) with the rider's note, on the parcel's
// return record (ReturnRecord.reasonCode, riderNote, courierClaim; one per parcel — the record a true-delivery check or
// the shop's receipt made is completed, never doubled). The reason goes on the order's timeline (`return.reason`), the
// phone history reads it (PR 521) and the reports count it (@extas/metrics `returnReasons`).
//
// Nothing here moves money, changes COD, receives stock or blocks anyone: the return's receipt and QC are PR 189's.
import { OTHER_KEY, staffBy } from '@extas/orders';
import { z } from 'zod';
import { allow, logChange, parse, setting, TX, type Db, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { cameBack, returnKindOf } from './pure';

type Base = Pick<ShippingDeps, 'db' | 'settings' | 'now'>;

/** The order timeline type of a recorded return reason. */
export const RETURN_REASON_EVENT = 'return.reason';

export const returnReasonInput = z
  .object({
    /** A key of the owner's `orders.refusal.reasons`. */
    reasonKey: z.string().trim().min(1).max(60),
    /** The rider's own words (left out: the courier's last note on the parcel is kept). */
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/** What the order page shows about a parcel that came back. */
export interface ReturnReason {
  shipmentId: string;
  /** The parcel's return record, once there is one. */
  returnId: string | null;
  reasonKey: string | null;
  /** The rider's words: the one recorded with the reason, else the courier's last note on a door outcome. */
  riderNote: string | null;
}

async function lastRiderNote(deps: Pick<ShippingDeps, 'db'>, storeId: number, shipmentId: string): Promise<string | null> {
  const e = await deps.db.shipmentEvent.findFirst({ where: { storeId, shipmentId, riderNote: { not: null } }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], select: { riderNote: true } });
  return e?.riderNote ?? null;
}

/** The parcel's return record: the one on this parcel, else the order's own record without a parcel (the oldest). */
function returnOf(db: Db, storeId: number, orderId: string, shipmentId: string) {
  return db.returnRecord.findFirst({ where: { storeId, OR: [{ shipmentId }, { orderId, shipmentId: null }] }, orderBy: { createdAt: 'asc' }, select: { id: true, reasonCode: true, riderNote: true, shipmentId: true } });
}

/** The order's last parcel, when it came back (or the order says it did); else null. */
export async function returnReasonOf(deps: Pick<ShippingDeps, 'db'>, storeId: number, orderId: string): Promise<ReturnReason | null> {
  const s = await deps.db.shipment.findFirst({ where: { storeId, orderId }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, order: { select: { status: true } } } });
  if (!s || !cameBack(s.status, s.order.status)) return null;
  const [r, note] = await Promise.all([returnOf(deps.db, storeId, orderId, s.id), lastRiderNote(deps, storeId, s.id)]);
  return { shipmentId: s.id, returnId: r?.id ?? null, reasonKey: r?.reasonCode ?? null, riderNote: r?.riderNote ?? note };
}

/**
 * A person records why a parcel came back (`delivery.outcomes`): a reason from the owner's list ("other" needs the
 * rider's words) and the rider's note. Only on a parcel that came back — the courier says returning,
 * returned or partly delivered, or the order was corrected to returned. Recording again replaces the reason (both
 * written in the audit log). Returns the return record it went on.
 */
export async function recordReturnReason(deps: Base, who: Who, shipmentId: string, input: unknown): Promise<{ returnId: string; reasonKey: string; riderNote: string | null; created: boolean }> {
  await allow(deps, who, 'delivery.outcomes');
  const d = parse(returnReasonInput, input, 'return reason');
  const reason = (await setting(deps, who.storeId, 'orders.refusal.reasons')).find((r) => r.key === d.reasonKey);
  if (!reason) throw new ShippingError('INVALID_INPUT', 'pick a reason from the list', ['reasonKey']);
  if (reason.key === OTHER_KEY && !d.note) throw new ShippingError('INVALID_INPUT', 'this reason needs the rider\'s words', ['note']);
  const s = await deps.db.shipment.findFirst({ where: { id: shipmentId, storeId: who.storeId }, select: { id: true, orderId: true, status: true, codCollectedMinor: true, order: { select: { status: true, customerId: true } } } });
  if (!s) throw new ShippingError('NOT_FOUND', 'no such parcel', ['shipmentId']);
  if (!cameBack(s.status, s.order.status)) throw new ShippingError('NOT_RETURNED', 'this parcel did not come back', ['shipmentId'], { status: s.status });
  const riderNote = d.note ?? (await lastRiderNote(deps, who.storeId, s.id));
  const by = staffBy(who.actor, who.ctx, 'admin');
  return deps.db.$transaction(async (tx) => {
    const known = await returnOf(tx, who.storeId, s.orderId, s.id);
    const kind = returnKindOf(s.status, s.codCollectedMinor);
    const ret = known
      ? await tx.returnRecord.update({ where: { id: known.id }, data: { reasonCode: reason.key, riderNote, shipmentId: s.id }, select: { id: true } })
      : await tx.returnRecord.create({
          data: { storeId: who.storeId, orderId: s.orderId, shipmentId: s.id, customerId: s.order.customerId, kind, reasonCode: reason.key, riderNote, courierClaim: s.status, chargePaidMinor: kind === 'CHARGE_PAID_RETURN' ? Math.max(0, s.codCollectedMinor ?? 0) : 0 },
          select: { id: true },
        });
    await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: s.orderId, type: RETURN_REASON_EVENT, actorType: by.actorType, actorId: by.actorId, source: by.source, reasonCode: reason.key, message: riderNote, data: { shipmentId: s.id, returnId: ret.id, ...(known?.reasonCode ? { before: known.reasonCode } : {}) } } });
    await logChange(tx, who, 'delivery.return.reason', 'ReturnRecord', ret.id, known ? { reasonCode: known.reasonCode, riderNote: known.riderNote } : null, { reasonCode: reason.key, riderNote, kind: known ? undefined : kind });
    return { returnId: ret.id, reasonKey: reason.key, riderNote, created: !known };
  }, TX);
}
