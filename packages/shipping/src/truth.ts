// PR 525 (SIM-F-005, SIM-F-028; BACKEND-ARCHITECTURE §6.5.0, §6.5.5) — the true-delivery check. A courier may mark a
// parcel "Delivered" that really came back: the customer refused it and paid only the delivery charge (a charge-paid
// return), or refused it outright. The shop's own records can say so — the courier collected no more than the delivery
// charge on a cash-on-delivery parcel, a person's door record says it came back, the courier's statement pays it as a
// return (payments' RETURN_AS_DELIVERED line), the parcel was received back at the shop. Each such parcel gets one
// check row (DeliveryCheck) with the signs found, and a person resolves it: really delivered, came back with the charge
// paid, or came back. While a check is open the order is not marked delivered (`holdOrder`); a late sign on an order
// already delivered is corrected by the order service's own `deliveryCorrected` step (DELIVERED → RETURNED, a person's
// action, audited). What really happened is kept beside what the courier claimed (ReturnRecord.courierClaim,
// actualOutcome, mismatch), per order and per customer, for the reports (@extas/metrics `deliveryTruth`).
//
// Off by default (`delivery.truthCheck`). Nothing here moves money, changes COD or decides a refund: the cash a courier
// owes stays with payments (PR 166), and no door record is written for the person.
import { isOrdersError, orderStep, staffBy, type By, type OrdersDeps } from '@extas/orders';
import { z } from 'zod';
import { allow, logChange, nowOf, parse, setting, TX, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { reportParcelToErp } from './erp-v6';
import { CHECK_OUTCOMES, correctionStep, truthSignals, type CheckOutcome } from './pure';

type Base = Pick<ShippingDeps, 'db' | 'settings' | 'now'>;

/** The courier's word a check is about. */
export const COURIER_CLAIM_DELIVERED = 'DELIVERED';

/** The timeline types the check writes on the order. */
export const CHECK_EVENTS = { opened: 'delivery.checkOpened', resolved: 'delivery.checkResolved' } as const;

const ordersDeps = (deps: Base): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/** The signs against the courier's "Delivered" for one parcel, from the shop's own records. */
async function signalsOf(deps: Base, s: { id: string; storeId: number; orderId: string; codAmountMinor: number | null; codCollectedMinor: number | null }, order: { paymentMethod: string | null; deliveryChargeMinor: number }) {
  const [cod, door, line, back] = await Promise.all([
    setting(deps, s.storeId, 'payments.cod'),
    deps.db.codCollection.findFirst({ where: { storeId: s.storeId, orderId: s.orderId, outcome: { in: ['RETURNED_CHARGE_PAID', 'RETURNED'] }, state: { not: 'REJECTED' }, OR: [{ shipmentId: s.id }, { shipmentId: null }] }, orderBy: { createdAt: 'desc' }, select: { id: true, outcome: true, chargeCollectedMinor: true } }),
    deps.db.courierSettlementLine.findFirst({ where: { storeId: s.storeId, shipmentId: s.id, reasonCode: 'RETURN_AS_DELIVERED' }, select: { id: true } }),
    deps.db.returnRecord.findFirst({ where: { storeId: s.storeId, orderId: s.orderId, receivedAt: { not: null } }, select: { id: true } }),
  ]);
  const signals = truthSignals({
    cod: order.paymentMethod === null || order.paymentMethod === 'COD',
    codAmountMinor: s.codAmountMinor,
    codCollectedMinor: s.codCollectedMinor,
    deliveryChargeMinor: order.deliveryChargeMinor,
    toleranceMinor: cod.toleranceMinor,
    doorReturned: !!door,
    statementReturn: !!line,
    returnReceived: !!back,
  });
  return { signals, evidence: { doorRecordId: door?.id ?? null, doorOutcome: door?.outcome ?? null, chargeCollectedMinor: door?.chargeCollectedMinor ?? null, statementLineId: line?.id ?? null, returnRecordId: back?.id ?? null } };
}

export interface CheckRow {
  id: string;
  state: 'OPEN' | 'RESOLVED';
  signals: string[];
}

/**
 * Looks at one parcel the courier calls delivered and opens its check when the shop's records contradict it (or adds
 * new signs to an open one). A resolved check is never opened again. Null when the check is off, the parcel is not
 * "Delivered", or nothing contradicts the courier.
 */
export async function checkDelivery(deps: Base, ref: { storeId: number; shipmentId: string }): Promise<CheckRow | null> {
  const cfg = await setting(deps, ref.storeId, 'delivery.truthCheck');
  if (!cfg.enabled) return null;
  const s = await deps.db.shipment.findFirst({
    where: { id: ref.shipmentId, storeId: ref.storeId },
    select: { id: true, storeId: true, orderId: true, status: true, codAmountMinor: true, codCollectedMinor: true, chargeMinor: true, order: { select: { paymentMethod: true, deliveryChargeMinor: true, customerId: true } } },
  });
  if (!s || s.status !== 'DELIVERED') return null;
  const existing = await deps.db.deliveryCheck.findUnique({ where: { shipmentId: s.id }, select: { id: true, state: true, signals: true } });
  if (existing?.state === 'RESOLVED') return existing;
  const { signals, evidence } = await signalsOf(deps, s, s.order);
  if (existing) {
    const merged = [...new Set([...existing.signals, ...signals])];
    if (merged.length === existing.signals.length) return existing;
    return deps.db.deliveryCheck.update({ where: { id: existing.id }, data: { signals: merged, evidence }, select: { id: true, state: true, signals: true } });
  }
  if (!signals.length) return null;
  try {
    return await deps.db.$transaction(async (tx) => {
      const c = await tx.deliveryCheck.create({
        data: { storeId: s.storeId, orderId: s.orderId, shipmentId: s.id, customerId: s.order.customerId, courierClaim: COURIER_CLAIM_DELIVERED, signals, evidence, collectedMinor: s.codCollectedMinor, chargeMinor: s.chargeMinor },
        select: { id: true, state: true, signals: true },
      });
      await tx.orderEvent.create({ data: { storeId: s.storeId, orderId: s.orderId, type: CHECK_EVENTS.opened, actorType: 'SYSTEM', actorId: null, source: 'delivery-check', data: { checkId: c.id, shipmentId: s.id, signals } } });
      return c;
    }, TX);
  } catch (e) {
    // a second reader opened it at the same moment: one check per parcel
    if ((e as { code?: string }).code === 'P2002') return deps.db.deliveryCheck.findUnique({ where: { shipmentId: s.id }, select: { id: true, state: true, signals: true } });
    throw e;
  }
}

/** Is the parcel's "Delivered" waiting for a person (an open check, with the owner's `holdOrder` on)? */
export async function holdsDelivered(deps: Base, s: { id: string; storeId: number }): Promise<boolean> {
  const cfg = await setting(deps, s.storeId, 'delivery.truthCheck');
  if (!cfg.enabled) return false;
  const c = await checkDelivery(deps, { storeId: s.storeId, shipmentId: s.id });
  return cfg.holdOrder && c?.state === 'OPEN';
}

/**
 * The late signs: parcels delivered in the last `lookbackDays` without a check, where a sign has appeared since (the
 * courier's statement, a door record, the return received, the charge-only collection). Bounded by `batch`.
 */
export async function sweepDeliveryChecks(deps: Base, storeId: number, batch: number): Promise<{ looked: number; opened: number }> {
  const cfg = await setting(deps, storeId, 'delivery.truthCheck');
  if (!cfg.enabled) return { looked: 0, opened: 0 };
  const tol = (await setting(deps, storeId, 'payments.cod')).toleranceMinor;
  const since = new Date(nowOf(deps).getTime() - cfg.lookbackDays * 86_400_000);
  const rows = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT s."id"::text AS id
    FROM "Shipment" s JOIN "Order" o ON o."id" = s."orderId"
    WHERE s."storeId" = ${storeId} AND o."archivedAt" IS NULL AND s."status"::text = 'DELIVERED' AND s."deliveredAt" >= ${since}
      AND NOT EXISTS (SELECT 1 FROM "DeliveryCheck" d WHERE d."shipmentId" = s."id")
      AND (
        EXISTS (SELECT 1 FROM "CodCollection" c WHERE c."storeId" = s."storeId" AND c."orderId" = s."orderId" AND c."outcome"::text IN ('RETURNED_CHARGE_PAID','RETURNED') AND c."state"::text <> 'REJECTED')
        OR EXISTS (SELECT 1 FROM "CourierSettlementLine" l WHERE l."storeId" = s."storeId" AND l."shipmentId" = s."id" AND l."reasonCode" = 'RETURN_AS_DELIVERED')
        OR EXISTS (SELECT 1 FROM "ReturnRecord" r WHERE r."storeId" = s."storeId" AND r."orderId" = s."orderId" AND r."receivedAt" IS NOT NULL)
        OR ((o."paymentMethod" IS NULL OR o."paymentMethod"::text = 'COD') AND s."codCollectedMinor" IS NOT NULL
            AND s."codAmountMinor" > o."deliveryChargeMinor" + ${tol}::int AND s."codCollectedMinor" <= o."deliveryChargeMinor" + ${tol}::int)
      )
    ORDER BY s."deliveredAt" ASC
    LIMIT ${Math.max(0, batch)}`;
  let opened = 0;
  for (const r of rows) if ((await checkDelivery(deps, { storeId, shipmentId: r.id }))?.state === 'OPEN') opened += 1;
  return { looked: rows.length, opened };
}

export const CHECK_VIEWS = ['open', 'resolved', 'all'] as const;
export type CheckView = (typeof CHECK_VIEWS)[number];

export const checkQuery = z
  .object({
    view: z.enum(CHECK_VIEWS).default('open'),
    orderId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const CHECK_SELECT = {
  id: true,
  orderId: true,
  shipmentId: true,
  customerId: true,
  courierClaim: true,
  signals: true,
  evidence: true,
  collectedMinor: true,
  chargeMinor: true,
  state: true,
  resolution: true,
  resolvedById: true,
  resolvedAt: true,
  note: true,
  createdAt: true,
} as const;

/** The store's checks, newest first, with the order number and the courier, and how many are open. */
export async function listDeliveryChecks(deps: Base, who: Who, query: unknown = {}) {
  await allow(deps, who, 'delivery.parcels');
  const q = parse(checkQuery, query, 'check list query');
  const where = { storeId: who.storeId, ...(q.view === 'all' ? {} : { state: q.view === 'open' ? ('OPEN' as const) : ('RESOLVED' as const) }), ...(q.orderId ? { orderId: q.orderId } : {}), ...(q.customerId ? { customerId: q.customerId } : {}) };
  const [rows, open] = await Promise.all([
    deps.db.deliveryCheck.findMany({ where, select: CHECK_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
    deps.db.deliveryCheck.count({ where: { storeId: who.storeId, state: 'OPEN' } }),
  ]);
  const more = rows.length > q.limit;
  const page = more ? rows.slice(0, q.limit) : rows;
  const [orders, parcels] = await Promise.all([
    deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: page.map((r) => r.orderId) } }, select: { id: true, number: true, status: true } }),
    deps.db.shipment.findMany({ where: { storeId: who.storeId, id: { in: page.map((r) => r.shipmentId) } }, select: { id: true, trackingCode: true, consignmentId: true, courierAccount: { select: { name: true } } } }),
  ]);
  const o = new Map(orders.map((x) => [x.id, x]));
  const p = new Map(parcels.map((x) => [x.id, x]));
  return {
    rows: page.map((r) => ({ ...r, order: o.get(r.orderId) ?? null, parcel: p.get(r.shipmentId) ? { courier: p.get(r.shipmentId)!.courierAccount.name, tracking: p.get(r.shipmentId)!.trackingCode ?? p.get(r.shipmentId)!.consignmentId } : null })),
    next: more ? page[page.length - 1]!.id : null,
    open,
  };
}

/** The open check of one order (the order page's band), or null. */
export async function openCheckOf(deps: Pick<ShippingDeps, 'db'>, storeId: number, orderId: string) {
  return deps.db.deliveryCheck.findFirst({ where: { storeId, orderId, state: 'OPEN' }, select: CHECK_SELECT, orderBy: { createdAt: 'desc' } });
}

export const resolveInput = z
  .object({
    outcome: z.enum(CHECK_OUTCOMES),
    /** Why it came back, from the owner's `orders.refusal.reasons` (only for a return). */
    refusalKey: z.string().trim().min(1).max(60).optional(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const KIND: Record<Exclude<CheckOutcome, 'DELIVERED'>, 'CHARGE_PAID_RETURN' | 'REFUSED_AT_DOOR'> = { CHARGE_PAID_RETURN: 'CHARGE_PAID_RETURN', RETURNED: 'REFUSED_AT_DOOR' };

/**
 * A person resolves a check (`delivery.outcomes`). Really delivered: the held order is marked delivered. Came back
 * (with the charge paid, or not): the order's own step records it (returned, or `deliveryCorrected` for an order
 * already delivered), and the return is kept beside the courier's claim (ReturnRecord: courierClaim "DELIVERED", the real
 * outcome, mismatch; one per parcel — the one the shop received is completed, not doubled). The charge the courier
 * reported collecting is noted on the return, never taken or paid. Every step is audited.
 */
export async function resolveDeliveryCheck(deps: Base, who: Who, checkId: string, input: unknown) {
  await allow(deps, who, 'delivery.outcomes');
  const d = parse(resolveInput, input, 'check resolution');
  if (d.outcome === 'DELIVERED' && d.refusalKey) throw new ShippingError('INVALID_INPUT', 'a delivered parcel has no refusal reason', ['refusalKey']);
  const c = await deps.db.deliveryCheck.findFirst({ where: { id: checkId, storeId: who.storeId }, select: { ...CHECK_SELECT, storeId: true } });
  if (!c) throw new ShippingError('NOT_FOUND', 'no such check', ['checkId']);
  if (c.state === 'RESOLVED') throw new ShippingError('ALREADY_RESOLVED', 'this check was resolved already', [], { resolution: c.resolution });
  const order = await deps.db.order.findFirstOrThrow({ where: { id: c.orderId, storeId: who.storeId }, select: { status: true } });
  const parcel = await deps.db.shipment.findFirstOrThrow({ where: { id: c.shipmentId, storeId: who.storeId }, select: { deliveredAt: true, returnedAt: true } });
  const by: By = staffBy(who.actor, who.ctx, 'admin');
  const step = correctionStep(d.outcome, order.status);
  if (step) {
    try {
      const at = step === 'delivered' ? parcel.deliveredAt : null;
      await orderStep(ordersDeps(deps), { storeId: who.storeId, orderId: c.orderId }, by, step, { ...(at ? { at } : {}), ...(d.refusalKey ? { refusalKey: d.refusalKey } : {}), ...(d.note ? { note: d.note } : {}), ...(step === 'returned' && d.outcome === 'CHARGE_PAID_RETURN' && (c.collectedMinor ?? 0) > 0 ? { chargePaidMinor: c.collectedMinor! } : {}) }, { eventData: { checkId: c.id, shipmentId: c.shipmentId, outcome: d.outcome } });
    } catch (e) {
      if (isOrdersError(e)) throw new ShippingError(e.code === 'REASON_REQUIRED' ? 'INVALID_INPUT' : 'ORDER_REFUSED', e.message, e.details, { code: e.code });
      throw e;
    }
  }
  const now = nowOf(deps);
  const done = await deps.db.$transaction(async (tx) => {
    let returnId: string | null = null;
    if (d.outcome !== 'DELIVERED') {
      const kind = KIND[d.outcome];
      const chargePaidMinor = d.outcome === 'CHARGE_PAID_RETURN' ? Math.max(0, c.collectedMinor ?? 0) : 0;
      const known = await tx.returnRecord.findFirst({ where: { storeId: who.storeId, OR: [{ shipmentId: c.shipmentId }, { orderId: c.orderId, shipmentId: null, kind: { in: ['REFUSED_AT_DOOR', 'CHARGE_PAID_RETURN'] } }] }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      const data = { kind, courierClaim: c.courierClaim, actualOutcome: d.outcome, mismatch: true, chargePaidMinor, ...(d.refusalKey ? { reasonCode: d.refusalKey } : {}) };
      returnId = known
        ? (await tx.returnRecord.update({ where: { id: known.id }, data: { ...data, shipmentId: c.shipmentId }, select: { id: true } })).id
        : (await tx.returnRecord.create({ data: { storeId: who.storeId, orderId: c.orderId, shipmentId: c.shipmentId, customerId: c.customerId, ...data }, select: { id: true } })).id;
    }
    const after = await tx.deliveryCheck.update({ where: { id: c.id }, data: { state: 'RESOLVED', resolution: d.outcome, resolvedById: who.actor.staffUserId, resolvedAt: now, note: d.note ?? null }, select: CHECK_SELECT });
    await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: c.orderId, type: CHECK_EVENTS.resolved, actorType: by.actorType, actorId: by.actorId, source: by.source, reasonCode: d.refusalKey ?? null, message: d.note ?? null, data: { checkId: c.id, shipmentId: c.shipmentId, outcome: d.outcome, ...(returnId ? { returnId } : {}) } } });
    await logChange(tx, who, 'delivery.check.resolve', 'DeliveryCheck', c.id, { state: c.state, signals: c.signals }, { state: after.state, resolution: after.resolution, orderStep: step, returnId });
    return { check: after, orderStep: step, returnId };
  }, TX);
  // PR 611 (ERP contract v6): the result held while the check was open goes to the ERP now, as the person found it.
  // The tracking run's catch-up sends it if this fails.
  await reportParcelToErp(deps, { storeId: who.storeId, shipmentId: c.shipmentId }).catch(() => null);
  return done;
}

