// PR 563 (follow-up 51) — the call queue the order landed in. An order is never held over an address: the checkout
// places it and leaves a call task (address unclear, charge not set, address check, a failed payment), and the order
// service's timers add theirs (a long hold, an overdue advance, a duplicate to ask about). This is the list the AI or an
// agent works through; reading it needs `orders.read`. Working a task (who calls, the outcome) is the call screen's
// (PR 545, with the admin shell): nothing here changes an order, holds it or blocks anyone.
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { audit } from '@extas/auth';
import { allow, nowOf, parse, setting, TX, UUID, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { eventRow, staffBy } from './service';

/** The reasons the shop's own steps give a call task (CallTask.reason). */
export const CALL_TASK_REASONS = ['ADDRESS_UNCLEAR', 'CHARGE_NOT_SET', 'ADDRESS_CHECK', 'PAYMENT_FAILED', 'HOLD_REVIEW', 'ADVANCE_OVERDUE', 'DUPLICATE_CHECK', 'ADDRESS_CHANGED', 'TWO_SIZE', 'SELF_CONFIRM_NO_REPLY', 'SELF_CONFIRM_CHANGE', 'SELF_CONFIRM_CANCEL', 'PACKING_ISSUE', 'NEW_CUSTOMER'] as const;

export const callQueueQuery = z
  .object({
    /** One reason, or every reason. */
    reason: z.string().trim().min(1).max(60).optional(),
    status: z.enum(['open', 'closed', 'all']).default('open'),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export interface CallRow {
  taskId: string;
  reason: string;
  status: string;
  createdAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;
  outcome: string | null;
  /** One line per recorded try ("NO_ANSWER: …"), oldest first (PR 545). */
  notes: string | null;
  /** The order the call is about (null for a task with no order). */
  order: {
    id: string;
    number: string;
    status: string;
    customerName: string | null;
    phone: string | null;
    /** What he typed, as he typed it; the full address we hold for packing, when one was attached (PR 561). */
    shippingAddressText: string | null;
    backfilledAddress: string | null;
    addressUnclear: boolean;
    chargeFixed: boolean;
    flags: string[];
    placedAt: Date;
  } | null;
}

const OPEN = ['OPEN', 'IN_PROGRESS'] as const;

/** The call queue: open tasks oldest first (the longest wait on top), or the closed ones newest first. */
export async function callQueue(deps: OrdersDeps, who: Who, query: unknown = {}): Promise<{ rows: CallRow[]; next: string | null }> {
  await allow(deps, who, 'orders.read');
  const q = parse(callQueueQuery, query, 'query');
  const take = q.limit ?? (await setting(deps, who.storeId, 'orders.list.pageSize'));
  const where: Prisma.CallTaskWhereInput = {
    storeId: who.storeId,
    ...(q.reason ? { reason: q.reason } : {}),
    ...(q.status === 'open' ? { status: { in: [...OPEN] } } : q.status === 'closed' ? { status: { notIn: [...OPEN] } } : {}),
  };
  const tasks = await deps.db.callTask.findMany({ where, orderBy: [{ createdAt: q.status === 'open' ? 'asc' : 'desc' }, { id: 'asc' }], take: take + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const page = tasks.slice(0, take);
  const ids = [...new Set(page.map((t) => t.orderId).filter((x): x is string => !!x))];
  const orders = new Map(
    (
      await deps.db.order.findMany({
        where: { storeId: who.storeId, id: { in: ids } },
        select: { id: true, number: true, status: true, customerName: true, phone: true, shippingAddressText: true, backfilledAddress: true, addressUnclear: true, chargeFixed: true, flags: true, placedAt: true },
      })
    ).map((o) => [o.id, o]),
  );
  const rows: CallRow[] = page.map((t) => ({
    taskId: t.id,
    reason: t.reason,
    status: t.status,
    createdAt: t.createdAt,
    dueAt: t.dueAt,
    closedAt: t.closedAt,
    outcome: t.outcome,
    notes: t.notes,
    order: t.orderId ? (orders.get(t.orderId) ?? null) : null,
  }));
  return { rows, next: tasks.length > take ? page[page.length - 1]!.id : null };
}

/** The timeline type of a recorded call (the order's own timeline; the team only). */
export const CALL_OUTCOME_EVENT = 'order.callOutcome';

export const recordCallInput = z
  .object({
    /** One of the owner's call outcomes (`orders.callOutcomes`). */
    outcome: z.string().trim().min(1).max(40),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export interface RecordCallResult {
  taskId: string;
  outcome: string;
  /** The outcome closed the task (`done`), or it stays in the queue for the next try. */
  status: 'DONE' | 'IN_PROGRESS';
}

/**
 * PR 545 — a person records what the call found (`orders.confirm`): the outcome from the owner's list, an optional note,
 * who called. An outcome marked `done` closes the task; any other (no answer, call later) leaves it open (in progress)
 * in the queue for the next try. The order's timeline gets the line. Nothing else changes: the call never
 * confirms, holds, cancels or blocks — a person does that with the order's own commands (CLAUDE.md rule 6).
 */
export async function recordCall(deps: OrdersDeps, who: Who, taskId: string, input: unknown): Promise<RecordCallResult> {
  await allow(deps, who, 'orders.confirm');
  if (!UUID.test(taskId)) throw new OrdersError('NOT_FOUND', 'no such call', ['taskId']);
  const d = parse(recordCallInput, input, 'call');
  const outcomes = await setting(deps, who.storeId, 'orders.callOutcomes');
  const chosen = outcomes.find((o) => o.key === d.outcome);
  if (!chosen) throw new OrdersError('INVALID_INPUT', 'not one of the call outcomes', ['outcome']);
  const now = nowOf(deps);
  const by = staffBy(who.actor, who.ctx);
  const status = chosen.done ? 'DONE' : 'IN_PROGRESS';
  const before = await deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`call-task:${taskId}`}, 0))`;
    const t = await tx.callTask.findFirst({ where: { storeId: who.storeId, id: taskId } });
    if (!t) throw new OrdersError('NOT_FOUND', 'no such call', ['taskId']);
    if (!(OPEN as readonly string[]).includes(t.status)) throw new OrdersError('NOTHING_CHANGED', 'this call was closed already', ['taskId']);
    const line = `${chosen.key}${d.note ? `: ${d.note}` : ''}`;
    await tx.callTask.update({
      where: { id: t.id },
      data: {
        outcome: chosen.key,
        notes: t.notes ? `${t.notes}\n${line}` : line,
        assignedToId: who.actor.staffUserId ?? null,
        status,
        closedAt: chosen.done ? now : null,
      },
    });
    if (t.orderId) await eventRow(tx, by, { storeId: who.storeId, orderId: t.orderId, type: CALL_OUTCOME_EVENT, reasonCode: chosen.key, message: d.note ?? null, data: { taskId: t.id, reason: t.reason, outcome: chosen.key, done: chosen.done } });
    return { status: t.status, outcome: t.outcome };
  }, TX);
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'orders.call.record', entityType: 'CallTask', entityId: taskId, before, after: { status, outcome: chosen.key, note: d.note ?? null } }, { source: 'admin-api', ...who.ctx });
  return { taskId, outcome: chosen.key, status };
}

/** The open calls by reason (`orders.read`): the chips of the call screen. */
export async function callReasonCounts(deps: OrdersDeps, who: Who): Promise<Record<string, number>> {
  await allow(deps, who, 'orders.read');
  const rows = await deps.db.callTask.groupBy({ by: ['reason'], where: { storeId: who.storeId, status: { in: [...OPEN] } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.reason, r._count._all]));
}

/** The order's open call for one reason, if any (the order page's band offers "Record call" on it). */
export async function openCallOf(deps: OrdersDeps, storeId: number, orderId: string, reason: string): Promise<{ taskId: string } | null> {
  const t = await deps.db.callTask.findFirst({ where: { storeId, orderId, reason, status: { in: [...OPEN] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
  return t ? { taskId: t.id } : null;
}
