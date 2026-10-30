// PR 608 (CN-028) — the ERP event ledger. In `erp.model` v6 the ERP tells the shop what happened by events: the
// identification of a delivery result, a Hold parcel resolved, the owner's decision on each returned piece, a short or
// filled order line, an exchange billed, settled, credited or cancelled, a missing daily summary, the account on hold
// or released, a changed shop price, a payment recorded (docs/erp/site-changes-v6.md §2.8).
//
// - Every v6 event is kept once, by its `eventId`, forever (ErpEvent, unique per store link): the ERP never uses an
//   id again, so the same event by webhook (webhook.ts) and by the hourly pull (erp-events-pull.ts) is one row, and a
//   retry a week later is still the same event. CN-029 §16: an event belongs to the one store whose own key or secret
//   it came through (never guessed from an order number), under that store's open ERP link (erp-link.ts); the body of
//   a row never changes (a database trigger, migration 0049), only its processing state. This is stricter than the contract asks (a permanent filter for the
//   events that move money or credit, `moneyEvent`); the 72-hour filter of PR 196 stays for stock and variant events.
// - `applyErpEvents` (job `inventory.erp.applyEvents`) works through the stored events in the ERP's order. A
//   correction (`reverses`) undoes its original first; one that arrives before its original waits for it
//   (WAITING_ORIGINAL) and is applied once the original is in; after `erp.events.correctionWaitHours` without it, it is
//   FAILED (ORIGINAL_NEVER_CAME) and the health panel shows it. Only an APPLIED original is undone; an original that
//   was only STORED or IGNORED changed nothing, so it is marked reversed; a FAILED original keeps the correction waiting.
//   New events (RECEIVED) are read apart from the waiting ones, so a waiting correction never holds up the queue.
//   Applying twice changes nothing: a row is applied once.
// - Each row keeps the hash of its body (`bodyHash`, the same for webhook and pull) and, by webhook, of the exact signed
//   raw body. A repeat of an eventId with another body is never applied and never silently accepted: it is counted on
//   the row (`conflictCount`, `conflictAt`, `conflictHash`) and shown on the health panel.
// - What an event does is its handler (`ERP_EVENT_HANDLERS`). An event with no handler of its own is STORED: kept for
//   the part of the shop that reads it (the Returns section, exchanges, the account ledger and the books match, PR
//   611–617). An event that fails is tried again up to `erp.events.maxAttempts`, then FAILED (shown, never lost).
// - Courier claims (PR 608): a piece declined as missing, or as stain or damage (maybe the courier's fault), becomes an
//   ErpClaim row; the pull also reads `GET /returns/claims`. A reversed decision marks the claim REVERSED (kept).
import { createHash } from 'node:crypto';
import type { Prisma } from '@extas/db/client';
import { ERP_CLAIM_REASONS, movesMoney, type ErpV6Event, type ErpV6EventType } from '@extas/adapters';
import { nowOf, setting, TX, type Db, type InventoryDeps, type Tx } from './context';
import { ERP_ORDER_EVENT_HANDLERS } from './erp-orders-v6-events';

/** One ledger row (ErpEvent). */
export type ErpEventRow = Prisma.ErpEventGetPayload<true>;
export type ErpEventSourceName = 'WEBHOOK' | 'PULL';
export type ErpEventStatusName = 'RECEIVED' | 'APPLIED' | 'STORED' | 'WAITING_ORIGINAL' | 'IGNORED' | 'FAILED';
export const ERP_EVENT_STATUSES: readonly ErpEventStatusName[] = ['RECEIVED', 'APPLIED', 'STORED', 'WAITING_ORIGINAL', 'IGNORED', 'FAILED'];

const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ---- the ledger ---------------------------------------------------------------------------------------------------------

export interface RecordedEvent {
  /** ErpEvent.id */
  id: string;
  created: boolean;
  status: ErpEventStatusName;
  /** A repeat of a known eventId whose body differs from the stored one (counted on the row, never applied). */
  conflict?: boolean;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** JSON with the keys of every object in sorted order: one text for one value, however it was written. */
function stableJson(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** The hash of an event's body as the ledger reads it: the same whether it came by webhook or by pull. */
export function eventBodyHash(ev: Pick<ErpV6Event, 'eventId' | 'type' | 'occurredAt' | 'date' | 'reverses' | 'data'>): string {
  return sha256(stableJson({ eventId: ev.eventId, type: ev.type, occurredAt: ev.occurredAt ?? null, date: ev.date ?? null, reverses: ev.reverses ?? null, data: ev.data }));
}

/**
 * Keeps one v6 event in the store's ledger, once. The same eventId again (webhook retry, or webhook and pull) is the
 * first row. `storeId` and `linkId` are the store whose own connection the event came through and its open link.
 */
export async function recordErpEvent(
  deps: Pick<InventoryDeps, 'db' | 'now'>,
  input: { integrationId: string; storeId: number; linkId: string; source: ErpEventSourceName; event: ErpV6Event; rawBody?: string | null },
): Promise<RecordedEvent> {
  const { integrationId, linkId, event: ev } = input;
  const key = { linkId_eventId: { linkId, eventId: ev.eventId } };
  const bodyHash = eventBodyHash(ev);
  const known = async (row: { id: string; status: ErpEventStatusName; bodyHash: string }): Promise<RecordedEvent> => {
    if (row.bodyHash === bodyHash) return { id: row.id, created: false, status: row.status };
    await deps.db.erpEvent.update({ where: { id: row.id }, data: { conflictCount: { increment: 1 }, conflictAt: nowOf(deps as InventoryDeps), conflictHash: bodyHash } });
    return { id: row.id, created: false, status: row.status, conflict: true };
  };
  const found = await deps.db.erpEvent.findUnique({ where: key, select: { id: true, status: true, bodyHash: true } });
  if (found) return known(found);
  try {
    const row = await deps.db.erpEvent.create({
      data: {
        storeId: input.storeId,
        linkId,
        integrationId,
        eventId: ev.eventId,
        type: ev.type,
        source: input.source,
        moneyEvent: movesMoney(ev),
        occurredAt: ev.occurredAt,
        businessDate: ev.date ? new Date(`${ev.date}T00:00:00Z`) : null,
        reverses: ev.reverses,
        externalOrderId: textOf(ev.data.externalOrderId),
        data: ev.data as Prisma.InputJsonValue,
        bodyHash,
        rawBodyHash: input.rawBody != null ? sha256(input.rawBody) : null,
        receivedAt: nowOf(deps as InventoryDeps),
      },
      select: { id: true, status: true },
    });
    return { id: row.id, created: true, status: row.status };
  } catch (e) {
    // The same event by webhook and by pull at the same moment: the second finds the first's row.
    if ((e as { code?: string }).code === 'P2002') return known(await deps.db.erpEvent.findUniqueOrThrow({ where: key, select: { id: true, status: true, bodyHash: true } }));
    throw e;
  }
}

/**
 * A v6 event from a store's own connection that does not read as v6 (a broken body): kept in the ledger as FAILED, so
 * the health panel shows it and the ERP is answered 2xx (it would otherwise send it again and again). It is kept under
 * its own key, `broken:<hash of the raw body>`, never under the eventId it claims: that slot stays free, so a valid copy
 * of the same event (by the hourly pull, or sent again) is stored and applied as usual. The claimed eventId is named in
 * the row's error. The same broken body sent again is the same row.
 */
export async function recordBrokenErpEvent(
  deps: Pick<InventoryDeps, 'db' | 'now'>,
  input: { integrationId: string; storeId: number; linkId: string; eventId: string | null; type: string | null; detail: string; rawBody: string; body: unknown },
): Promise<RecordedEvent> {
  const rawBodyHash = sha256(input.rawBody);
  const eventId = `broken:${rawBodyHash.slice(0, 40)}`;
  const claimed = input.eventId ? ` (eventId ${input.eventId.slice(0, 200)})` : '';
  const key = { linkId_eventId: { linkId: input.linkId, eventId } };
  const found = await deps.db.erpEvent.findUnique({ where: key, select: { id: true, status: true } });
  if (found) return { id: found.id, created: false, status: found.status };
  const data = (input.body && typeof input.body === 'object' ? input.body : { body: input.rawBody.slice(0, 2000) }) as Prisma.InputJsonValue;
  try {
    const now = nowOf(deps as InventoryDeps);
    const row = await deps.db.erpEvent.create({
      data: {
        storeId: input.storeId,
        linkId: input.linkId,
        integrationId: input.integrationId,
        eventId,
        type: (input.type ?? 'unknown').slice(0, 100),
        source: 'WEBHOOK',
        status: 'FAILED',
        data,
        bodyHash: sha256(stableJson(input.body ?? input.rawBody)),
        rawBodyHash,
        error: `BAD_PAYLOAD${claimed}: ${input.detail}`.slice(0, 500),
        receivedAt: now,
      },
      select: { id: true, status: true },
    });
    return { id: row.id, created: true, status: row.status };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      const row = await deps.db.erpEvent.findUniqueOrThrow({ where: key, select: { id: true, status: true } });
      return { id: row.id, created: false, status: row.status };
    }
    throw e;
  }
}

// ---- what each event does -----------------------------------------------------------------------------------------------

export interface ErpEventContext {
  deps: InventoryDeps;
  tx: Tx;
  /** The event being applied (or, for `undo`, the original being undone). */
  row: ErpEventRow;
  now: Date;
}

export interface ErpEventOutcome {
  status: 'APPLIED' | 'STORED' | 'IGNORED';
  result?: Record<string, unknown>;
}

export interface ErpEventHandler {
  apply(ctx: ErpEventContext): Promise<ErpEventOutcome>;
  /** Undoes what `apply` did, when a correction (`reverses`) names this event. */
  undo?(ctx: ErpEventContext): Promise<void>;
}

const dataOf = (row: ErpEventRow): Record<string, unknown> => (row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {});
const dateOf = (v: unknown): Date | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(`${v.slice(0, 10)}T00:00:00Z`) : null);

export interface ClaimInput {
  storeId: number;
  linkId: string;
  integrationId: string;
  externalOrderId: string;
  lineId: string | null;
  sku: string | null;
  reason: string;
  returnListId: string | null;
  consignmentId: string | null;
  courier: string | null;
  handedBackAt: string | null;
  decidedAt: string | null;
  valueMinor: number | null;
  source: ErpEventSourceName;
  eventId: string | null;
}

/** One courier claim per piece and reason: seen again, it is refreshed (and opened again if it was reversed by event). */
export async function upsertClaim(db: Db, c: ClaimInput, now: Date, opts: { reopen?: boolean } = {}): Promise<'created' | 'updated'> {
  const where = { linkId_externalOrderId_lineId_reason: { linkId: c.linkId, externalOrderId: c.externalOrderId, lineId: c.lineId ?? '', reason: c.reason } };
  const fill = {
    ...(c.sku ? { sku: c.sku } : {}),
    ...(c.returnListId ? { returnListId: c.returnListId } : {}),
    ...(c.consignmentId ? { consignmentId: c.consignmentId } : {}),
    ...(c.courier ? { courier: c.courier } : {}),
    ...(c.handedBackAt ? { handedBackAt: dateOf(c.handedBackAt) } : {}),
    ...(c.decidedAt ? { decidedAt: dateOf(c.decidedAt) } : {}),
    ...(c.valueMinor != null ? { valueMinor: c.valueMinor } : {}),
    ...(c.eventId ? { eventId: c.eventId } : {}),
  };
  const prior = await db.erpClaim.findUnique({ where, select: { id: true } });
  if (prior) {
    await db.erpClaim.update({ where: { id: prior.id }, data: { ...fill, lastSeenAt: now, ...(opts.reopen ? { status: 'OPEN' } : {}) } });
    return 'updated';
  }
  await db.erpClaim.create({
    data: { storeId: c.storeId, linkId: c.linkId, integrationId: c.integrationId, externalOrderId: c.externalOrderId, lineId: c.lineId ?? '', reason: c.reason, source: c.source, firstSeenAt: now, lastSeenAt: now, ...fill },
  });
  return 'created';
}

const CLAIM_REASONS: ReadonlySet<string> = new Set(ERP_CLAIM_REASONS);

/** `return.piece.decided`: a declined piece the courier may owe for becomes a claim; the decision itself is kept. */
const pieceDecided: ErpEventHandler = {
  async apply({ tx, row, now }) {
    const d = dataOf(row);
    const reason = textOf(d.reason);
    if (d.decision !== 'DECLINED' || !reason || !CLAIM_REASONS.has(reason) || !row.externalOrderId) return { status: 'STORED' };
    const r = await upsertClaim(
      tx,
      {
        storeId: row.storeId,
        linkId: row.linkId,
        integrationId: row.integrationId,
        externalOrderId: row.externalOrderId,
        lineId: textOf(d.lineId),
        sku: textOf(d.sku),
        reason,
        returnListId: textOf(d.returnListId),
        consignmentId: textOf(d.consignmentId),
        courier: textOf(d.courier),
        handedBackAt: textOf(d.handedBackAt),
        decidedAt: textOf(d.decidedAt),
        valueMinor: null,
        source: row.source,
        eventId: row.eventId,
      },
      now,
      { reopen: true },
    );
    return { status: 'APPLIED', result: { claim: r } };
  },
  async undo({ tx, row }) {
    await tx.erpClaim.updateMany({ where: { linkId: row.linkId, eventId: row.eventId, status: 'OPEN' }, data: { status: 'REVERSED' } });
  },
};

/**
 * What each v6 event does in the shop. A type that is not here is STORED: kept in the ledger for the part of the shop
 * that reads it (PR 611–617). PR 609 and 610 add their handlers here.
 */
export const ERP_EVENT_HANDLERS: Partial<Record<ErpV6EventType, ErpEventHandler>> = {
  'return.piece.decided': pieceDecided,
  // PR 610, 611: the account's hold and release, a short or filled order line, the delivery identification.
  ...ERP_ORDER_EVENT_HANDLERS,
};

// ---- applying the stored events -----------------------------------------------------------------------------------------

export interface ApplyEventsResult {
  seen: number;
  applied: number;
  stored: number;
  ignored: number;
  waiting: number;
  reversed: number;
  retrying: number;
  failed: number;
}

const OPEN: ErpEventStatusName[] = ['RECEIVED', 'WAITING_ORIGINAL'];

interface ApplyRules {
  maxAttempts: number;
  /** How deep a chain of corrections is followed in one go (a correction of a correction of …): `erp.events.maxChain`. */
  maxChain: number;
}

/** Applies the stored events still waiting, in the ERP's order. Safe to run twice and in parallel with a webhook. */
export async function applyErpEvents(deps: InventoryDeps, opts: { limit?: number } = {}): Promise<ApplyEventsResult> {
  const out: ApplyEventsResult = { seen: 0, applied: 0, stored: 0, ignored: 0, waiting: 0, reversed: 0, retrying: 0, failed: 0 };
  const [batch, maxAttempts, maxChain, waitHours] = await Promise.all([
    setting(deps, null, 'erp.events.applyBatch'),
    setting(deps, null, 'erp.events.maxAttempts'),
    setting(deps, null, 'erp.events.maxChain'),
    setting(deps, null, 'erp.events.correctionWaitHours'),
  ]);
  const rules: ApplyRules = { maxAttempts, maxChain };
  const take = opts.limit ?? batch;
  const now = nowOf(deps);
  // A correction whose original never came: FAILED after the wait, shown on the health panel (never lost).
  const expired = await deps.db.erpEvent.updateMany({
    where: { status: 'WAITING_ORIGINAL', receivedAt: { lt: new Date(now.getTime() - waitHours * 3_600_000) } },
    data: { status: 'FAILED', error: `ORIGINAL_NEVER_CAME: no original within ${waitHours} hours` },
  });
  out.failed += expired.count;
  // New events first, in the ERP's order; they are read apart from the waiting corrections, so those never block them.
  const order = [{ occurredAt: { sort: 'asc' as const, nulls: 'last' as const } }, { receivedAt: 'asc' as const }, { id: 'asc' as const }];
  const fresh = await deps.db.erpEvent.findMany({ where: { status: 'RECEIVED' }, orderBy: order, take, select: { id: true } });
  for (const r of fresh) await applyOne(deps, r.id, out, rules, 0);
  // Then the waiting corrections whose original is in now (and has not failed), chosen in the query itself, so a ready
  // one is never stuck behind more waiting ones than a batch. One just set waiting by this run is not counted twice.
  const done = fresh.map((r) => r.id);
  const ready = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT w."id" FROM "ErpEvent" w
    JOIN "ErpEvent" o ON o."linkId" = w."linkId" AND o."eventId" = w."reverses"
    WHERE w."status" = 'WAITING_ORIGINAL' AND o."status" <> 'FAILED' AND w."id" <> ALL(${done}::uuid[])
    ORDER BY w."occurredAt" ASC NULLS LAST, w."receivedAt" ASC, w."id" ASC
    LIMIT ${take}`;
  for (const w of ready) await applyOne(deps, w.id, out, rules, 0);
  out.waiting += await deps.db.erpEvent.count({ where: { status: 'WAITING_ORIGINAL', id: { notIn: done } } });
  return out;
}

async function applyOne(deps: InventoryDeps, id: string, out: ApplyEventsResult, rules: ApplyRules, depth: number): Promise<void> {
  const { maxAttempts } = rules;
  const row = await deps.db.erpEvent.findUnique({ where: { id } });
  if (!row || !OPEN.includes(row.status)) return;
  out.seen++;
  let original: ErpEventRow | null = null;
  if (row.reverses) {
    original = await deps.db.erpEvent.findUnique({ where: { linkId_eventId: { linkId: row.linkId, eventId: row.reverses } } });
    if (!original) {
      // The correction came first: it waits for its original (the pull fetches it, or its webhook arrives).
      if (row.status !== 'WAITING_ORIGINAL') await deps.db.erpEvent.update({ where: { id }, data: { status: 'WAITING_ORIGINAL' } });
      out.waiting++;
      return;
    }
    if (OPEN.includes(original.status) && depth < rules.maxChain) await applyOne(deps, original.id, out, rules, depth + 1);
    original = await deps.db.erpEvent.findUnique({ where: { id: original.id } });
    if (!original || OPEN.includes(original.status)) {
      out.waiting++;
      return;
    }
    if (original.status === 'FAILED') {
      // The original never applied: nothing can be undone yet. The correction waits (and fails after the wait).
      await deps.db.erpEvent.update({ where: { id }, data: { status: 'WAITING_ORIGINAL', error: `ORIGINAL_FAILED: ${original.eventId} is FAILED; this correction waits for it` } });
      out.waiting++;
      return;
    }
  }
  const now = nowOf(deps);
  try {
    const outcome = await deps.db.$transaction(async (tx) => {
      // Claimed for this run: a parallel run that read the same row finds it applied and does nothing.
      const claimed = await tx.erpEvent.updateMany({ where: { id, status: { in: OPEN } }, data: { attempts: { increment: 1 } } });
      if (!claimed.count) return null;
      if (original && !original.reversedBy) {
        // Only what was applied is undone; a STORED or IGNORED original changed nothing in the shop.
        const h = ERP_EVENT_HANDLERS[original.type as ErpV6EventType];
        if (original.status === 'APPLIED' && h?.undo) await h.undo({ deps, tx, row: original, now });
        await tx.erpEvent.update({ where: { id: original.id }, data: { reversedBy: row.eventId } });
        out.reversed++;
      }
      const handler = ERP_EVENT_HANDLERS[row.type as ErpV6EventType];
      const o: ErpEventOutcome = handler ? await handler.apply({ deps, tx, row, now }) : { status: 'STORED' };
      await tx.erpEvent.update({
        where: { id },
        data: { status: o.status, appliedAt: now, error: null, result: (o.result ?? {}) as Prisma.InputJsonValue },
      });
      return o;
    }, TX);
    if (!outcome) return;
    if (outcome.status === 'APPLIED') out.applied++;
    else if (outcome.status === 'STORED') out.stored++;
    else out.ignored++;
  } catch (e) {
    const text = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    const after = await deps.db.erpEvent.update({ where: { id }, data: { attempts: { increment: 1 }, error: text }, select: { attempts: true } });
    if (after.attempts >= maxAttempts) {
      await deps.db.erpEvent.update({ where: { id }, data: { status: 'FAILED' } });
      out.failed++;
    } else out.retrying++;
  }
}

/** The ledger's counts by status, for the health panel and the books match. */
export async function erpEventCounts(db: Db, opts: { storeId?: number } = {}): Promise<Record<ErpEventStatusName, number>> {
  const rows = await db.erpEvent.groupBy({ by: ['status'], where: opts.storeId ? { storeId: opts.storeId } : {}, _count: { _all: true } });
  const out = Object.fromEntries(ERP_EVENT_STATUSES.map((s) => [s, 0])) as Record<ErpEventStatusName, number>;
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

/** For the health panel: failed events and events repeated with another body (both need a person). */
export async function erpEventProblems(db: Db, storeId: number): Promise<{ failed: number; conflicts: number }> {
  const [failed, conflicts] = await Promise.all([
    db.erpEvent.count({ where: { storeId, status: 'FAILED' } }),
    db.erpEvent.count({ where: { storeId, conflictCount: { gt: 0 } } }),
  ]);
  return { failed, conflicts };
}
