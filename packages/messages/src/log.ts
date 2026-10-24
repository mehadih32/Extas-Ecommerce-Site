// PR 149 — the message log (MSG-05, §8.8): every message the shop meant to send, newest first, with its state, why it
// was skipped or blocked, every try (NotificationAttempt) and the counts per state, so a failure is seen by staff, not
// found by a customer. No message text is kept or shown; the recipient is personal data, so the log needs
// `messages.log.view` (not a `.read` key: the read-only smoke check account never sees it).
//
// Retry by hand (`messages.log.retry`): a FAILED message is tried once more at once, with every check of a normal send
// (the step still fits the order, the caps …). A step that already went by another channel is not retried, so a
// customer never gets it twice. Audited.
import type { Prisma } from '@extas/db/client';
import { MESSAGE_CHANNELS } from '@extas/settings';
import { z } from 'zod';
import { allow, logChange, MessagesError, parse, setting, type MessagesDeps, type Who } from './context';
import { ROW_SELECT, runContext, sendOne, type SendOutcome } from './engine';

const STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'BLOCKED_BY_GUARD'] as const;
type Status = (typeof STATUSES)[number];

export const messageLogQuery = z
  .object({
    status: z.enum(STATUSES).optional(),
    channel: z.enum(MESSAGE_CHANNELS).optional(),
    step: z.string().trim().min(1).max(40).optional(),
    orderNumber: z.string().trim().min(1).max(40).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export interface MessageLogRow {
  id: string;
  createdAt: Date;
  order: { id: string; number: string } | null;
  step: string | null;
  channel: string;
  recipient: string;
  status: string;
  /** Why it was skipped, blocked or is waiting (CAP_SMS, QUIET_HOURS, RETRY …). */
  reason: string | null;
  error: string | null;
  attempts: number;
  provider: string | null;
  mode: string | null;
  sentAt: Date | null;
  /** When it goes (or is tried again) when it is still waiting. */
  sendAfter: Date | null;
  costMinor: number | null;
}

export interface MessageLogPage {
  rows: MessageLogRow[];
  next: string | null;
  /** Every message of the store by state (the failures are the number to watch). */
  counts: Record<Status, number>;
}

const LOG_SELECT = {
  id: true,
  createdAt: true,
  orderId: true,
  step: true,
  channel: true,
  recipient: true,
  status: true,
  reason: true,
  error: true,
  attempts: true,
  provider: true,
  mode: true,
  sentAt: true,
  sendAfter: true,
  costMinor: true,
} satisfies Prisma.NotificationLogSelect;

async function withOrders(deps: MessagesDeps, storeId: number, rows: Prisma.NotificationLogGetPayload<{ select: typeof LOG_SELECT }>[]): Promise<MessageLogRow[]> {
  const ids = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
  const numbers = new Map((await deps.db.order.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, number: true } })).map((o) => [o.id, o.number]));
  return rows.map(({ orderId, ...r }) => ({ ...r, order: orderId && numbers.has(orderId) ? { id: orderId, number: numbers.get(orderId)! } : null }));
}

/** One page of the log, newest first, with the counts per state. */
export async function messageLog(deps: MessagesDeps, who: Who, query: unknown = {}): Promise<MessageLogPage> {
  await allow(deps, who, 'messages.log.view');
  const q = parse(messageLogQuery, query, 'query');
  const take = q.limit ?? (await setting(deps, who.storeId, 'messages.log.pageSize'));
  let orderId: string | undefined;
  if (q.orderNumber) {
    const o = await deps.db.order.findFirst({ where: { storeId: who.storeId, number: q.orderNumber }, select: { id: true } });
    if (!o) return { rows: [], next: null, counts: await countsOf(deps, who.storeId) };
    orderId = o.id;
  }
  const where: Prisma.NotificationLogWhereInput = {
    storeId: who.storeId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.channel ? { channel: q.channel } : {}),
    ...(q.step ? { step: q.step } : {}),
    ...(orderId ? { orderId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const found = await deps.db.notificationLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, select: LOG_SELECT, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const page = found.slice(0, take);
  return { rows: await withOrders(deps, who.storeId, page), next: found.length > take ? page[page.length - 1]!.id : null, counts: await countsOf(deps, who.storeId) };
}

async function countsOf(deps: MessagesDeps, storeId: number): Promise<Record<Status, number>> {
  const groups = await deps.db.notificationLog.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } });
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const g of groups) out[g.status as Status] = g._count._all;
  return out;
}

export interface MessageTry {
  attempt: number;
  ok: boolean;
  provider: string | null;
  mode: string | null;
  error: string | null;
  providerMessageId: string | null;
  costMinor: number | null;
  /** Retried by hand by this staff member. */
  retriedById: string | null;
  at: Date;
}

export interface MessageDetail extends MessageLogRow {
  tries: MessageTry[];
}

/** One message with every try. */
export async function messageDetail(deps: MessagesDeps, who: Who, id: string): Promise<MessageDetail> {
  await allow(deps, who, 'messages.log.view');
  return detailOf(deps, who.storeId, id);
}

async function detailOf(deps: MessagesDeps, storeId: number, id: string): Promise<MessageDetail> {
  if (!z.uuid().safeParse(id).success) throw new MessagesError('INVALID_INPUT', 'the message id is not valid', ['id']);
  const row = await deps.db.notificationLog.findFirst({ where: { id, storeId }, select: LOG_SELECT });
  if (!row) throw new MessagesError('NOT_FOUND', 'no such message', ['id']);
  const [r] = await withOrders(deps, storeId, [row]);
  const tries = await deps.db.notificationAttempt.findMany({ where: { storeId, notificationLogId: id }, orderBy: { attempt: 'asc' } });
  return {
    ...r!,
    tries: tries.map((t) => ({ attempt: t.attempt, ok: t.ok, provider: t.provider, mode: t.mode, error: t.error, providerMessageId: t.providerMessageId, costMinor: t.costMinor, retriedById: t.retriedById, at: t.createdAt })),
  };
}

export interface RetryResult {
  outcome: SendOutcome;
  message: MessageDetail;
}

/** Tries a FAILED message once more, now (`messages.log.retry`); audited. */
export async function retryMessage(deps: MessagesDeps, who: Who, id: string): Promise<RetryResult> {
  await allow(deps, who, 'messages.log.retry');
  const before = await detailOf(deps, who.storeId, id);
  if (before.status !== 'FAILED') throw new MessagesError('NOT_RETRYABLE', 'only a failed message can be tried again', ['status'], { status: before.status });
  if (!before.order || !before.step) throw new MessagesError('NOT_RETRYABLE', 'this message is not part of an order journey', ['id']);
  const went = await deps.db.notificationLog.count({ where: { storeId: who.storeId, orderId: before.order.id, step: before.step, status: { in: ['SENT', 'DELIVERED'] }, id: { not: id } } });
  if (went) throw new MessagesError('NOT_RETRYABLE', 'this step already went to the customer by another channel', ['step']);
  const c = await runContext(deps, who.storeId);
  // back in the queue, due now: the send below claims it like the engine does, so the worker cannot take it too
  const back = await deps.db.notificationLog.updateMany({ where: { id, storeId: who.storeId, status: 'FAILED' }, data: { status: 'QUEUED', sendAfter: c.now, reason: 'STAFF_RETRY' } });
  if (back.count !== 1) throw new MessagesError('STALE', 'the message changed; reload it', ['status']);
  const row = await deps.db.notificationLog.findUniqueOrThrow({ where: { id }, select: ROW_SELECT });
  const outcome = await sendOne(deps, c, row, { retriedById: who.actor.staffUserId ?? null, manual: true });
  const message = await detailOf(deps, who.storeId, id);
  await logChange(deps.db, who, { action: 'messages.log.retry', entityType: 'NotificationLog', entityId: id, before: { status: before.status, attempts: before.attempts }, after: { status: message.status, attempts: message.attempts, outcome } });
  return { outcome, message };
}
