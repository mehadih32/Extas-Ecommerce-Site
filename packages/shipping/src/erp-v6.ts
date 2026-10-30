// PR 611 (CN-028; extends PR 525) — the courier side of the ERP v6 order: when a parcel's facts go to the ERP
// (docs/erp/site-changes-v6.md §2.3, §2.5.2; docs/RETAIL-ERP-MODEL.md §13.1). Only while the store's `erp.model` is v6
// and the order went to the ERP as a v6 order; in v5 nothing here runs and nothing the owner sees changes.
//
// - The shipment (`POST /shipments`, which bills the order) goes when the courier CONFIRMS PICKUP — the parcel's first
//   state at or after PICKED_UP (`pickedAt`) — never at the booking, because the ERP cannot void a bill yet.
// - Every courier result goes by `PUT /orders/{id}/delivery`: DELIVERED, PARTIALLY_DELIVERED (PARTIAL) and RETURNED,
//   with what the courier collected. A "Delivered" a true-delivery check holds (PR 525: our own records say otherwise)
//   is NOT sent while the check is open; once a person resolves it, the truth goes: really delivered, came back with
//   the charge paid (RETURNED with that charge as collected), or came back.
// - The order page's Partial delivery box (`savePartialDelivery`, `delivery.outcomes`): the lines the customer kept,
//   what was paid, any discount promised by phone (it must be written here: the ERP never guesses a discount), whether
//   it was confirmed by phone, a note. Required when the courier says partial; sent as the result's `mark`, again each
//   time staff change it, until the parcel is handed back (a return list sent, PR 612). Without the box, a door record
//   that names the kept pieces (PR 166) gives the mark; with neither, the ERP works the kept lines out itself (its
//   identification: GREEN, YELLOW, ORANGE, shown on the order page).
// - Money: the delivery charge and anything underpaid stay in Retail's own books; only `collected` goes.
// An exchange parcel (`isExchangeLeg`) is the exchange order's (PR 614): it is not reported from here. The exchange
// order's own parcel is (PR 614 gives the exchange order its own ErpOrder, exchangeOfId = the old order): its pickup
// and result reach the ERP like any order's, which starts the ERP's 4-day watch.
// `reportParcelToErp` runs after every courier read (sync.ts) and after a check is resolved (truth.ts); the tracking
// run catches up any parcel whose facts did not reach the ERP yet (`reportErpLagging`).
import { z } from 'zod';
import { enqueueErpDelivery, enqueueErpShipment, erpCourier, erpOrderLinesOf, erpOrderOf, isV6, lastStaffMark, type DeliveryMark, type InventoryDeps } from '@extas/inventory';
import type { ErpDeliveryStatus } from '@extas/adapters';
import { allow, logChange, nowOf, parse, TX, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';

type Base = Pick<ShippingDeps, 'db' | 'settings' | 'now'> & Partial<Pick<ShippingDeps, 'connections'>>;

/** The inventory's view of the same dependencies (the ERP documents are queued; the relay sends them). */
function inv(deps: Base): InventoryDeps {
  const none = { use: () => Promise.reject(new Error('no ERP connection in the courier service')) } as unknown as InventoryDeps['connections'];
  return { db: deps.db, settings: deps.settings, now: deps.now, connections: (deps.connections as InventoryDeps['connections'] | undefined) ?? none };
}

/** Parcel states at or after the courier's pickup. */
export const PICKED_STATES: ReadonlySet<string> = new Set(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'ATTEMPT_FAILED', 'ADDRESS_PROBLEM', 'LOST', 'DAMAGED', 'RETURNING', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED']);
const RESULT: Readonly<Record<string, ErpDeliveryStatus>> = { DELIVERED: 'DELIVERED', PARTIALLY_DELIVERED: 'PARTIAL', RETURNED: 'RETURNED' };

export interface ErpParcelReport {
  shipment: boolean;
  delivery: boolean;
  /** Why nothing went (v5, an exchange leg, not the order's parcel, a check open …), or null. */
  waits: string | null;
}

const SELECT = {
  id: true,
  storeId: true,
  orderId: true,
  status: true,
  consignmentId: true,
  chargeMinor: true,
  codCollectedMinor: true,
  pickedAt: true,
  deliveredAt: true,
  returnedAt: true,
  updatedAt: true,
  isExchangeLeg: true,
  courierAccount: { select: { providerKey: true } },
} as const;

/** The kept lines from the shop's own door record (PR 166: kept order items → every piece of them). */
async function doorMark(deps: Base, erpOrderId: string, s: { storeId: number; orderId: string; id: string }): Promise<DeliveryMark | null> {
  const door = await deps.db.codCollection.findFirst({
    where: { storeId: s.storeId, orderId: s.orderId, outcome: 'PARTIAL', state: { in: ['RECORDED', 'APPROVED'] }, OR: [{ shipmentId: s.id }, { shipmentId: null }] },
    orderBy: { createdAt: 'desc' },
    select: { keptItemIds: true },
  });
  if (!door?.keptItemIds.length) return null;
  const lines = await erpOrderLinesOf(deps.db, erpOrderId);
  const kept = lines.filter((l) => l.orderItemId && door.keptItemIds.includes(l.orderItemId) && l.state !== 'REMOVED' && l.state !== 'CANCELLED').map((l) => l.lineId);
  return kept.length ? { keptLineIds: kept, discountGivenMinor: 0, phoneConfirmed: false, note: null, markedById: null } : null; // hardcode-ok: a door record carries no phone discount
}

/** Sends what the ERP does not know yet about one parcel (safe to run any number of times). */
export async function reportParcelToErp(deps: Base, ref: { storeId: number; shipmentId: string }): Promise<ErpParcelReport> {
  const out: ErpParcelReport = { shipment: false, delivery: false, waits: null };
  if (!(await isV6(deps, ref.storeId))) return { ...out, waits: 'ERP_MODEL_V5' };
  const s = await deps.db.shipment.findFirst({ where: { id: ref.shipmentId, storeId: ref.storeId }, select: SELECT });
  if (!s) return { ...out, waits: 'NOT_FOUND' };
  if (s.isExchangeLeg) return { ...out, waits: 'EXCHANGE_LEG' };
  // The order's own active parcel only (an older failed or cancelled try never speaks for it).
  const active = await deps.db.shipment.findFirst({ where: { storeId: s.storeId, orderId: s.orderId, isExchangeLeg: false, status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (active?.id !== s.id) return { ...out, waits: 'NOT_ACTIVE_PARCEL' };
  const eo = await erpOrderOf(deps.db, { storeId: s.storeId, orderId: s.orderId });
  if (!eo) return { ...out, waits: 'NOT_AT_ERP' };
  const courier = erpCourier(s.courierAccount.providerKey);
  const d = inv(deps);

  if ((s.pickedAt || PICKED_STATES.has(s.status)) && s.consignmentId) {
    const r = await enqueueErpShipment(d, { storeId: s.storeId, orderId: s.orderId, courier, consignmentId: s.consignmentId, chargeMinor: s.chargeMinor, pickedUpAt: s.pickedAt ?? s.updatedAt });
    out.shipment = !!r?.created;
  }

  let outcome = RESULT[s.status];
  if (!outcome) return out;
  let collected = Math.max(0, s.codCollectedMinor ?? 0);
  let at = (outcome === 'RETURNED' ? s.returnedAt : s.deliveredAt) ?? s.updatedAt;
  // PR 525: a contradicted "Delivered" waits for a person; once resolved, the truth goes.
  const check = await deps.db.deliveryCheck.findUnique({ where: { shipmentId: s.id }, select: { state: true, resolution: true, collectedMinor: true, resolvedAt: true } });
  if (check?.state === 'OPEN') return { ...out, waits: 'DELIVERY_CHECK_OPEN' };
  if (check?.state === 'RESOLVED' && check.resolution) {
    outcome = check.resolution === 'DELIVERED' ? 'DELIVERED' : 'RETURNED';
    collected = check.resolution === 'CHARGE_PAID_RETURN' ? Math.max(0, check.collectedMinor ?? 0) : check.resolution === 'RETURNED' ? 0 : collected;
    at = check.resolvedAt ?? at;
  }
  // The staff's box (kept by the courier's re-reads), else the door record, else none: the ERP identifies.
  // A box staff filled is the shop's own word on what the customer kept: it stands over a later "Delivered" read (only
  // the courier's "Returned" — everything came back — replaces it).
  const staff = await lastStaffMark(deps.db, eo.id);
  if (staff && outcome === 'DELIVERED') outcome = 'PARTIAL';
  const mark = outcome === 'PARTIAL' ? (staff ?? (await doorMark(deps, eo.id, s))) : null;
  if (staff && outcome === 'PARTIAL') {
    const last = await deps.db.erpDeliveryResult.findFirst({ where: { erpOrderId: eo.id, markedById: { not: null } }, orderBy: { createdAt: 'desc' }, select: { collectedMinor: true } });
    if (last) collected = Number(last.collectedMinor);
  }
  const r = await enqueueErpDelivery(d, { storeId: s.storeId, orderId: s.orderId, outcome, courier, consignmentId: s.consignmentId, collectedMinor: collected, at, mark });
  out.delivery = !!r?.created;
  return out;
}

/**
 * The tracking run's catch-up: picked-up or finished parcels of v6 orders whose shipment or result never reached the
 * ERP (a read whose report failed, a parcel the worker no longer reads). Bounded by `batch`.
 */
export async function reportErpLagging(deps: Base, storeId: number, batch: number): Promise<{ checked: number; sent: number }> {
  if (!(await isV6(deps, storeId))) return { checked: 0, sent: 0 };
  const rows = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT s."id"::text AS id
    FROM "Shipment" s JOIN "ErpOrder" e ON e."orderId" = s."orderId" AND e."storeId" = s."storeId"
    WHERE s."storeId" = ${storeId} AND s."isExchangeLeg" = false
      AND s."status"::text IN ('PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','ATTEMPT_FAILED','ADDRESS_PROBLEM','LOST','DAMAGED','RETURNING','DELIVERED','PARTIALLY_DELIVERED','RETURNED')
      AND (
        (e."pickedUpAt" IS NULL AND s."consignmentId" IS NOT NULL)
        OR (s."status"::text IN ('DELIVERED','PARTIALLY_DELIVERED','RETURNED') AND NOT EXISTS (SELECT 1 FROM "ErpDeliveryResult" r WHERE r."erpOrderId" = e."id"))
      )
    ORDER BY s."updatedAt" ASC
    LIMIT ${Math.max(0, batch)}`;
  let sent = 0;
  for (const r of rows) {
    const x = await reportParcelToErp(deps, { storeId, shipmentId: r.id });
    if (x.shipment || x.delivery) sent++;
  }
  return { checked: rows.length, sent };
}

// ---- the Partial delivery box (the order page) ------------------------------------------------------------------------

export const partialDeliveryInput = z
  .object({
    orderId: z.uuid(),
    keptLineIds: z.array(z.string().trim().min(1).max(80)).max(500),
    /** What the customer paid at the door, minor units. */
    paidMinor: z.int().min(0).max(1_000_000_000),
    /** Any discount promised by phone, minor units (0 when none). */
    discountGivenMinor: z.int().min(0).max(1_000_000_000),
    phoneConfirmed: z.boolean(),
    note: z.string().trim().max(500).nullish(),
  })
  .strict();
export type PartialDeliveryInput = z.input<typeof partialDeliveryInput>;

export interface PartialBoxView {
  /** The courier says partial and no box was filled yet: the box must be filled. */
  required: boolean;
  /** The box can be filled now (a courier result is in and the parcel is not handed back yet). */
  open: boolean;
  courierStatus: string | null;
  collectedMinor: number | null;
  lines: { lineId: string; sku: string; customerPriceMinor: number; kept: boolean; fromReturnStock: boolean; state: string }[];
  mark: { keptLineIds: string[]; paidMinor: number; discountGivenMinor: number; phoneConfirmed: boolean; note: string | null; at: string } | null;
  identification: string | null;
  sentAt: string | null;
  handedBack: boolean;
}

async function handedBack(deps: Base, storeId: number, externalOrderId: string): Promise<boolean> {
  return (await deps.db.erpReturnListParcel.count({ where: { storeId, externalOrderId, returnList: { status: { in: ['SENT', 'ACCEPTED'] } } } })) > 0;
}

/** The box as the order page draws it (v6 only; null otherwise). */
export async function partialBoxView(deps: Base, who: Who, orderId: string): Promise<PartialBoxView | null> {
  await allow(deps, who, 'delivery.read');
  if (!(await isV6(deps, who.storeId))) return null;
  const eo = await erpOrderOf(deps.db, { storeId: who.storeId, orderId });
  if (!eo) return null;
  const [s, lines, staff, last, back] = await Promise.all([
    deps.db.shipment.findFirst({ where: { storeId: who.storeId, orderId, isExchangeLeg: false, status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' }, select: { status: true, codCollectedMinor: true } }),
    erpOrderLinesOf(deps.db, eo.id),
    deps.db.erpDeliveryResult.findFirst({ where: { erpOrderId: eo.id, markedById: { not: null } }, orderBy: { createdAt: 'desc' } }),
    deps.db.erpDeliveryResult.findFirst({ where: { erpOrderId: eo.id }, orderBy: { createdAt: 'desc' }, select: { sentAt: true } }),
    handedBack(deps, who.storeId, eo.externalOrderId),
  ]);
  const result = s ? RESULT[s.status] : undefined;
  const kept = new Set(staff?.keptLineIds ?? []);
  return {
    required: s?.status === 'PARTIALLY_DELIVERED' && !staff,
    open: !!result && !back,
    courierStatus: s?.status ?? null,
    collectedMinor: s?.codCollectedMinor ?? null,
    lines: lines.filter((l) => l.state !== 'REMOVED').map((l) => ({ lineId: l.lineId, sku: l.sku, customerPriceMinor: l.customerPriceMinor, kept: kept.has(l.lineId), fromReturnStock: l.fromReturnStock, state: l.state })),
    mark: staff ? { keptLineIds: staff.keptLineIds, paidMinor: Number(staff.collectedMinor), discountGivenMinor: Number(staff.discountGivenMinor), phoneConfirmed: staff.phoneConfirmed, note: staff.note, at: staff.createdAt.toISOString() } : null,
    identification: eo.identification,
    sentAt: last?.sentAt?.toISOString() ?? null,
    handedBack: back,
  };
}

/**
 * Staff fill or change the Partial delivery box (`delivery.outcomes`). It goes to the ERP as the delivery result's
 * `mark` (a new call each time it changes), until the parcel is handed back. Nothing here moves money or changes COD:
 * the amount paid is the ERP's evidence for its piece count; the shop's own money is the payments service's.
 */
export async function savePartialDelivery(deps: Base, who: Who, input: PartialDeliveryInput): Promise<{ resultId: string; sent: boolean }> {
  await allow(deps, who, 'delivery.outcomes');
  const d = parse(partialDeliveryInput, input, 'partial delivery');
  if (!(await isV6(deps, who.storeId))) throw new ShippingError('NOT_ACTIVE', 'the Partial delivery box is for ERP contract v6', ['erp.model']);
  const eo = await erpOrderOf(deps.db, { storeId: who.storeId, orderId: d.orderId });
  if (!eo) throw new ShippingError('NOT_FOUND', 'this order is not at the ERP', ['orderId']);
  const s = await deps.db.shipment.findFirst({ where: { storeId: who.storeId, orderId: d.orderId, isExchangeLeg: false, status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } }, orderBy: { createdAt: 'desc' }, select: SELECT });
  if (!s || !RESULT[s.status]) throw new ShippingError('NOT_ACTIVE', 'the courier has not given a result for this parcel yet', ['orderId'], { status: s?.status ?? null });
  if (await handedBack(deps, who.storeId, eo.externalOrderId)) throw new ShippingError('NOT_ACTIVE', 'the parcel was handed back already: the box is closed', ['orderId'], { status: 'HANDED_BACK' });
  const mark: DeliveryMark = { keptLineIds: [...new Set(d.keptLineIds)], discountGivenMinor: d.discountGivenMinor, phoneConfirmed: d.phoneConfirmed, note: d.note ?? null, markedById: who.actor.staffUserId ?? null };
  if (!mark.markedById) throw new ShippingError('INVALID_INPUT', 'the box is filled by a person', ['actor']);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    let r;
    try {
      r = await enqueueErpDelivery(inv(deps), { storeId: who.storeId, orderId: d.orderId, outcome: 'PARTIAL', courier: erpCourier(s.courierAccount.providerKey), consignmentId: s.consignmentId, collectedMinor: d.paidMinor, at: s.deliveredAt ?? now, mark }, { tx });
    } catch (e) {
      if ((e as { code?: string }).code === 'INVALID_INPUT') throw new ShippingError('INVALID_INPUT', (e as Error).message, (e as { details?: string[] }).details ?? []);
      throw e;
    }
    if (!r) throw new ShippingError('NOT_FOUND', 'this order is not at the ERP', ['orderId']);
    if (r.created) {
      await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: d.orderId, type: 'erp.partialDelivery', actorType: 'STAFF', actorId: mark.markedById, source: 'admin', message: mark.note, data: { keptLineIds: mark.keptLineIds, paidMinor: d.paidMinor, discountGivenMinor: d.discountGivenMinor, phoneConfirmed: d.phoneConfirmed } } });
      await logChange(tx, who, 'erp.partialDelivery.save', 'ErpDeliveryResult', r.resultId, null, { keptLineIds: mark.keptLineIds, paidMinor: d.paidMinor, discountGivenMinor: d.discountGivenMinor, phoneConfirmed: d.phoneConfirmed });
    }
    return { resultId: r.resultId, sent: r.created };
  }, TX);
}
