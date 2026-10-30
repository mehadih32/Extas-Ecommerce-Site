// PR 187 (S08; Blueprint B1.8; BACKEND-ARCHITECTURE §5.3 ORD-05a, §6.5.4 decision D4) — a returned parcel at the shop:
// received (EXPECTED → RECEIVED), then every piece checked in one save (→ QC_DONE). Each piece records the SKU really
// scanned (SIM-F-022: what is restocked is always what came back, never what was ordered) and its disposition:
//   - SELLABLE → one return document to the ERP with the sellable pieces by their scanned SKU (`return.create`, the
//     outbox of @extas/inventory, key `return:{returnId}:v{version}`); the piece waits ERP_PENDING and the relay marks it
//     RESTOCKED once the ERP has taken it (ERP_FAILED after its tries; NO_ERP for a store without an ERP). The shop's
//     sellable stock rises only from the ERP mirror (R3);
//   - UNSELLABLE → a loss in the shop's records: its reason (and a photo when the setting asks), a cost entry
//     (`RETURN_LOSS`) at the piece's cost snapshot, LOSS_RECORDED; never sent to the ERP as stock.
// An exchange's pick-up moves its exchange on (QC_PASSED when every piece is sellable, else QC_FAILED for a person);
// completing it is a separate step. Every step writes the order's timeline and the audit log in its transaction;
// nothing is deleted, and once a piece is checked its result is never edited (a correction is a new record).
//
// Never here: moving money or a refund (a difference in the customer's favour is only noted as due; the wallet-credit
// request comes with the wallet, follow-up 440), changing a price, a discount or COD, or blocking anyone.
//
// CN-028 · PR 612 (CN-029 Phase 1): this is the v5 path. While the store speaks ERP contract v6 the shop never receives
// or checks a returned piece itself (ERP_MODEL: the hand-back desk sends the return list and the owner decides every
// piece in the ERP); in v5 each part is a switch (`returns.legacy.*`, on by default; legacy.ts): the QC itself, the
// restock document, the write-off cost and the credit noted as due.
import { z } from 'zod';
import { AuthError, can } from '@extas/auth';
import { enqueueReturnPush } from '@extas/inventory';
import { nowOf, parse, setting, TX, type Db, type OrdersDeps, type OrdersPermission, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { legacyPaths, requireLegacy } from './legacy';
import { auditRow, eventRow, inventoryOf, staffBy, type By } from './service';

export const RETURN_STATUSES = ['EXPECTED', 'RECEIVED', 'QC_DONE', 'CLOSED'] as const;
export type ReturnStatusName = (typeof RETURN_STATUSES)[number];
export const RETURN_DISPOSITIONS = ['SELLABLE', 'UNSELLABLE'] as const;

/** The first of these permissions the person holds (FORBIDDEN when none): a screen two roles may open. */
async function allowOne(deps: OrdersDeps, who: Who, perms: OrdersPermission[]): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new OrdersError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  let held = false;
  for (const p of perms) if (!held && (await can(deps.db, who.actor, p, { storeId: who.storeId }))) held = true;
  if (held) {
    const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
    if (!store || store.archivedAt) throw new OrdersError('NOT_FOUND', 'no such store', ['storeId']);
    return;
  }
  throw new AuthError('FORBIDDEN', `needs one of the permissions: ${perms.join(', ')}`);
}


/** Locks one return row (and reads its pieces) for the rest of the transaction. */
export async function lockReturn(tx: Tx, storeId: number, id: string) {
  if (!z.uuid().safeParse(id).success) throw new OrdersError('NOT_FOUND', 'no such return', ['returnId']);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "ReturnRecord" WHERE "id" = ${id}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new OrdersError('NOT_FOUND', 'no such return', ['returnId']);
  return tx.returnRecord.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { createdAt: 'asc' } } } });
}
export type LockedReturn = Awaited<ReturnType<typeof lockReturn>>;

export interface ReturnStepOptions {
  /** The return's version the screen showed; a newer one is refused with STALE. */
  version?: number;
}

/** One step on a return, written with its timeline row on the order and its audit row. */
export async function onReturn<T>(deps: OrdersDeps, who: Who, id: string, opts: ReturnStepOptions, fn: (tx: Tx, r: LockedReturn, now: Date, by: By) => Promise<{ action: string; after: Record<string, unknown>; result: T; message?: string | null }>): Promise<T> {
  const by = staffBy(who.actor, who.ctx);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const r = await lockReturn(tx, who.storeId, id);
    if (opts.version !== undefined && opts.version !== r.version) throw new OrdersError('STALE', 'the return changed since it was read', ['version'], { version: r.version, status: r.status });
    const before = { status: r.status, version: r.version };
    const out = await fn(tx, r, now, by);
    const after = await tx.returnRecord.update({ where: { id: r.id }, data: { version: { increment: 1 } }, select: { status: true, version: true } });
    await eventRow(tx, by, { storeId: r.storeId, orderId: r.orderId, type: `return.${out.action}`, message: out.message ?? null, data: { returnId: r.id, kind: r.kind, ...out.after } });
    await auditRow(tx, by, { storeId: r.storeId, action: `return.${out.action}`, entityType: 'ReturnRecord', entityId: r.id, before, after: { ...after, ...out.after } });
    return out.result;
  }, TX);
}

/** The exchange a pick-up belongs to moves on with it (never backwards). */
async function exchangeTo(tx: Tx, exchangeId: string | null, from: readonly string[], to: 'RECEIVED' | 'QC_PASSED' | 'QC_FAILED'): Promise<void> {
  if (!exchangeId) return;
  await tx.exchange.updateMany({ where: { id: exchangeId, status: { in: [...from] as ('APPROVED' | 'PICKUP_BOOKED' | 'RECEIVED')[] } }, data: { status: to, version: { increment: 1 } } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Received at the shop
// ---------------------------------------------------------------------------------------------------------------------

const noteOnly = z.object({ note: z.string().trim().max(1_000).optional() }).strict();

/** The parcel is at the shop (EXPECTED → RECEIVED). Needs `returns.qc`. */
export async function receiveReturn(deps: OrdersDeps, who: Who, id: string, input: unknown = {}, opts: ReturnStepOptions = {}): Promise<{ returnId: string; status: string }> {
  await allowOne(deps, who, ['returns.qc']);
  const paths = await legacyPaths(deps, who.storeId);
  if (paths.model === 'v6') requireLegacy(paths, 'shopQc', 'receiving a parcel at the shop');
  const d = parse(noteOnly, input, 'receipt');
  return onReturn(deps, who, id, opts, async (tx, r, now) => {
    if (r.status !== 'EXPECTED') throw new OrdersError('RETURN_STATE', 'only an expected parcel is received', ['status'], { status: r.status });
    await tx.returnRecord.update({ where: { id: r.id }, data: { status: 'RECEIVED', receivedAt: now, receivedById: who.actor.staffUserId, ...(d.note ? { note: d.note } : {}) } });
    await exchangeTo(tx, r.exchangeId, ['APPROVED', 'PICKUP_BOOKED'], 'RECEIVED');
    return { action: 'received', message: d.note ?? null, after: { status: 'RECEIVED' }, result: { returnId: r.id, status: 'RECEIVED' } };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// QC: every piece checked in one save
// ---------------------------------------------------------------------------------------------------------------------

const skuText = z.string().trim().min(1).max(64);

export const qcInput = z
  .object({
    items: z
      .array(
        z
          .object({
            returnItemId: z.uuid(),
            /** The SKU scanned (or typed) from the piece itself. */
            scannedSku: skuText,
            disposition: z.enum(RETURN_DISPOSITIONS),
            /** A not-sellable piece: one of `orders.returns.lossReasons`. */
            lossReason: z.string().trim().min(1).max(40).optional(),
            photoAssetIds: z.array(z.uuid()).max(10).optional(),
            note: z.string().trim().max(500).optional(),
            /** The person saw the scanned SKU is not the one expected and records it anyway (needs a note). */
            otherSku: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();
export type QcInput = z.input<typeof qcInput>;

export interface QcResult {
  returnId: string;
  status: 'QC_DONE';
  items: { returnItemId: string; scannedSku: string; disposition: string; dispositionState: string; lossCostEntryId: string | null }[];
  /** The return document sent to the ERP with the sellable pieces (null when none was sellable). */
  erpPushId: string | null;
  exchangeStatus: string | null;
  /** A difference in the customer's favour, now due (the wallet-credit request comes with the wallet, follow-up 440). */
  creditDueMinor: number;
}

const sameSku = (a: string | null | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Records QC for the whole parcel (EXPECTED or RECEIVED → QC_DONE; saving also marks it received). Every piece once:
 * the SKU scanned must be a piece of the shop and the one expected (or accepted with a note, `orders.returns.qc`); a
 * not-sellable piece needs its reason (and a photo when the setting asks). Needs `returns.qc`.
 */
export async function qcReturn(deps: OrdersDeps, who: Who, id: string, input: unknown, opts: ReturnStepOptions = {}): Promise<QcResult> {
  await allowOne(deps, who, ['returns.qc']);
  const paths = await legacyPaths(deps, who.storeId);
  requireLegacy(paths, 'shopQc', "the shop's own check of a returned parcel");
  const d = parse(qcInput, input, 'QC');
  const [qc, lossReasons] = await Promise.all([setting(deps, who.storeId, 'orders.returns.qc'), setting(deps, who.storeId, 'orders.returns.lossReasons')]);
  const reasonKeys = new Set(lossReasons.map((r) => r.key));
  const inv = inventoryOf(deps);
  return onReturn<QcResult>(deps, who, id, opts, async (tx, r, now) => {
    if (r.status !== 'EXPECTED' && r.status !== 'RECEIVED') throw new OrdersError('RETURN_STATE', 'only a parcel waiting for QC is checked', ['status'], { status: r.status });
    const open = r.items.filter((i) => !i.disposition);
    const given = new Map<string, (typeof d.items)[number]>();
    const twice: string[] = [];
    for (const l of d.items) {
      if (given.has(l.returnItemId)) twice.push(l.returnItemId);
      else given.set(l.returnItemId, l);
    }
    const missing = open.filter((i) => !given.has(i.id)).map((i) => i.id);
    const stray = [...given.keys()].filter((k) => !open.some((i) => i.id === k));
    if (twice.length || missing.length || stray.length) throw new OrdersError('QC_INCOMPLETE', 'every piece of the parcel is checked once, in one save', [...missing, ...twice, ...stray], { missing, twice, stray });

    const orderItems = new Map((await tx.orderItem.findMany({ where: { id: { in: open.map((i) => i.orderItemId) } }, select: { id: true, variantId: true, unitCostMinor: true } })).map((o) => [o.id, o]));
    const plan = [];
    for (const item of open) {
      const l = given.get(item.id)!;
      const v = await tx.productVariant.findFirst({ where: { storeId: r.storeId, sku: { equals: l.scannedSku, mode: 'insensitive' } }, select: { id: true, sku: true, avgCostMinor: true } });
      if (!v) throw new OrdersError('UNKNOWN_SKU', 'the SKU scanned is not a piece of this shop', [item.id], { scanned: l.scannedSku });
      const expected = item.expectedSku;
      if (expected && !sameSku(expected, v.sku)) {
        if (!qc.acceptOtherSku || !l.otherSku || !l.note) throw new OrdersError('SKU_MISMATCH', 'the SKU scanned is not the one expected', [item.id], { expected, scanned: v.sku, canAccept: qc.acceptOtherSku });
      }
      if (l.disposition === 'UNSELLABLE') {
        if (!l.lossReason || !reasonKeys.has(l.lossReason)) throw new OrdersError('LOSS_REASON_REQUIRED', 'a piece that is not sellable needs its reason', [item.id]);
        if (qc.photoForLoss && !l.photoAssetIds?.length) throw new OrdersError('LOSS_REASON_REQUIRED', 'a piece that is not sellable needs a photo', [item.id, 'photoAssetIds']);
      }
      const oi = orderItems.get(item.orderItemId);
      // The piece's cost snapshot: the ordered line's when it came back as ordered, else the scanned piece's own.
      const cost = oi && oi.variantId === v.id ? (oi.unitCostMinor ?? v.avgCostMinor) : v.avgCostMinor;
      plan.push({ item, l, v, cost });
    }

    const o = await tx.order.findUniqueOrThrow({ where: { id: r.orderId }, select: { number: true } });
    const store = await tx.store.findUniqueOrThrow({ where: { id: r.storeId }, select: { currency: true } });
    const sellable = plan.filter((p) => p.l.disposition === 'SELLABLE');
    // `returns.legacy.restock` off: the sellable pieces are recorded, but no return document goes to the ERP (NO_ERP).
    const push = sellable.length && paths.restock
      ? await enqueueReturnPush(inv, { storeId: r.storeId, returnId: r.id, orderId: r.orderId, externalOrderId: o.number, reason: (r.reasonCode ?? r.kind).slice(0, 64), items: sellable.map((p) => ({ sku: p.v.sku, quantity: p.item.quantity })), version: r.version }, { tx })
      : null;
    // PR 607: from the switch date (`erp.model` v6) POST /returns is retired: the pieces are not sent (RETIRED).
    const sellState = !push || push.status === 'SKIPPED_NO_ERP' || push.status === 'RETIRED' ? 'NO_ERP' : 'ERP_PENDING';

    const out: QcResult['items'] = [];
    for (const p of plan) {
      let lossCostEntryId: string | null = null;
      // `returns.legacy.writeOff` off: the reason is kept, but no return-loss cost is booked by the shop.
      if (p.l.disposition === 'UNSELLABLE' && paths.writeOff && p.cost !== null && p.cost !== undefined) {
        const ce = await tx.costEntry.create({
          data: { storeId: r.storeId, service: 'RETURN_LOSS', module: 'returns', amountMinor: p.cost * p.item.quantity, currency: store.currency, refType: 'ReturnItem', refId: p.item.id, detail: p.l.lossReason ?? null, source: 'qc', occurredAt: now },
          select: { id: true },
        });
        lossCostEntryId = ce.id;
      }
      const state = p.l.disposition === 'SELLABLE' ? sellState : 'LOSS_RECORDED';
      await tx.returnItem.update({
        where: { id: p.item.id },
        data: {
          scannedSku: p.v.sku,
          variantId: p.v.id,
          disposition: p.l.disposition,
          dispositionState: state,
          qcStatus: p.l.disposition === 'SELLABLE' ? 'GOOD' : 'DAMAGED',
          lossReason: p.l.disposition === 'UNSELLABLE' ? p.l.lossReason! : null,
          lossCostEntryId,
          erpPushId: p.l.disposition === 'SELLABLE' ? (push?.pushId ?? null) : null,
          qcById: who.actor.staffUserId,
          qcAt: now,
          photoAssetIds: p.l.photoAssetIds ?? [],
          note: p.l.note ?? null,
        },
      });
      if (p.item.exchangeItemId) {
        await tx.exchangeItem.update({ where: { id: p.item.exchangeItemId }, data: { qcStatus: p.l.disposition === 'SELLABLE' ? 'GOOD' : 'DAMAGED', restockAction: p.l.disposition === 'SELLABLE' ? 'ERP_RETURN' : 'LOSS', receivedSku: p.v.sku } });
      }
      out.push({ returnItemId: p.item.id, scannedSku: p.v.sku, disposition: p.l.disposition, dispositionState: state, lossCostEntryId });
    }

    await tx.returnRecord.update({ where: { id: r.id }, data: { status: 'QC_DONE', receivedAt: r.receivedAt ?? now, receivedById: r.receivedById ?? who.actor.staffUserId, ...(d.note ? { note: d.note } : {}) } });
    let exchangeStatus: string | null = null;
    let creditDueMinor = 0;
    if (r.exchangeId) {
      const allGood = plan.every((p) => p.l.disposition === 'SELLABLE');
      await exchangeTo(tx, r.exchangeId, ['APPROVED', 'PICKUP_BOOKED', 'RECEIVED'], allGood ? 'QC_PASSED' : 'QC_FAILED');
      const ex = await tx.exchange.findUniqueOrThrow({ where: { id: r.exchangeId }, select: { status: true, walletCreditMinor: true } });
      exchangeStatus = ex.status;
      creditDueMinor = ex.status === 'QC_PASSED' && paths.creditDue ? ex.walletCreditMinor : 0;
    }
    const items = out.map((x) => ({ id: x.returnItemId, scanned: x.scannedSku, disposition: x.disposition, state: x.dispositionState }));
    return {
      action: 'qc',
      message: d.note ?? null,
      after: { status: 'QC_DONE', items, erpPushId: push?.pushId ?? null, ...(exchangeStatus ? { exchangeStatus } : {}), ...(creditDueMinor ? { creditDueMinor } : {}) },
      result: { returnId: r.id, status: 'QC_DONE', items: out, erpPushId: push?.pushId ?? null, exchangeStatus, creditDueMinor },
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading: the parcels on their way and at the shop, one return
// ---------------------------------------------------------------------------------------------------------------------

export interface ReturnItemView {
  id: string;
  orderItemId: string;
  quantity: number;
  productName: string | null;
  colourName: string | null;
  sizeLabel: string | null;
  expectedSku: string | null;
  scannedSku: string | null;
  disposition: string | null;
  dispositionState: string | null;
  lossReason: string | null;
  erpPushId: string | null;
  /** The ERP document's own status and its last error (null when none was sent). */
  erp: { status: string; lastError: string | null } | null;
  qcAt: string | null;
  note: string | null;
}

export interface ReturnView {
  id: string;
  kind: string;
  status: string;
  version: number;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  reasonCode: string | null;
  /** PR 191: the delivery charge paid at the door before refusing (a CHARGE_PAID_RETURN). */
  chargePaidMinor: number;
  ourFault: boolean;
  exchangeId: string | null;
  exchangeNumber: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  note: string | null;
  createdAt: string;
  items: ReturnItemView[];
}

const RETURN_INCLUDE = { items: { orderBy: { createdAt: 'asc' as const } } };

async function returnViewsOf(db: Db, rows: { id: string; kind: string; status: string; version: number; orderId: string; reasonCode: string | null; chargePaidMinor: number; ourFault: boolean; exchangeId: string | null; receivedAt: Date | null; closedAt: Date | null; note: string | null; createdAt: Date; items: { id: string; orderItemId: string; quantity: number; expectedSku: string | null; scannedSku: string | null; disposition: string | null; dispositionState: string | null; lossReason: string | null; erpPushId: string | null; qcAt: Date | null; note: string | null }[] }[]): Promise<ReturnView[]> {
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const itemIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.orderItemId)))];
  const pushIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.erpPushId).filter((x): x is string => !!x)))];
  const exIds = [...new Set(rows.map((r) => r.exchangeId).filter((x): x is string => !!x))];
  const [orders, lines, pushes, exchanges] = await Promise.all([
    db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true, customerName: true } }),
    db.orderItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, productName: true, colourName: true, sizeLabel: true } }),
    db.erpPush.findMany({ where: { id: { in: pushIds } }, select: { id: true, status: true, lastError: true } }),
    db.exchange.findMany({ where: { id: { in: exIds } }, select: { id: true, number: true } }),
  ]);
  const om = new Map(orders.map((o) => [o.id, o]));
  const lm = new Map(lines.map((l) => [l.id, l]));
  const pm = new Map(pushes.map((p) => [p.id, p]));
  const xm = new Map(exchanges.map((x) => [x.id, x]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    version: r.version,
    orderId: r.orderId,
    orderNumber: om.get(r.orderId)?.number ?? '',
    customerName: om.get(r.orderId)?.customerName ?? null,
    reasonCode: r.reasonCode,
    chargePaidMinor: r.chargePaidMinor,
    ourFault: r.ourFault,
    exchangeId: r.exchangeId,
    exchangeNumber: r.exchangeId ? (xm.get(r.exchangeId)?.number ?? null) : null,
    receivedAt: r.receivedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    items: r.items.map((i) => {
      const l = lm.get(i.orderItemId);
      const p = i.erpPushId ? pm.get(i.erpPushId) : undefined;
      return {
        id: i.id,
        orderItemId: i.orderItemId,
        quantity: i.quantity,
        productName: l?.productName ?? null,
        colourName: l?.colourName ?? null,
        sizeLabel: l?.sizeLabel ?? null,
        expectedSku: i.expectedSku,
        scannedSku: i.scannedSku,
        disposition: i.disposition,
        dispositionState: i.dispositionState,
        lossReason: i.lossReason,
        erpPushId: i.erpPushId,
        erp: p ? { status: p.status, lastError: p.lastError } : null,
        qcAt: i.qcAt?.toISOString() ?? null,
        note: i.note,
      };
    }),
  }));
}

export const returnsListInput = z
  .object({
    status: z.array(z.enum(RETURN_STATUSES)).max(4).optional(),
    /** PR 191: only these kinds (the refused parcels: REFUSED_AT_DOOR, CHARGE_PAID_RETURN). */
    kind: z.array(z.enum(['REFUSED_AT_DOOR', 'RETURNED', 'CHARGE_PAID_RETURN', 'DEFECT_RETURN', 'EXCHANGE_PICKUP'])).max(5).optional(),
    /** An order number: the returns of that order. */
    orderNumber: z.string().trim().min(1).max(40).optional(),
    limit: z.int().min(1).max(200).optional(),
  })
  .strict();

/** The returns, newest first (by status, or one order's). Needs `returns.view` or `returns.qc`. */
export async function listReturns(deps: OrdersDeps, who: Who, input: unknown = {}): Promise<ReturnView[]> {
  await allowOne(deps, who, ['returns.view', 'returns.qc']);
  const d = parse(returnsListInput, input, 'returns list');
  const rows = await deps.db.returnRecord.findMany({
    where: { storeId: who.storeId, ...(d.status ? { status: { in: d.status } } : {}), ...(d.kind ? { kind: { in: d.kind } } : {}), ...(d.orderNumber ? { orderId: { in: (await deps.db.order.findMany({ where: { storeId: who.storeId, number: { equals: d.orderNumber, mode: 'insensitive' } }, select: { id: true } })).map((o) => o.id) } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: d.limit ?? 100,
    include: RETURN_INCLUDE,
  });
  return returnViewsOf(deps.db, rows);
}

/** One return with its pieces and their ERP answer. Needs `returns.view` or `returns.qc`. */
export async function returnDetail(deps: OrdersDeps, who: Who, id: string): Promise<ReturnView> {
  await allowOne(deps, who, ['returns.view', 'returns.qc']);
  if (!z.uuid().safeParse(id).success) throw new OrdersError('NOT_FOUND', 'no such return', ['returnId']);
  const r = await deps.db.returnRecord.findFirst({ where: { id, storeId: who.storeId }, include: RETURN_INCLUDE });
  if (!r) throw new OrdersError('NOT_FOUND', 'no such return', ['returnId']);
  return (await returnViewsOf(deps.db, [r]))[0]!;
}
