// PR 611 (CN-028; extends PR 525) — the shipment at pickup and every delivery result, to the ERP in contract v6
// (docs/erp/site-changes-v6.md §2.3, §2.5.2; docs/RETAIL-ERP-MODEL.md §13.1). Only while the store's `erp.model` is v6
// and the order went to the ERP as a v6 order (it has an ErpOrder); otherwise nothing here runs.
//
// - `enqueueErpShipment`: `POST /shipments` when the courier CONFIRMS PICKUP, never at the booking: from v6 the
//   shipment bills the order, and the ERP cannot void a bill yet (the shop's v7 request). Keyed by the order's ERP row
//   alone (qa-gate): a courier read again, or a parcel re-booked under a new consignment after pickup, is still the
//   one shipment (the order is billed once; the ERP matches returns by the order). The answer's `billedAt` is kept on
//   ErpOrder; an answer without it leaves the bill date empty and flags the row BILLED_AT_MISSING (the books match per
//   day, so the shop never guesses it): the order check fills it from `GET /orders/{id}`.
// - `enqueueErpDelivery`: every courier result — DELIVERED, PARTIAL or RETURNED — by `PUT /orders/{id}/delivery`, with
//   what the courier collected (whole taka) and, when staff filled the order page's Partial delivery box, the `mark`:
//   the lines the customer kept, any discount promised by phone, whether it was confirmed by phone, a note. The same
//   result again is not sent again; a changed one (a courier correction, the box changed before the parcel is handed
//   back) is a new ErpDeliveryResult row and a new call. The answer's identification (GREEN, YELLOW, ORANGE) is kept on
//   ErpOrder and shown on the order page.
// - Money: the delivery charge and anything the customer underpaid or the rider failed to collect are Retail's own
//   income or loss; they never reach the ERP (only `collected`, the courier's figure, goes).
// The shop's courier side (packages/shipping erp-v6.ts) decides when: at pickup, at each final courier state, after a
// true-delivery check (PR 525) is resolved, and when the box is saved. An exchange order's leg (PR 614) uses the same
// two functions with the exchange's ErpOrder.
import { erpDeliveryAnswerSchema, erpShipmentAnswerSchema, type ErpDeliveryResult as ErpDeliveryBody, type ErpDeliveryStatus } from '@extas/adapters';
import type { Prisma } from '@extas/db/client';
import { nowOf, TX, type Db, type InventoryDeps, type Tx } from './context';
import { InventoryError } from './errors';
import { isV6 } from './erp-model';
import { applyOrderAnswer, digitsOf, erpOrderForRow, wholeTaka, type PushRow } from './erp-orders-v6';
import { enqueueErpDocument, minorToDecimal, type EnqueueResult } from './erp-push';
import { decimalToMinor } from './webhook';

/** Courier keys as the ERP takes them (`PATHAO`, `STEADFAST`, `HAND` …). */
export const erpCourier = (providerKey: string | null | undefined): string => (providerKey || 'HAND').toUpperCase().replace(/[^A-Z0-9_]/g, '_');

export interface ShipmentInput {
  storeId: number;
  orderId: string;
  courier: string;
  consignmentId: string;
  /** The courier's charge for the parcel, minor units (kept by the ERP for reference). */
  chargeMinor: number | null;
  pickedUpAt: Date;
}

/** The one shipment of an ERP order (rows queued before the qa-gate fix carry `:<consignment>` after it). */
const shipmentKey = (erpOrderId: string) => `shipment:${erpOrderId}`;

/** On a shipment row whose answer had no `billedAt` (not an exchange order): the bill date is left empty, never guessed. */
export const BILLED_AT_MISSING = 'BILLED_AT_MISSING';

const ofOrder = (db: Db, storeId: number, orderId: string, erpOrderId?: string) =>
  db.erpOrder.findFirst({ where: erpOrderId ? { id: erpOrderId, storeId } : { storeId, orderId, exchangeOfId: null }, orderBy: { createdAt: 'desc' } });

/** Queues the shipment of a picked-up parcel (PR 611). Null when the order is not a v6 ERP order. */
export async function enqueueErpShipment(deps: InventoryDeps, input: ShipmentInput & { erpOrderId?: string }, opts: { tx?: Tx } = {}): Promise<EnqueueResult | null> {
  if (!(await isV6(deps, input.storeId))) return null;
  const db: Db = opts.tx ?? deps.db;
  const eo = await ofOrder(db, input.storeId, input.orderId, input.erpOrderId);
  if (!eo) return null;
  // qa-gate: one shipment per ERP order. A re-booked parcel (new consignment after pickup) never sends a second one.
  const prior = await db.erpPush.findFirst({ where: { storeId: input.storeId, documentType: 'shipment.create', idempotencyKey: { startsWith: shipmentKey(eo.id) } }, orderBy: { createdAt: 'asc' }, select: { id: true, status: true } });
  if (prior) return { pushId: prior.id, status: prior.status, created: false };
  const digits = await digitsOf(db, input.storeId);
  const r = await enqueueErpDocument(
    deps,
    input.storeId,
    input.orderId,
    shipmentKey(eo.id),
    { type: 'shipment.create', body: { externalOrderId: eo.externalOrderId, courier: input.courier, consignmentId: input.consignmentId, charge: input.chargeMinor == null ? null : minorToDecimal(input.chargeMinor, digits), pickedUpAt: input.pickedUpAt.toISOString() } },
    opts.tx,
  );
  if (r.created || !eo.pickedUpAt) await db.erpOrder.update({ where: { id: eo.id }, data: { consignmentId: input.consignmentId, courier: input.courier, pickedUpAt: eo.pickedUpAt ?? input.pickedUpAt } });
  return r;
}

export interface DeliveryMark {
  /** The lines (ErpOrderLine.lineId) the customer kept. */
  keptLineIds: string[];
  discountGivenMinor: number;
  phoneConfirmed: boolean;
  note: string | null;
  markedById: string | null;
}

export interface DeliveryInput {
  storeId: number;
  orderId: string;
  outcome: ErpDeliveryStatus;
  courier: string;
  consignmentId: string | null;
  /** What the courier collected (or, with the box, what staff say was paid), minor units. */
  collectedMinor: number;
  at: Date;
  mark?: DeliveryMark | null;
  /** An exchange order's leg (PR 614): its own ErpOrder. */
  erpOrderId?: string;
}

export interface DeliveryQueued {
  resultId: string;
  /** False when the same result was the last one sent: nothing new was queued. */
  created: boolean;
  push: EnqueueResult | null;
}

const sameResult = (a: { outcome: string; collectedMinor: bigint; consignmentId: string | null; keptLineIds: string[]; discountGivenMinor: bigint; phoneConfirmed: boolean; note: string | null }, b: { outcome: string; collectedMinor: number; consignmentId: string | null; mark: DeliveryMark | null }) =>
  a.outcome === b.outcome &&
  Number(a.collectedMinor) === b.collectedMinor &&
  a.consignmentId === b.consignmentId &&
  [...a.keptLineIds].sort().join('|') === [...(b.mark?.keptLineIds ?? [])].sort().join('|') &&
  Number(a.discountGivenMinor) === (b.mark?.discountGivenMinor ?? 0) &&
  a.phoneConfirmed === (b.mark?.phoneConfirmed ?? false) &&
  (a.note ?? null) === (b.mark?.note ?? null);

/**
 * Queues one delivery result (PR 611), in the caller's transaction or its own. The order's ERP row is locked first, so
 * two reads of the same courier state at once give one call. Null when the order is not a v6 ERP order.
 */
export async function enqueueErpDelivery(deps: InventoryDeps, input: DeliveryInput, opts: { tx?: Tx } = {}): Promise<DeliveryQueued | null> {
  if (!(await isV6(deps, input.storeId))) return null;
  const run = async (tx: Tx): Promise<DeliveryQueued | null> => {
    const eo = await ofOrder(tx, input.storeId, input.orderId, input.erpOrderId);
    if (!eo) return null;
    await tx.$queryRaw`SELECT "id" FROM "ErpOrder" WHERE "id" = ${eo.id}::uuid FOR UPDATE`;
    const lines = await tx.erpOrderLine.findMany({ where: { erpOrderId: eo.id }, select: { lineId: true, state: true } });
    const mark = input.mark ?? null;
    if (mark) {
      const known = new Set(lines.filter((l) => l.state !== 'REMOVED' && l.state !== 'CANCELLED').map((l) => l.lineId));
      const bad = mark.keptLineIds.filter((id) => !known.has(id));
      if (bad.length) throw new InventoryError('INVALID_INPUT', 'a kept line is not a line of this order', bad.map((id) => `keptLineIds:${id}`));
    }
    const last = await tx.erpDeliveryResult.findFirst({ where: { erpOrderId: eo.id }, orderBy: { createdAt: 'desc' } });
    const want = { outcome: input.outcome, collectedMinor: Math.max(0, input.collectedMinor), consignmentId: input.consignmentId, mark };
    if (last && sameResult(last, want)) return { resultId: last.id, created: false, push: null };
    const row = await tx.erpDeliveryResult.create({
      data: {
        storeId: input.storeId,
        erpOrderId: eo.id,
        outcome: input.outcome,
        courier: input.courier,
        consignmentId: input.consignmentId,
        collectedMinor: BigInt(want.collectedMinor),
        at: input.at,
        keptLineIds: mark?.keptLineIds ?? [],
        discountGivenMinor: BigInt(Math.max(0, mark?.discountGivenMinor ?? 0)),
        phoneConfirmed: mark?.phoneConfirmed ?? false,
        note: mark?.note ?? null,
        markedById: mark?.markedById ?? null,
      },
      select: { id: true },
    });
    const digits = await digitsOf(tx, input.storeId);
    const body: ErpDeliveryBody = {
      status: input.outcome,
      courier: input.courier,
      consignmentId: input.consignmentId,
      collected: wholeTaka(want.collectedMinor, digits),
      at: input.at.toISOString(),
      ...(mark ? { mark: { keptLines: mark.keptLineIds, discountGiven: wholeTaka(Math.max(0, mark.discountGivenMinor), digits), phoneConfirmed: mark.phoneConfirmed, note: mark.note } } : {}),
    };
    const push = await enqueueErpDocument(deps, input.storeId, input.orderId, `delivery:${row.id}`, { type: 'order.delivery', externalOrderId: eo.externalOrderId, body }, tx);
    return { resultId: row.id, created: true, push };
  };
  return opts.tx ? run(opts.tx) : deps.db.$transaction(run, TX);
}

/** The latest result staff marked with the Partial delivery box, if any (the courier's re-reads keep it). */
export async function lastStaffMark(db: Db, erpOrderId: string): Promise<DeliveryMark | null> {
  const r = await db.erpDeliveryResult.findFirst({ where: { erpOrderId, markedById: { not: null } }, orderBy: { createdAt: 'desc' } });
  return r ? { keptLineIds: r.keptLineIds, discountGivenMinor: Number(r.discountGivenMinor), phoneConfirmed: r.phoneConfirmed, note: r.note, markedById: r.markedById } : null;
}

// ---- after the ERP took them (the relay, erp-v6-relay.ts) --------------------------------------------------------------

/** `POST /shipments` answered: the order is billed now (`billedAt`). */
export async function afterShipmentSent(deps: InventoryDeps, row: PushRow, answer: unknown): Promise<void> {
  const a = erpShipmentAnswerSchema.parse(answer);
  const eo = await erpOrderForRow(deps.db, row);
  if (!eo) return;
  const now = nowOf(deps);
  const digits = await digitsOf(deps.db, row.storeId);
  const total = a.erpTotal != null ? decimalToMinor(a.erpTotal, digits) : null;
  await deps.db.erpOrder.update({ where: { id: eo.id }, data: { shipmentSentAt: now, billedAt: eo.billedAt ?? a.billedAt ?? null, ...(total != null && !eo.exchangeOfId ? { erpTotalMinor: BigInt(total) } : {}), ...(a.consignmentId ? { consignmentId: a.consignmentId } : {}) } });
  // An exchange order is never billed; any other order the ERP shipped without a bill date is flagged for the books.
  if (!eo.billedAt && !a.billedAt && !eo.exchangeOfId) await deps.db.erpPush.update({ where: { id: row.id }, data: { lastError: BILLED_AT_MISSING } });
}

/** `PUT /orders/{id}/delivery` answered: the ERP's identification of the result (and its bill, if it billed now). */
export async function afterDeliverySent(deps: InventoryDeps, row: PushRow, answer: unknown): Promise<void> {
  const a = erpDeliveryAnswerSchema.parse(answer);
  const id = /^delivery:([0-9a-f-]{36})$/.exec(row.idempotencyKey)?.[1];
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    if (id) await tx.erpDeliveryResult.updateMany({ where: { id, storeId: row.storeId }, data: { sentAt: now, answer: answer as Prisma.InputJsonValue } });
    const eo = await erpOrderForRow(tx, row);
    if (!eo) return;
    await tx.erpOrder.update({
      where: { id: eo.id },
      data: {
        identification: a.status === 'PARTIAL' ? a.identification : null,
        identifiedAt: now,
        // An order that reached its result with no shipment is billed now (§2.3).
        ...(a.billedAt && !eo.billedAt ? { billedAt: a.billedAt } : {}),
      },
    });
  }, TX);
}

/** The ERP part of `GET /orders/{id}` re-read for one order (used by the catch-up and by tests). */
export { applyOrderAnswer };
