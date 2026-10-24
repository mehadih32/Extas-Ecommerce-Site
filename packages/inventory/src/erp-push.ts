// PR 187 — returns: a return's sellable pieces go as `return.create` (POST /returns), after the order itself; the relay
// marks the pieces RESTOCKED, ERP_FAILED or NO_ERP as the document's outcome is known (§6.5.4).
//
// PR 199, 200 — business documents to the ERP, as documents and never as journal lines (Blueprint A3.5 rule 1; ERP ↔
// shop API contract, CN-005), with idempotency on every push so no duplicate stock movement is possible (B1.1).
//
// The outbox. A document is written as an ErpPush row — in the caller's transaction when it passes one, so an order and
// its push are saved together or not at all (Bhandari B04: transactional outbox). The relay job
// (`inventory.erp.pushDocuments`, every `erp.push.relaySeconds`) sends what is due, oldest first.
//
// Idempotency, three times over:
// 1. The row: one ErpPush per (store, idempotency key). The key is made from the document's identity (the order and
//    what is done to it), never from time or chance, so enqueuing the same thing twice finds the first row. The same key
//    with a different document is refused (IDEMPOTENCY_MISMATCH): a changed order is a new revision with its own key.
// 2. The wire: every send carries the row's key as the `Idempotency-Key` header (required by the contract). After a
//    timeout or a dropped answer the relay sends again with the same key; an ERP that already has the document returns
//    its first answer and changes nothing — the stock it reserved is reserved once.
// 3. The relay: a row is claimed before it is sent (status PENDING and due → the next attempt time is pushed forward in
//    one update), so two relays never send the same row at the same moment.
//
// What a store's ERP state does (PR 499, `documents.push`): no ERP → SKIPPED_NO_ERP; the practice ERP or an unusable
// ERP → the row waits (PENDING) until a real connection is there; connected → sent. The company of the key is checked
// before every round (PR 196): a document is never sent to another company.
//
// Failures: a retryable one (timeout, network, ERP error, rate limit, a refused key) waits `erp.push.backoffBaseSeconds`
// × 2^(n−1), at most `erp.push.backoffMaxSeconds`, and after `erp.push.maxAttempts` tries the row is DEAD (shown on the
// sync health panel, PR 205; sent again by hand, PR 206). A document the ERP refuses as wrong (400, 409 short stock,
// 422) is FAILED at once — trying the same document again cannot help. Money is never moved here: an order document
// carries the order's amounts for the ERP's books; payments are their own document (S07).
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ERP_ORDER_CHANNEL, ERP_ORDER_CONFIRMED, ERP_ORDER_STATUSES, ERP_RETURN_QC_GOOD, toErpError, type ErpDocument, type ErpDocumentType } from '@extas/adapters';
import type { Prisma } from '@extas/db/client';
import { allow, logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Tx, type Who } from './context';
import { InventoryError } from './errors';
import { pushDisposition, resolveErp } from './guard';
import { checkCompany } from './mapping';
import { callErp, errorText, retryPolicy } from './sync';

// ---- the minimal order the push needs (orders themselves are built in the checkout stages, S04/S05) --------------

const money = z.int().min(0);
export const orderPushInput = z
  .object({
    storeId: z.int().min(1),
    /** The shop's order id (Order.id). */
    orderId: z.uuid(),
    /** The order number the customer sees; the ERP keeps it as `externalOrderId` (unique per integration). */
    externalOrderId: z.string().trim().min(1).max(64),
    customerName: z.string().trim().min(1).max(200),
    customerPhone: z.string().trim().min(1).max(32),
    shippingAddress: z.string().trim().min(1).max(1000),
    items: z
      .array(z.object({ sku: z.string().trim().min(1).max(64), quantity: z.int().min(1), unitPriceMinor: money, discountMinor: money.optional() }).strict())
      .min(1)
      .max(500),
    shippingFeeMinor: money.optional(),
    codAmountMinor: money.optional(),
    paymentMethod: z.string().trim().min(1).max(40),
    note: z.string().trim().max(1000).nullish(),
    /** A changed order is sent again as a new revision (its own idempotency key). */
    revision: z.int().min(0).optional(),
  })
  .strict();
export type OrderPushInput = z.input<typeof orderPushInput>;

/**
 * PR 187 (§6.5.4, D4) — a return's sellable pieces, by the SKU scanned at QC (SIM-F-022). `version` is the return's
 * version at the QC save: the key `return:{returnId}:v{version}` names that save, so a repeat finds the first row.
 */
export const returnPushInput = z
  .object({
    storeId: z.int().min(1),
    returnId: z.uuid(),
    /** The order the pieces came back from (the ERP knows it by its number; the document waits until that order is sent). */
    orderId: z.uuid(),
    externalOrderId: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(1).max(64),
    items: z.array(z.object({ sku: z.string().trim().min(1).max(64), quantity: z.int().min(1) }).strict()).min(1).max(500),
    version: z.int().min(0),
  })
  .strict();
export type ReturnPushInput = z.input<typeof returnPushInput>;

export const orderStatusInput = z
  .object({ storeId: z.int().min(1), orderId: z.uuid(), externalOrderId: z.string().trim().min(1).max(64), status: z.enum(ERP_ORDER_STATUSES), revision: z.int().min(0).optional() })
  .strict();
export type OrderStatusInput = z.input<typeof orderStatusInput>;

/** Minor units → the decimal text the ERP takes, using the currency's own number of decimals (BDT: 2). */
export function minorToDecimal(minor: number, fractionDigits: number): string {
  if (!Number.isInteger(minor)) throw new InventoryError('INVALID_INPUT', 'an amount in minor units must be whole');
  if (fractionDigits === 0) return String(minor);
  const neg = minor < 0;
  const s = String(Math.abs(minor)).padStart(fractionDigits + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, -fractionDigits)}.${s.slice(-fractionDigits)}`;
}

export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
}

/** The SalesOrder document (contract `POST /orders`). Pure: the same input always gives the same document. */
export function salesOrderDocument(d: z.output<typeof orderPushInput>, fractionDigits: number): ErpDocument {
  const m = (v: number | undefined) => minorToDecimal(v ?? 0, fractionDigits);
  return {
    type: 'order.create',
    body: {
      channel: ERP_ORDER_CHANNEL,
      status: ERP_ORDER_CONFIRMED,
      externalOrderId: d.externalOrderId,
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      shippingAddress: d.shippingAddress,
      items: d.items.map((i) => ({ sku: i.sku, quantity: i.quantity, unitPrice: m(i.unitPriceMinor), discount: m(i.discountMinor) })),
      shippingFee: m(d.shippingFeeMinor),
      codAmount: m(d.codAmountMinor),
      paymentMethod: d.paymentMethod,
      note: d.note ?? null,
    },
  };
}

/** The idempotency key of a document: who it is about and what is done, never a time or a random number. */
export function pushKey(documentType: ErpDocumentType, orderId: string, extra: { status?: string; revision?: number } = {}): string {
  const rev = extra.revision ? `:r${extra.revision}` : '';
  return documentType === 'order.create' ? `order:${orderId}:create${rev}` : `order:${orderId}:status:${extra.status}${rev}`;
}

/** PR 187: the key of a return's QC save. */
export const returnPushKey = (returnId: string, version: number) => `return:${returnId}:v${version}`;

/** Canonical JSON (keys sorted), so the same document always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const hashOf = (doc: ErpDocument) => createHash('sha256').update(canonical(doc)).digest('hex');

/** Guards the A3.5 rule in code too: a document never carries journal lines or ledger postings. */
export function assertNoJournal(doc: ErpDocument): void {
  const text = canonical(doc).toLowerCase();
  if (/"(journal|journalentry|journallines?|ledger|ledgeraccount|debit|credit)"\s*:/.test(text)) throw new InventoryError('INVALID_INPUT', 'a document to the ERP never carries journal lines (A3.5)');
}

export interface EnqueueResult {
  pushId: string;
  status: string;
  /** False when the same document was already there (nothing new was written). */
  created: boolean;
}

async function enqueue(deps: InventoryDeps, storeId: number, referenceId: string, key: string, doc: ErpDocument, tx?: Tx): Promise<EnqueueResult> {
  assertNoJournal(doc);
  const { pushStatus } = await pushDisposition(deps, storeId);
  const db: Db = tx ?? deps.db;
  const requestBody = { ...doc, hash: hashOf(doc) } as unknown as Prisma.InputJsonValue;
  const existing = await db.erpPush.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } } });
  const same = (row: { requestBody: Prisma.JsonValue }) => (row.requestBody as { hash?: string } | null)?.hash === hashOf(doc);
  if (existing) {
    if (!same(existing)) throw new InventoryError('IDEMPOTENCY_MISMATCH', 'this order was already sent with other contents; send a new revision', [key]);
    return { pushId: existing.id, status: existing.status, created: false };
  }
  try {
    const row = await db.erpPush.create({ data: { storeId, documentType: doc.type, referenceId, idempotencyKey: key, status: pushStatus, requestBody, ...(pushStatus === 'SKIPPED_NO_ERP' ? { lastError: 'SKIPPED_NO_ERP' } : {}) } });
    return { pushId: row.id, status: row.status, created: true };
  } catch (e) {
    // Two callers at once: the unique key lets one in; the other finds its row.
    if ((e as { code?: string }).code !== 'P2002') throw e;
    const row = await db.erpPush.findUniqueOrThrow({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } } });
    if (!same(row)) throw new InventoryError('IDEMPOTENCY_MISMATCH', 'this order was already sent with other contents; send a new revision', [key]);
    return { pushId: row.id, status: row.status, created: false };
  }
}

/** Queues the confirmed order's SalesOrder (PR 199). Pass `tx` to save it with the order. */
export async function enqueueOrderPush(deps: InventoryDeps, input: OrderPushInput, opts: { tx?: Tx } = {}): Promise<EnqueueResult> {
  const d = parse(orderPushInput, input, 'order document');
  const store = await deps.db.store.findUnique({ where: { id: d.storeId }, select: { currency: true, archivedAt: true } });
  if (!store || store.archivedAt) throw new InventoryError('NOT_FOUND', 'no such store', ['storeId']);
  const doc = salesOrderDocument(d, currencyDigits(store.currency));
  return enqueue(deps, d.storeId, d.orderId, pushKey('order.create', d.orderId, { revision: d.revision }), doc, opts.tx);
}

/** Queues an order status change (PATCH /orders/{externalOrderId}); it is sent only after the order itself. */
export async function enqueueOrderStatus(deps: InventoryDeps, input: OrderStatusInput, opts: { tx?: Tx } = {}): Promise<EnqueueResult> {
  const d = parse(orderStatusInput, input, 'order status');
  const doc: ErpDocument = { type: 'order.status', externalOrderId: d.externalOrderId, body: { status: d.status } };
  return enqueue(deps, d.storeId, d.orderId, pushKey('order.status', d.orderId, { status: d.status, revision: d.revision }), doc, opts.tx);
}

/**
 * PR 187 — queues a return's sellable pieces (`POST /returns`, each as `good`). Pass `tx` to save it with the QC. The
 * same SKU twice is one line. An unsellable piece is never sent: it stays a loss in the shop's records (D4).
 */
export async function enqueueReturnPush(deps: InventoryDeps, input: ReturnPushInput, opts: { tx?: Tx } = {}): Promise<EnqueueResult> {
  const d = parse(returnPushInput, input, 'return document');
  const bySku = new Map<string, number>();
  for (const i of d.items) bySku.set(i.sku, (bySku.get(i.sku) ?? 0) + i.quantity);
  const doc: ErpDocument = { type: 'return.create', body: { externalOrderId: d.externalOrderId, reason: d.reason, items: [...bySku].map(([sku, quantity]) => ({ sku, quantity, qc: ERP_RETURN_QC_GOOD })) } };
  return enqueue(deps, d.storeId, d.orderId, returnPushKey(d.returnId, d.version), doc, opts.tx);
}

/**
 * PR 187 — a return document's outcome on the pieces it carries (ReturnItem.erpPushId): sent → RESTOCKED, refused or
 * dead → ERP_FAILED, skipped (no ERP) → NO_ERP, queued again by hand → ERP_PENDING. A piece's own QC never changes.
 */
async function settleReturnItems(db: Db, pushIds: string[], state: 'RESTOCKED' | 'ERP_FAILED' | 'NO_ERP' | 'ERP_PENDING'): Promise<void> {
  if (!pushIds.length) return;
  await db.returnItem.updateMany({ where: { erpPushId: { in: pushIds }, dispositionState: { in: ['ERP_PENDING', 'ERP_FAILED', 'NO_ERP'] } }, data: { dispositionState: state } });
}

// ---- the relay ------------------------------------------------------------------------------------------------------

/** The pause before the n-th try again (n ≥ 1): base × 2^(n−1) seconds, at most the cap. */
export function pushBackoffMs(failedAttempts: number, baseSeconds: number, maxSeconds: number): number {
  return Math.min(maxSeconds, baseSeconds * 2 ** Math.max(0, failedAttempts - 1)) * 1000;
}

/** ERP answers that mean "this document is wrong": the same document again cannot help. */
const REFUSED = new Set(['INVALID_REQUEST', 'CONFLICT', 'NOT_FOUND', 'BAD_RESPONSE']);

export interface RelayResult {
  stores: number;
  sent: number;
  replayed: number;
  retrying: number;
  failed: number;
  dead: number;
  skipped: number;
  /** Rows left waiting for a real ERP connection (practice or unusable ERP). */
  waiting: number;
  runIds: string[];
}

const docOf = (body: Prisma.JsonValue): ErpDocument => {
  const { hash: _h, ...doc } = body as unknown as ErpDocument & { hash?: string };
  return doc as ErpDocument;
};

/** Sends what is due (job `inventory.erp.pushDocuments`). One store, or every store with something due. */
export async function relayErpPushes(deps: InventoryDeps, opts: { storeId?: number } = {}): Promise<RelayResult> {
  const out: RelayResult = { stores: 0, sent: 0, replayed: 0, retrying: 0, failed: 0, dead: 0, skipped: 0, waiting: 0, runIds: [] };
  const db = deps.db;
  const now = nowOf(deps);
  const due = { status: 'PENDING' as const, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] };
  const stores = opts.storeId ? [{ storeId: opts.storeId }] : await db.erpPush.findMany({ where: due, select: { storeId: true }, distinct: ['storeId'], orderBy: { storeId: 'asc' } });
  const [batch, maxAttempts, baseS, maxS] = await Promise.all([setting(deps, null, 'erp.push.batchSize'), setting(deps, null, 'erp.push.maxAttempts'), setting(deps, null, 'erp.push.backoffBaseSeconds'), setting(deps, null, 'erp.push.backoffMaxSeconds')]);

  for (const { storeId } of stores) {
    const link = await resolveErp(deps, storeId);
    const rows = await db.erpPush.findMany({ where: { storeId, ...due }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: batch });
    if (!rows.length) continue;
    out.stores++;
    const { disposition } = await pushDisposition(deps, storeId);
    if (disposition === 'skip') {
      out.skipped += (await db.erpPush.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'PENDING' }, data: { status: 'SKIPPED_NO_ERP', lastError: 'SKIPPED_NO_ERP' } })).count;
      await settleReturnItems(db, rows.filter((r) => r.documentType === 'return.create').map((r) => r.id), 'NO_ERP');
      continue;
    }
    if (disposition === 'hold' || !('api' in link)) {
      out.waiting += rows.length;
      continue;
    }
    const policy = { ...(await retryPolicy(deps)), maxAttempts: 1 };
    const run = await db.erpSyncRun.create({ data: { storeId, kind: 'documents.push', status: 'RUNNING', startedAt: now }, select: { id: true } });
    out.runIds.push(run.id);
    let ok = 0;
    let bad = 0;
    let lastError: string | null = null;
    try {
      await checkCompany(deps, link, (await callErp(deps, policy, (o) => link.api.health(o))).value);
    } catch (e) {
      lastError = errorText(e);
      await db.erpPush.updateMany({ where: { id: { in: rows.map((r) => r.id) }, status: 'PENDING' }, data: { lastError } });
      await db.erpSyncRun.update({ where: { id: run.id }, data: { status: 'FAILED', itemsFailed: rows.length, error: lastError, finishedAt: nowOf(deps) } });
      out.waiting += rows.length;
      continue;
    }
    const sentOrders = new Set((await db.erpPush.findMany({ where: { storeId, documentType: 'order.create', status: 'SENT', referenceId: { in: rows.map((r) => r.referenceId) } }, select: { referenceId: true } })).map((r) => r.referenceId));
    for (const row of rows) {
      // A status change or a return waits for its order (contract: the order must exist first).
      if ((row.documentType === 'order.status' || row.documentType === 'return.create') && !sentOrders.has(row.referenceId)) {
        out.waiting++;
        continue;
      }
      const lease = new Date(now.getTime() + policy.timeoutMs * 2);
      const claimed = await db.erpPush.updateMany({ where: { id: row.id, ...due }, data: { nextAttemptAt: lease, attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      const attempts = row.attempts + 1;
      try {
        const r = (await callErp(deps, policy, (o) => link.api.push(docOf(row.requestBody), { ...o, idempotencyKey: row.idempotencyKey }))).value;
        await db.erpPush.update({
          where: { id: row.id },
          data: { status: 'SENT', responseStatus: r.status, responseBody: (r.body ?? null) as Prisma.InputJsonValue, erpId: r.erpId, sentAt: nowOf(deps), nextAttemptAt: null, lastError: null },
        });
        if (row.documentType === 'order.create') sentOrders.add(row.referenceId);
        if (row.documentType === 'return.create') await settleReturnItems(db, [row.id], 'RESTOCKED');
        out.sent++;
        if (r.replayed) out.replayed++;
        ok++;
      } catch (e) {
        const err = toErpError((e as { erp?: unknown }).erp ?? e);
        const text = errorText(e);
        lastError = text;
        bad++;
        if (REFUSED.has(err.code)) {
          await db.erpPush.update({ where: { id: row.id }, data: { status: 'FAILED', responseStatus: err.status, lastError: text, nextAttemptAt: null } });
          if (row.documentType === 'return.create') await settleReturnItems(db, [row.id], 'ERP_FAILED');
          out.failed++;
        } else if (attempts >= maxAttempts) {
          await db.erpPush.update({ where: { id: row.id }, data: { status: 'DEAD', responseStatus: err.status, lastError: text, nextAttemptAt: null } });
          if (row.documentType === 'return.create') await settleReturnItems(db, [row.id], 'ERP_FAILED');
          out.dead++;
        } else {
          await db.erpPush.update({ where: { id: row.id }, data: { responseStatus: err.status, lastError: text, nextAttemptAt: new Date(nowOf(deps).getTime() + pushBackoffMs(attempts, baseS, maxS)) } });
          out.retrying++;
        }
      }
    }
    await db.erpSyncRun.update({ where: { id: run.id }, data: { status: bad && !ok ? 'FAILED' : 'SUCCEEDED', itemsOk: ok, itemsFailed: bad, error: bad ? lastError : null, finishedAt: nowOf(deps) } });
  }
  return out;
}

// ---- reading and sending again by hand (PR 205, 206) ------------------------------------------------------------------

export type PushStatusName = 'PENDING' | 'SENT' | 'FAILED' | 'DEAD' | 'SKIPPED_NO_ERP';

export interface PushView {
  id: string;
  documentType: string;
  referenceId: string;
  /** The order number, from the document. */
  externalOrderId: string | null;
  status: PushStatusName;
  attempts: number;
  lastError: string | null;
  erpId: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const viewOf = (r: { id: string; documentType: string; referenceId: string; requestBody: Prisma.JsonValue; status: PushStatusName; attempts: number; lastError: string | null; erpId: string | null; nextAttemptAt: Date | null; sentAt: Date | null; createdAt: Date }): PushView => {
  const doc = docOf(r.requestBody);
  return {
    id: r.id,
    documentType: r.documentType,
    referenceId: r.referenceId,
    externalOrderId: doc.type === 'order.create' || doc.type === 'return.create' ? doc.body.externalOrderId : doc.type === 'order.status' ? doc.externalOrderId : null,
    status: r.status,
    attempts: r.attempts,
    lastError: r.lastError,
    erpId: r.erpId,
    nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
};

export interface PushCounts {
  pending: number;
  failed: number;
  dead: number;
  skipped: number;
  sent: number;
  oldestPendingAt: string | null;
  nextAttemptAt: string | null;
}

export async function pushCounts(db: Db, storeId: number): Promise<PushCounts> {
  const [groups, oldest, next] = await Promise.all([
    db.erpPush.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } }),
    db.erpPush.findFirst({ where: { storeId, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.erpPush.findFirst({ where: { storeId, status: 'PENDING', nextAttemptAt: { not: null } }, orderBy: { nextAttemptAt: 'asc' }, select: { nextAttemptAt: true } }),
  ]);
  const n = (s: PushStatusName) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { pending: n('PENDING'), failed: n('FAILED'), dead: n('DEAD'), skipped: n('SKIPPED_NO_ERP'), sent: n('SENT'), oldestPendingAt: oldest?.createdAt.toISOString() ?? null, nextAttemptAt: next?.nextAttemptAt?.toISOString() ?? null };
}

/** Documents of this store, newest first, optionally of some states (needs `inventory.read`). */
export async function listErpPushes(deps: InventoryDeps, who: Who, opts: { status?: PushStatusName[]; limit?: number } = {}): Promise<{ counts: PushCounts; items: PushView[] }> {
  await allow(deps, who, 'inventory.read');
  const limit = opts.limit ?? (await setting(deps, null, 'inventory.admin.listSize'));
  const [counts, rows] = await Promise.all([
    pushCounts(deps.db, who.storeId),
    deps.db.erpPush.findMany({ where: { storeId: who.storeId, ...(opts.status?.length ? { status: { in: opts.status } } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit }),
  ]);
  return { counts, items: rows.map(viewOf) };
}

export const retryInput = z.object({ ids: z.array(z.uuid()).min(1).max(1000).optional(), all: z.literal(true).optional() }).strict().refine((v) => !!v.ids !== !!v.all, { message: 'name the documents or ask for all' });
export type RetryInput = z.input<typeof retryInput>;

/**
 * PR 206 — sends failed, dead or skipped documents again (needs `inventory.sync`): back to PENDING with their tries
 * reset. The idempotency key stays the same, so a document the ERP already has is not applied twice.
 */
export async function retryErpPushes(deps: InventoryDeps, who: Who, input: z.input<typeof retryInput>): Promise<{ queued: number }> {
  await allow(deps, who, 'inventory.sync');
  const d = parse(retryInput, input, 'retry');
  return deps.db.$transaction(async (tx) => {
    const where = { storeId: who.storeId, status: { in: ['FAILED' as const, 'DEAD' as const, 'SKIPPED_NO_ERP' as const] }, ...(d.ids ? { id: { in: d.ids } } : {}) };
    const rows = await tx.erpPush.findMany({ where, select: { id: true, status: true, documentType: true } });
    if (!rows.length) return { queued: 0 };
    const n = (await tx.erpPush.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: null } })).count;
    await settleReturnItems(tx, rows.filter((r) => r.documentType === 'return.create').map((r) => r.id), 'ERP_PENDING');
    await logChange(tx, who, { action: 'erp.push.retry', entityType: 'ErpPush', entityId: d.ids ? rows.map((r) => r.id).join(',').slice(0, 500) : 'all', before: { statuses: [...new Set(rows.map((r) => r.status))] }, after: { status: 'PENDING', count: n }, storeId: who.storeId });
    return { queued: n };
  }, TX);
}
