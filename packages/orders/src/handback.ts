// CN-028 · PR 612 (CN-029 Phase 1; docs/RETAIL-ERP-MODEL.md §6, §15; docs/erp/site-changes-v6.md §2.5.3) — the hand-back
// desk: the courier hands the returned parcels back, the desk scans each consignment (a showroom return: the order
// number, courier `HAND`), counts the pieces and writes a short condition note (and, with `returns.handback.photo`, a
// photo of the sealed bag), then closes the list and it goes to the store's own ERP as `POST /return-lists` with
// `receivedCount` and `note` (@extas/inventory sendReturnList, key `returnList:<returnListId>`).
//
// - The shop never decides whether a piece can be sold again: the owner checks every piece in the ERP (PR 613 shows the
//   answer). This replaces the shop's own QC of PR 187 for v6 stores (returns.ts refuses it there, legacy.ts).
// - What is expected back is the shop's own open returns of the order (the courier's return, PR 189) and, for an
//   exchange parcel, the old pieces of its exchange (PR 614): the ERP's `expectedCount` answers with its own number; a
//   count that differs from it starts the courier claim at once (`claimStartedAt`, the order's timeline).
// - A parcel the shop does not expect is taken only with a note (`unexpected`); the ERP answers it (NOT_RETURNED,
//   NOT_OUR_ORDER, ALREADY_HANDED_BACK refuse it). A refused parcel is fixed and sent again on a NEW list (a new
//   returnListId, the contract's idempotency key; the old list keeps its answer). Nothing is deleted.
// - The shop's return record of a parcel is RECEIVED when scanned and CLOSED once the ERP took the parcel (Return stock
//   or Hold); a refused one stays RECEIVED until it is sent again.
// - A list waits as SENT (and is sent again by the job) while the ERP cannot be reached: nothing is lost.
// Never here: money, a refund, a price or COD (CLAUDE.md rule 6). CN-029 §16: every row is the store's own, on its own
// ERP link, and goes only with its own key.
import { z } from 'zod';
import { AuthError, can } from '@extas/auth';
import { InventoryError, isV6, openLinkIdOf, returnsV6Path, sendReturnList, withReturnListLock, type ReturnListSendResult } from '@extas/inventory';
import { nowOf, parse, setting, TX, type Db, type OrdersDeps, type OrdersPermission, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { requireV6 } from './legacy';
import { auditRow, eventRow, inventoryOf, staffBy, type By } from './service';

/** The courier of a return handed in at a showroom (§2.5.3). */
export const HAND_COURIER = 'HAND';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'a day like 2026-10-24' });
const courierCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{2,20}$/, { message: 'a courier code' })
  .transform((s) => s.toUpperCase());

async function allowOne(deps: OrdersDeps, who: Who, perms: OrdersPermission[]): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new OrdersError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  for (const p of perms) {
    if (await can(deps.db, who.actor, p, { storeId: who.storeId })) {
      const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
      if (!store || store.archivedAt) throw new OrdersError('NOT_FOUND', 'no such store', ['storeId']);
      return;
    }
  }
  throw new AuthError('FORBIDDEN', `needs one of the permissions: ${perms.join(', ')}`);
}

/** An ERP call that failed before anything was written: the screen shows why, nothing changed. */
function erpFailure(e: unknown): never {
  if (e instanceof OrdersError) throw e;
  if (e instanceof InventoryError) throw new OrdersError('ERP_UNAVAILABLE', e.message, e.details, { reason: e.code });
  throw e;
}

// ---- views ---------------------------------------------------------------------------------------------------------

export interface HandbackParcelView {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  externalOrderId: string;
  consignmentId: string | null;
  /** The pieces expected back: the shop's count when scanned, the ERP's once it answered. */
  expectedCount: number | null;
  receivedCount: number;
  note: string | null;
  photoAssetId: string | null;
  unexpected: boolean;
  exchange: boolean;
  /** The ERP's answer: IN_RETURN_STOCK, HOLD or REFUSED (null: not answered yet). */
  result: string | null;
  reason: string | null;
  pieces: { lineId: string; sku: string }[];
  countDiffers: boolean;
  claimStartedAt: string | null;
  /** Sent again on this list after a refusal. */
  resentInListId: string | null;
  scannedAt: string;
}

export interface HandbackListView {
  id: string;
  returnListId: string;
  courier: string;
  handedBackAt: string;
  status: string;
  sentAt: string | null;
  error: string | null;
  sendAttempts: number;
  lastTriedAt: string | null;
  resendOfId: string | null;
  createdAt: string;
  pieces: number;
  /** Refused parcels not sent again yet. */
  refusedOpen: number;
  parcels: HandbackParcelView[];
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const dayOf = (s: string): Date => new Date(`${s}T00:00:00Z`);

type ListRow = Awaited<ReturnType<typeof listRow>>;
async function listRow(db: Db, storeId: number, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.erpReturnList.findFirst({ where: { id, storeId }, include: { parcels: { orderBy: { scannedAt: 'asc' } } } });
}

async function viewOf(db: Db, l: NonNullable<ListRow>): Promise<HandbackListView> {
  const orderIds = [...new Set(l.parcels.map((p) => p.orderId).filter((x): x is string => !!x))];
  const orders = new Map((await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } })).map((o) => [o.id, o.number]));
  const parcels = l.parcels.map(
    (p): HandbackParcelView => ({
      id: p.id,
      orderId: p.orderId,
      orderNumber: p.orderId ? (orders.get(p.orderId) ?? null) : null,
      externalOrderId: p.externalOrderId,
      consignmentId: p.consignmentId,
      expectedCount: p.expectedCount,
      receivedCount: p.receivedCount,
      note: p.note,
      photoAssetId: p.photoAssetId,
      unexpected: p.unexpected,
      exchange: !!p.exchangeLinkId,
      result: p.result,
      reason: p.reason,
      pieces: Array.isArray(p.answerPieces) ? (p.answerPieces as { lineId: string; sku: string }[]) : [],
      countDiffers: p.countDiffers,
      claimStartedAt: p.claimStartedAt?.toISOString() ?? null,
      resentInListId: p.resentInListId,
      scannedAt: p.scannedAt.toISOString(),
    }),
  );
  return {
    id: l.id,
    returnListId: l.returnListId,
    courier: l.courier,
    handedBackAt: ymd(l.handedBackAt),
    status: l.status,
    sentAt: l.sentAt?.toISOString() ?? null,
    error: l.error,
    sendAttempts: l.sendAttempts,
    lastTriedAt: l.lastTriedAt?.toISOString() ?? null,
    resendOfId: l.resendOfId,
    createdAt: l.createdAt.toISOString(),
    pieces: l.parcels.filter((p) => !p.resentInListId).reduce((s, p) => s + p.receivedCount, 0),
    refusedOpen: l.parcels.filter((p) => p.result === 'REFUSED' && !p.resentInListId).length,
    parcels,
  };
}

async function lockList(tx: Tx, storeId: number, id: string) {
  if (!z.uuid().safeParse(id).success) throw new OrdersError('NOT_FOUND', 'no such return list', ['listId']);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "ErpReturnList" WHERE "id" = ${id}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new OrdersError('NOT_FOUND', 'no such return list', ['listId']);
  return tx.erpReturnList.findUniqueOrThrow({ where: { id }, include: { parcels: { orderBy: { scannedAt: 'asc' } } } });
}

/** The store's open ERP link (made once through its own connection when there is none yet). */
async function linkFor(deps: OrdersDeps, storeId: number): Promise<string> {
  const open = await openLinkIdOf(inventoryOf(deps), storeId);
  if (open) return open;
  let path;
  try {
    path = await returnsV6Path(inventoryOf(deps), storeId);
  } catch (e) {
    return erpFailure(e);
  }
  if (!path.go) throw new OrdersError('ERP_UNAVAILABLE', path.text, [path.reason], { reason: path.reason });
  return path.linkId;
}

/** The next return list id of the link for a day: RL-<yyyymmdd>-<n>, under a lock so two desks never take one. */
async function nextListId(tx: Tx, linkId: string, day: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`return-list:${linkId}`}, 0))`;
  const prefix = `RL-${day.replace(/-/g, '')}-`;
  const n = await tx.erpReturnList.count({ where: { linkId, returnListId: { startsWith: prefix } } });
  return `${prefix}${n + 1}`;
}

// ---- the desk ------------------------------------------------------------------------------------------------------

export const handbackOpenInput = z
  .object({
    /** The courier's code (PATHAO, STEADFAST, …) or HAND for a showroom return. */
    courier: courierCode,
    /** The courier's own date the parcels reached the shop. */
    handedBackAt: isoDay,
  })
  .strict();

/** Opens a hand-back list for one courier and day (OPEN). v6 only. Needs `returns.handback`. */
export async function openHandbackList(deps: OrdersDeps, who: Who, input: unknown): Promise<HandbackListView> {
  await allowOne(deps, who, ['returns.handback']);
  await requireV6(deps, who.storeId, 'the hand-back desk');
  const d = parse(handbackOpenInput, input, 'return list');
  const linkId = await linkFor(deps, who.storeId);
  const by = staffBy(who.actor, who.ctx);
  const id = await deps.db.$transaction(async (tx) => {
    const returnListId = await nextListId(tx, linkId, d.handedBackAt);
    const l = await tx.erpReturnList.create({ data: { storeId: who.storeId, linkId, returnListId, courier: d.courier, handedBackAt: dayOf(d.handedBackAt), createdById: who.actor.staffUserId ?? null }, select: { id: true } });
    await auditRow(tx, by, { storeId: who.storeId, action: 'returnList.opened', entityType: 'ErpReturnList', entityId: l.id, before: null, after: { returnListId, courier: d.courier, handedBackAt: d.handedBackAt } });
    return l.id;
  }, TX);
  return (await handbackList(deps, who, id))!;
}

export const handbackScanInput = z
  .object({
    /** The consignment scanned from the parcel (a showroom return: the order number). */
    code: z.string().trim().min(1).max(80),
    /** The pieces counted in the parcel. */
    receivedCount: z.int().min(0).max(100),
    /** A short condition note (needed when the count is not what is expected, or the parcel is not expected). */
    note: z.string().trim().max(300).optional(),
    photoAssetId: z.uuid().optional(),
    /** Take a parcel the shop does not expect back (the ERP answers it). Needs a note. */
    unexpected: z.boolean().optional(),
  })
  .strict();

interface Found {
  orderId: string;
  number: string;
  consignmentId: string | null;
}

/** The order a scanned code names in this store: a consignment, the order number, or an exchange's ERP order id. */
async function findParcel(db: Db, storeId: number, linkId: string, code: string): Promise<Found | null> {
  const ship = await db.shipment.findFirst({ where: { storeId, consignmentId: { equals: code, mode: 'insensitive' } }, orderBy: { createdAt: 'desc' }, select: { orderId: true, consignmentId: true, order: { select: { number: true } } } });
  if (ship) return { orderId: ship.orderId, number: ship.order.number, consignmentId: ship.consignmentId };
  const byNumber = await db.order.findFirst({ where: { storeId, number: { equals: code, mode: 'insensitive' } }, select: { id: true, number: true } });
  const byErp = byNumber ? null : await db.erpOrder.findFirst({ where: { storeId, linkId, externalOrderId: { equals: code, mode: 'insensitive' } }, select: { orderId: true } });
  const orderId = byNumber?.id ?? byErp?.orderId ?? null;
  if (!orderId) return null;
  const o = byNumber ?? (await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, number: true } }));
  const last = await db.shipment.findFirst({ where: { storeId, orderId, consignmentId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { consignmentId: true } });
  return { orderId: o.id, number: o.number, consignmentId: last?.consignmentId ?? null };
}

/** What the shop expects back in this parcel: its open returns, and an exchange parcel's old pieces. */
async function expectedOf(db: Db, storeId: number, orderId: string): Promise<{ count: number; returnIds: string[]; exchangeIds: string[] }> {
  const exchanges = await db.exchange.findMany({ where: { storeId, newOrderId: orderId, status: { notIn: ['CANCELLED', 'REJECTED'] } }, select: { id: true } });
  const open = await db.returnRecord.findMany({
    where: { storeId, status: 'EXPECTED', OR: [{ orderId, kind: { not: 'EXCHANGE_PICKUP' } }, ...(exchanges.length ? [{ kind: 'EXCHANGE_PICKUP' as const, exchangeId: { in: exchanges.map((x) => x.id) } }] : [])] },
    select: { id: true, items: { select: { quantity: true } } },
  });
  return { count: open.reduce((s, r) => s + r.items.reduce((a, i) => a + i.quantity, 0), 0), returnIds: open.map((r) => r.id), exchangeIds: exchanges.map((x) => x.id) };
}

/**
 * Scans one parcel onto an open list: the pieces counted and a short note (needed when the count differs from what the
 * shop expects, or the parcel is not expected); a photo when `returns.handback.photo` is on. The shop's return records
 * of the parcel are marked RECEIVED. Needs `returns.handback`.
 */
export async function scanHandbackParcel(deps: OrdersDeps, who: Who, listId: string, input: unknown): Promise<HandbackListView> {
  await allowOne(deps, who, ['returns.handback']);
  await requireV6(deps, who.storeId, 'the hand-back desk');
  const d = parse(handbackScanInput, input, 'parcel');
  const photo = await setting(deps, who.storeId, 'returns.handback.photo');
  if (photo && !d.photoAssetId) throw new OrdersError('PHOTO_REQUIRED', 'a photo of the sealed bag is needed', ['photoAssetId']);
  const by = staffBy(who.actor, who.ctx);
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const l = await lockList(tx, who.storeId, listId);
    if (l.status !== 'OPEN') throw new OrdersError('HANDBACK_STATE', 'parcels are scanned onto an open list', ['status'], { status: l.status });
    const found = await findParcel(tx, who.storeId, l.linkId, d.code);
    if (!found) throw new OrdersError('NOT_EXPECTED', 'no parcel of this store has this code', ['code'], { why: 'NOT_FOUND' });
    const erpOrder = await tx.erpOrder.findFirst({ where: { storeId: who.storeId, linkId: l.linkId, orderId: found.orderId }, select: { externalOrderId: true } });
    // An order sent before the switch to v6 is the ERP's under its shop number (as v5 sent it).
    const externalOrderId = erpOrder?.externalOrderId ?? found.number;
    const onList = await tx.erpReturnListParcel.findFirst({
      where: { storeId: who.storeId, externalOrderId, resentInListId: null, OR: [{ result: null }, { result: { not: 'REFUSED' } }], returnList: { linkId: l.linkId, status: { not: 'REFUSED' } } },
      select: { id: true, returnListId: true },
    });
    if (onList) throw new OrdersError('NOT_EXPECTED', 'this parcel is already on a return list', ['code'], { why: 'ALREADY_ON_LIST', listId: onList.returnListId });
    const exp = await expectedOf(tx, who.storeId, found.orderId);
    if (!exp.count && !d.unexpected) throw new OrdersError('NOT_EXPECTED', 'the shop does not expect this parcel back; take it with a note', ['code'], { why: 'NO_RETURN_OPEN', orderNumber: found.number });
    if (d.unexpected && !d.note) throw new OrdersError('REASON_REQUIRED', 'a parcel the shop does not expect needs a note', ['note']);
    if (exp.count && d.receivedCount !== exp.count && !d.note) throw new OrdersError('REASON_REQUIRED', 'the count is not what is expected: write a short note', ['note'], { expected: exp.count, counted: d.receivedCount });
    const exLink = exp.exchangeIds.length ? await tx.erpExchangeLink.findFirst({ where: { storeId: who.storeId, linkId: l.linkId, exchangeId: { in: exp.exchangeIds } }, select: { id: true } }) : null;
    const parcel = await tx.erpReturnListParcel.create({
      data: {
        storeId: who.storeId,
        returnListId: l.id,
        orderId: found.orderId,
        externalOrderId,
        consignmentId: l.courier === HAND_COURIER ? null : found.consignmentId,
        expectedCount: exp.count || null,
        receivedCount: d.receivedCount,
        note: d.note ?? null,
        photoAssetId: d.photoAssetId ?? null,
        unexpected: !exp.count,
        returnRecordIds: exp.returnIds,
        exchangeLinkId: exLink?.id ?? null,
        scannedById: who.actor.staffUserId ?? null,
        scannedAt: now,
      },
      select: { id: true },
    });
    for (const id of exp.returnIds) await tx.returnRecord.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: now, receivedById: who.actor.staffUserId ?? null, version: { increment: 1 } } });
    if (exp.exchangeIds.length) await tx.exchange.updateMany({ where: { id: { in: exp.exchangeIds }, status: { in: ['APPROVED', 'PICKUP_BOOKED'] } }, data: { status: 'RECEIVED', version: { increment: 1 } } });
    const facts = { returnListId: l.returnListId, courier: l.courier, handedBackAt: ymd(l.handedBackAt), consignmentId: found.consignmentId, expected: exp.count, counted: d.receivedCount, unexpected: !exp.count };
    await eventRow(tx, by, { storeId: who.storeId, orderId: found.orderId, type: 'return.handedBack', message: d.note ?? null, data: facts });
    await auditRow(tx, by, { storeId: who.storeId, action: 'returnList.scanned', entityType: 'ErpReturnListParcel', entityId: parcel.id, before: null, after: facts });
  }, TX);
  return (await handbackList(deps, who, listId))!;
}

export const handbackFixInput = z
  .object({ receivedCount: z.int().min(0).max(100).optional(), note: z.string().trim().max(300).optional(), photoAssetId: z.uuid().optional() })
  .strict();

/** Corrects a parcel's count, note or photo while its list is still open (a counted-again parcel). Needs `returns.handback`. */
export async function fixHandbackParcel(deps: OrdersDeps, who: Who, listId: string, parcelId: string, input: unknown): Promise<HandbackListView> {
  await allowOne(deps, who, ['returns.handback']);
  const d = parse(handbackFixInput, input, 'parcel');
  const by = staffBy(who.actor, who.ctx);
  await deps.db.$transaction(async (tx) => {
    const l = await lockList(tx, who.storeId, listId);
    if (l.status !== 'OPEN') throw new OrdersError('HANDBACK_STATE', 'a parcel is corrected while its list is open', ['status'], { status: l.status });
    const p = l.parcels.find((x) => x.id === parcelId);
    if (!p) throw new OrdersError('NOT_FOUND', 'no such parcel on this list', ['parcelId']);
    const count = d.receivedCount ?? p.receivedCount;
    const note = d.note ?? p.note;
    if ((p.unexpected || (p.expectedCount !== null && count !== p.expectedCount)) && !note) throw new OrdersError('REASON_REQUIRED', 'the count is not what is expected: write a short note', ['note']);
    await tx.erpReturnListParcel.update({ where: { id: p.id }, data: { receivedCount: count, note, ...(d.photoAssetId ? { photoAssetId: d.photoAssetId } : {}) } });
    const before = { receivedCount: p.receivedCount, note: p.note };
    if (p.orderId) await eventRow(tx, by, { storeId: who.storeId, orderId: p.orderId, type: 'return.handbackCorrected', message: note, data: { returnListId: l.returnListId, before, counted: count } });
    await auditRow(tx, by, { storeId: who.storeId, action: 'returnList.corrected', entityType: 'ErpReturnListParcel', entityId: p.id, before, after: { receivedCount: count, note } });
  }, TX);
  return (await handbackList(deps, who, listId))!;
}

/**
 * After an answer, in the send's own transaction: the timeline of each parcel the ERP answered, the claim started, the
 * return records closed. `before` was read under the list's lock, so a second sender writes nothing again.
 */
async function afterSend(tx: Tx, now: Date, by: By, storeId: number, listId: string, before: Map<string, { result: string | null; claim: Date | null }>): Promise<void> {
  {
    const l = await tx.erpReturnList.findUniqueOrThrow({ where: { id: listId }, include: { parcels: true } });
    for (const p of l.parcels) {
      const was = before.get(p.id);
      if (!p.orderId || !was || was.result === p.result) continue;
      await eventRow(tx, by, { storeId, orderId: p.orderId, type: 'return.erpAnswered', message: p.reason, data: { returnListId: l.returnListId, result: p.result, reason: p.reason, expected: p.expectedCount, counted: p.receivedCount } });
      if (p.claimStartedAt && !was.claim) {
        await eventRow(tx, by, { storeId, orderId: p.orderId, type: 'return.claimStarted', message: p.note, data: { returnListId: l.returnListId, consignmentId: p.consignmentId, courier: l.courier, expected: p.expectedCount, counted: p.receivedCount } });
        await auditRow(tx, by, { storeId, action: 'returnList.claimStarted', entityType: 'ErpReturnListParcel', entityId: p.id, before: null, after: { expected: p.expectedCount, counted: p.receivedCount } });
      }
      // The ERP took the parcel (Return stock or Hold): the shop's part of the return is done.
      if (p.result === 'IN_RETURN_STOCK' || p.result === 'HOLD') {
        await tx.returnRecord.updateMany({ where: { storeId, id: { in: p.returnRecordIds }, status: { in: ['EXPECTED', 'RECEIVED'] } }, data: { status: 'CLOSED', closedAt: now, note: `ERP: ${p.result}`, version: { increment: 1 } } });
      }
    }
  }
}

export interface HandbackSendView extends HandbackListView {
  /** The pieces moved in the pipeline to "waiting for the owner's check". */
  moved: number;
}

/**
 * Sends a closed list now, under the list's row lock (qa-gate): the desk's "send again", the close and the hourly job
 * never send it twice; the parcels as they were before are read under the lock, so the timeline is written once.
 */
async function sendNow(deps: OrdersDeps, by: By, storeId: number, listId: string): Promise<{ result: ReturnListSendResult | null; error: string | null }> {
  const inv = inventoryOf(deps);
  try {
    const r = await withReturnListLock(inv, storeId, listId, async (tx) => {
      const l = await tx.erpReturnList.findFirstOrThrow({ where: { id: listId, storeId }, include: { parcels: true } });
      const before = new Map(l.parcels.map((p) => [p.id, { result: p.result, claim: p.claimStartedAt }]));
      const sent = await sendReturnList(inv, storeId, listId, { tx });
      await afterSend(tx, nowOf(deps), by, storeId, listId, before);
      return sent;
    });
    return { result: r, error: r.error };
  } catch (e) {
    // another writer moved one of its pieces at the same moment: nothing was kept; the list goes again on the next turn
    if ((e as { code?: string })?.code === 'P2002') return { result: null, error: 'CONFLICT: sent again on the next turn' };
    if (e instanceof InventoryError) {
      await deps.db.erpReturnList.update({ where: { id: listId }, data: { error: `${e.code}: ${e.message}`.slice(0, 500), lastTriedAt: nowOf(deps) } });
      return { result: null, error: e.message };
    }
    throw e;
  }
}

/** Closes an open list (OPEN → SENT) and sends it to the store's ERP now; held while the ERP cannot be reached. */
export async function closeHandbackList(deps: OrdersDeps, who: Who, listId: string): Promise<HandbackSendView> {
  await allowOne(deps, who, ['returns.handback']);
  await requireV6(deps, who.storeId, 'the hand-back desk');
  const by = staffBy(who.actor, who.ctx);
  await deps.db.$transaction(async (tx) => {
    const l = await lockList(tx, who.storeId, listId);
    if (l.status !== 'OPEN') throw new OrdersError('HANDBACK_STATE', 'only an open list is closed', ['status'], { status: l.status });
    if (!l.parcels.length) throw new OrdersError('HANDBACK_STATE', 'a list needs at least one parcel', ['parcels'], { status: l.status, empty: true });
    await tx.erpReturnList.update({ where: { id: l.id }, data: { status: 'SENT', closedById: who.actor.staffUserId ?? null } });
    await auditRow(tx, by, { storeId: who.storeId, action: 'returnList.closed', entityType: 'ErpReturnList', entityId: l.id, before: { status: 'OPEN' }, after: { status: 'SENT', parcels: l.parcels.length, pieces: l.parcels.reduce((s, p) => s + p.receivedCount, 0) } });
  }, TX);
  const sent = await sendNow(deps, by, who.storeId, listId);
  return { ...(await handbackList(deps, who, listId))!, moved: sent.result?.moved ?? 0 };
}

/** Sends a closed list again now (it waited while the ERP could not be reached). Needs `returns.handback`. */
export async function sendHandbackList(deps: OrdersDeps, who: Who, listId: string): Promise<HandbackSendView> {
  await allowOne(deps, who, ['returns.handback']);
  const l = await listRow(deps.db, who.storeId, listId);
  if (!l) throw new OrdersError('NOT_FOUND', 'no such return list', ['listId']);
  if (l.status !== 'SENT') throw new OrdersError('HANDBACK_STATE', 'only a list waiting to be sent is sent again', ['status'], { status: l.status });
  const sent = await sendNow(deps, staffBy(who.actor, who.ctx), who.storeId, listId);
  return { ...(await handbackList(deps, who, listId))!, moved: sent.result?.moved ?? 0 };
}

/** The job's way: every list of the store waiting to be sent, oldest first (with the timeline and records after). */
export async function sendWaitingHandbackLists(deps: OrdersDeps, storeId: number, by: By): Promise<{ sent: number; waiting: number; refused: number }> {
  const out = { sent: 0, waiting: 0, refused: 0 };
  const lists = await deps.db.erpReturnList.findMany({ where: { storeId, status: 'SENT' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  for (const l of lists) {
    const r = await sendNow(deps, by, storeId, l.id);
    if (r.result?.status === 'ACCEPTED') out.sent++;
    else if (r.result?.status === 'REFUSED') out.refused++;
    else out.waiting++;
  }
  return out;
}

export const handbackResendInput = z.object({ parcelIds: z.array(z.uuid()).min(1).max(200).optional() }).strict();

/**
 * Puts the refused parcels of an answered list (all, or the ones named) on a NEW open list — the same courier and
 * day, a new returnListId — to be corrected and sent again. The old list keeps its answer. Needs `returns.handback`.
 */
export async function resendRefusedParcels(deps: OrdersDeps, who: Who, listId: string, input: unknown = {}): Promise<HandbackListView> {
  await allowOne(deps, who, ['returns.handback']);
  await requireV6(deps, who.storeId, 'the hand-back desk');
  const d = parse(handbackResendInput, input, 'resend');
  const by = staffBy(who.actor, who.ctx);
  const newId = await deps.db.$transaction(async (tx) => {
    const l = await lockList(tx, who.storeId, listId);
    if (l.status !== 'ACCEPTED' && l.status !== 'REFUSED') throw new OrdersError('HANDBACK_STATE', 'refused parcels are sent again once the ERP answered', ['status'], { status: l.status });
    const refused = l.parcels.filter((p) => p.result === 'REFUSED' && !p.resentInListId && (!d.parcelIds || d.parcelIds.includes(p.id)));
    if (!refused.length) throw new OrdersError('HANDBACK_STATE', 'no refused parcel to send again', ['parcelIds'], { status: l.status });
    const returnListId = await nextListId(tx, l.linkId, ymd(l.handedBackAt));
    const n = await tx.erpReturnList.create({ data: { storeId: who.storeId, linkId: l.linkId, returnListId, courier: l.courier, handedBackAt: l.handedBackAt, resendOfId: l.id, createdById: who.actor.staffUserId ?? null }, select: { id: true } });
    for (const p of refused) {
      await tx.erpReturnListParcel.create({
        data: { storeId: who.storeId, returnListId: n.id, orderId: p.orderId, externalOrderId: p.externalOrderId, consignmentId: p.consignmentId, expectedCount: p.expectedCount, receivedCount: p.receivedCount, note: p.note, photoAssetId: p.photoAssetId, unexpected: p.unexpected, returnRecordIds: p.returnRecordIds, exchangeLinkId: p.exchangeLinkId, scannedById: who.actor.staffUserId ?? null },
      });
      await tx.erpReturnListParcel.update({ where: { id: p.id }, data: { resentInListId: n.id } });
      if (p.orderId) await eventRow(tx, by, { storeId: who.storeId, orderId: p.orderId, type: 'return.handbackResent', message: p.reason, data: { from: l.returnListId, to: returnListId, reason: p.reason } });
    }
    await auditRow(tx, by, { storeId: who.storeId, action: 'returnList.resent', entityType: 'ErpReturnList', entityId: n.id, before: { from: l.returnListId }, after: { returnListId, parcels: refused.length } });
    return n.id;
  }, TX);
  return (await handbackList(deps, who, newId))!;
}

// ---- reading -------------------------------------------------------------------------------------------------------

/** One list with its parcels (null: not this store's). Needs `returns.handback` or `returns.view`. */
export async function handbackList(deps: OrdersDeps, who: Who, listId: string): Promise<HandbackListView | null> {
  await allowOne(deps, who, ['returns.handback', 'returns.view']);
  const l = await listRow(deps.db, who.storeId, listId);
  return l ? viewOf(deps.db, l) : null;
}

export interface HandbackDesk {
  model: 'v5' | 'v6';
  /** The couriers of the store (their codes) and HAND. */
  couriers: string[];
  photoRequired: boolean;
  today: string;
  open: HandbackListView[];
  recent: HandbackListView[];
}

/** The desk: open lists, the last lists sent, the couriers. Needs `returns.handback` or `returns.view`. */
export async function handbackDesk(deps: OrdersDeps, who: Who, opts: { recent?: number } = {}): Promise<HandbackDesk> {
  await allowOne(deps, who, ['returns.handback', 'returns.view']);
  const v6 = await isV6(deps, who.storeId);
  const [accounts, photo] = await Promise.all([deps.db.courierAccount.findMany({ where: { storeId: who.storeId, enabled: true }, select: { providerKey: true }, orderBy: { providerKey: 'asc' } }), setting(deps, who.storeId, 'returns.handback.photo')]);
  const couriers = [...new Set(accounts.map((a) => a.providerKey.toUpperCase()).filter((k) => /^[A-Z0-9_]{2,20}$/.test(k))), HAND_COURIER];
  const base = { model: v6 ? ('v6' as const) : ('v5' as const), couriers, photoRequired: photo, today: ymd(nowOf(deps)) };
  if (!v6) return { ...base, open: [], recent: [] };
  const include = { parcels: { orderBy: { scannedAt: 'asc' as const } } };
  const [open, recent] = await Promise.all([
    deps.db.erpReturnList.findMany({ where: { storeId: who.storeId, status: 'OPEN' }, orderBy: { createdAt: 'desc' }, include }),
    deps.db.erpReturnList.findMany({ where: { storeId: who.storeId, status: { not: 'OPEN' } }, orderBy: { createdAt: 'desc' }, take: Math.min(50, opts.recent ?? 20), include }),
  ]);
  return { ...base, open: await Promise.all(open.map((l) => viewOf(deps.db, l))), recent: await Promise.all(recent.map((l) => viewOf(deps.db, l))) };
}
