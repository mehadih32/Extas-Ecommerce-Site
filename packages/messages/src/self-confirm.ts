// PR 148, CN-014 idea 5 — the WhatsApp self-confirm (off by default; `messages.journey.selfConfirm`, `messages.selfConfirm`).
// A cash-on-delivery order gets "reply 1 to send it, 2 to change it, 3 to cancel it". What happens to a reply:
//
// - 1 (his yes): a timeline row for the team and the "thank you" answer, and — with `messages.selfConfirm.confirmOnYes`
//   (on, as in the demo) — the order confirmed through the order service's own confirm (`confirmBy`), with every guard a
//   staff confirm has: an open duplicate review, a cancel request or an advance still owed leave it for the team (the
//   refusal is returned and the reply stays on the timeline). Off: the team confirms, the "1" only noted.
// - 2 or 3: a call task (SELF_CONFIRM_CHANGE / SELF_CONFIRM_CANCEL) and the "our team will call you" answer. Nothing is
//   changed or cancelled without a person (hard rule 6).
// - no reply in `messages.selfConfirm.waitHours` (0 = never): a call task SELF_CONFIRM_NO_REPLY, so the order is
//   confirmed by phone as it would have been without the self-confirm.
//
// The reply comes from the WhatsApp provider's inbound webhook once the owner connects one (follow-up in PROGRESS.md);
// until then a staff member records what the customer answered (`messages.selfConfirm.reply`).
import { confirmBy, eventRow, OrdersError, staffBy, systemBy, type By } from '@extas/orders';
import { z } from 'zod';
import { allow, logChange, MessagesError, nowOf, parse, setting, TX, type MessagesDeps, type Who } from './context';
import { SELF_CONFIRM_ANSWER, SELF_CONFIRM_ANSWERS, type SelfConfirmAnswer, type SelfConfirmCode } from './pure';

/** The timeline types the self-confirm writes. */
export const SELF_CONFIRM_EVENTS = { reply: 'message.selfConfirm.reply', noReply: 'message.selfConfirm.noReply' } as const;

/** The call queue reason when no reply came (CallTask.reason; packages/orders CALL_TASK_REASONS). */
export const SELF_CONFIRM_NO_REPLY = 'SELF_CONFIRM_NO_REPLY';

const SENT = ['SENT', 'DELIVERED'] as const;
const OPEN = ['OPEN', 'IN_PROGRESS'] as const;

export interface SelfConfirmReplyResult {
  orderId: string;
  number: string;
  answer: SelfConfirmAnswer;
  code: SelfConfirmCode;
  /** The call task the reply put in the queue (2, 3), or null. */
  callTaskId: string | null;
  /** The answer message was queued (false when the same answer was already recorded). */
  answerQueued: boolean;
  /** The same answer had been recorded before: nothing new was done. */
  repeated: boolean;
  /** His "1" confirmed the order (`confirmOnYes`). */
  confirmed: boolean;
  /** Why his "1" did not confirm it (the order service's refusal code, e.g. CONFLICT), or null. */
  notConfirmed: string | null;
}

/**
 * Records one self-confirm reply of an order. Only an order whose self-confirm message was sent can be answered. The
 * same answer twice does nothing more; a changed mind (1, then 3) is recorded too and does what its answer does.
 */
export async function selfConfirmReply(deps: MessagesDeps, storeId: number, orderId: string, answer: SelfConfirmAnswer, by: By): Promise<SelfConfirmReplyResult> {
  const r = await recordReply(deps, storeId, orderId, answer, by);
  if (r.repeated || r.code !== 'YES' || !(await setting(deps, storeId, 'messages.selfConfirm')).confirmOnYes) return r;
  // after the reply's own transaction (the order service takes the order's lock itself)
  try {
    await confirmBy(deps, { storeId, orderId }, by);
    return { ...r, confirmed: true };
  } catch (e) {
    if (e instanceof OrdersError) return { ...r, notConfirmed: e.code };
    throw e;
  }
}

async function recordReply(deps: MessagesDeps, storeId: number, orderId: string, answer: SelfConfirmAnswer, by: By): Promise<SelfConfirmReplyResult> {
  const a = SELF_CONFIRM_ANSWERS[answer];
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
    if (!locked.length) throw new MessagesError('NOT_FOUND', 'no such order', ['orderId']);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, number: true, customerId: true } });
    const asked = await tx.notificationLog.findFirst({
      where: { storeId, orderId, step: 'selfConfirm', status: { in: [...SENT] } },
      orderBy: { sentAt: 'desc' },
      select: { channel: true, recipient: true },
    });
    if (!asked) throw new MessagesError('NOT_FOUND', 'no self-confirm message went to this order', ['orderId']);
    const last = await tx.orderEvent.findFirst({ where: { storeId, orderId, type: SELF_CONFIRM_EVENTS.reply }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { reasonCode: true } });
    if (last?.reasonCode === a.code) return { orderId, number: o.number, answer, code: a.code, callTaskId: null, answerQueued: false, repeated: true, confirmed: false, notConfirmed: null };

    await eventRow(tx, by, { storeId, orderId, type: SELF_CONFIRM_EVENTS.reply, reasonCode: a.code, data: { answer, channel: asked.channel } });
    const reply = await tx.orderEvent.findFirstOrThrow({ where: { storeId, orderId, type: SELF_CONFIRM_EVENTS.reply }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });

    let callTaskId: string | null = null;
    if (a.callReason) {
      const open = await tx.callTask.findFirst({ where: { storeId, orderId, reason: a.callReason, status: { in: [...OPEN] } }, select: { id: true } });
      callTaskId = open?.id ?? (await tx.callTask.create({ data: { storeId, orderId, customerId: o.customerId, reason: a.callReason, dueAt: now }, select: { id: true } })).id;
    }
    // the answer goes back on the channel the question went on, to the same number; one per answer, never twice
    const made = await tx.notificationLog.createMany({
      data: [
        {
          storeId,
          orderId,
          customerId: o.customerId,
          channel: asked.channel,
          recipient: asked.recipient,
          status: 'QUEUED',
          dedupeKey: `order:${orderId}:${SELF_CONFIRM_ANSWER}:${a.code}:${asked.channel}`,
          step: SELF_CONFIRM_ANSWER,
          sendAfter: now,
          eventId: reply.id,
        },
      ],
      skipDuplicates: true,
    });
    return { orderId, number: o.number, answer, code: a.code, callTaskId, answerQueued: made.count === 1, repeated: false, confirmed: false, notConfirmed: null };
  }, TX);
}

export const selfConfirmReplyInput = z
  .object({
    orderNumber: z.string().trim().min(1).max(40),
    answer: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

/** A staff member records what the customer answered (`messages.selfConfirm.reply`); audited. */
export async function recordSelfConfirmReply(deps: MessagesDeps, who: Who, input: unknown): Promise<SelfConfirmReplyResult> {
  await allow(deps, who, 'messages.selfConfirm.reply');
  const d = parse(selfConfirmReplyInput, input, 'reply');
  const o = await deps.db.order.findFirst({ where: { storeId: who.storeId, number: d.orderNumber }, select: { id: true } });
  if (!o) throw new MessagesError('NOT_FOUND', 'no such order', ['orderNumber']);
  const r = await selfConfirmReply(deps, who.storeId, o.id, d.answer, staffBy(who.actor, who.ctx));
  if (!r.repeated) await logChange(deps.db, who, { action: 'messages.selfConfirm.reply', entityType: 'Order', entityId: o.id, before: null, after: { answer: r.answer, code: r.code, callTaskId: r.callTaskId, confirmed: r.confirmed, notConfirmed: r.notConfirmed } });
  return r;
}

export interface SelfConfirmTimerResult {
  noReply: number;
}

/** How far back the timer looks for unanswered self-confirms (older ones were handled, or the order moved on). */
const TIMER_WINDOW_MS = 7 * 24 * 3_600_000;

/**
 * The no-reply timer: an order still PLACED whose self-confirm went out `waitHours` ago with no reply gets one call task.
 * Safe to run again: an order that ever had this task gets no second one.
 */
export async function selfConfirmTimers(deps: MessagesDeps, storeId: number): Promise<SelfConfirmTimerResult> {
  const sc = await setting(deps, storeId, 'messages.selfConfirm');
  if (sc.waitHours <= 0) return { noReply: 0 };
  const now = nowOf(deps);
  const cutoff = new Date(now.getTime() - sc.waitHours * 3_600_000);
  const asked = await deps.db.notificationLog.findMany({
    where: { storeId, step: 'selfConfirm', status: { in: [...SENT] }, orderId: { not: null }, sentAt: { lte: cutoff, gte: new Date(cutoff.getTime() - TIMER_WINDOW_MS) } },
    select: { orderId: true },
    distinct: ['orderId'],
    take: 500,
  });
  const by = systemBy('messages-self-confirm');
  let noReply = 0;
  for (const { orderId } of asked) {
    const made = await deps.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const o = await tx.order.findUnique({ where: { id: orderId! }, select: { status: true, customerId: true } });
      if (!o || o.status !== 'PLACED') return false;
      const [replied, task] = await Promise.all([
        tx.orderEvent.count({ where: { storeId, orderId: orderId!, type: SELF_CONFIRM_EVENTS.reply } }),
        tx.callTask.count({ where: { storeId, orderId, reason: SELF_CONFIRM_NO_REPLY } }),
      ]);
      if (replied || task) return false;
      await tx.callTask.create({ data: { storeId, orderId, customerId: o.customerId, reason: SELF_CONFIRM_NO_REPLY, dueAt: now } });
      await eventRow(tx, by, { storeId, orderId: orderId!, type: SELF_CONFIRM_EVENTS.noReply, reasonCode: SELF_CONFIRM_NO_REPLY, data: { waitHours: sc.waitHours } });
      return true;
    }, TX);
    if (made) noReply++;
  }
  return { noReply };
}
