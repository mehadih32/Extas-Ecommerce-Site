// PR 148 — the send engine (BACKEND-ARCHITECTURE §8.8). The worker runs it per store every `messages.engine.everySeconds`:
//
// 1. plan: the order timeline (OrderEvent, the transactional outbox every order change already writes) of the last
//    `lookbackMinutes` is read; each event starts its journey steps (pure.ts `stepsOf`), and each step that is on and
//    fits the order (cash on delivery / prepaid, a gift's receiver …) becomes one QUEUED NotificationLog row per channel,
//    keyed `order:<orderId>:<step>:<channel>`. Planned again on the next run, the key turns it into nothing, and a step
//    an order already has on any channel is not planned again: a step never goes twice (the no-double-send guard). A
//    step older than the look-back is never sent late.
// 2. send: every QUEUED row whose `sendAfter` has passed is claimed (a short lease, so two runs never take one row),
//    then checked once more at the moment it goes — the master switch, quiet hours, whether the step still fits the
//    order, who it goes to, the caps per order, the template, the amount and link rules — and handed to the channel's
//    sender (the mock until the owner enters a key; the row then says MOCK: "would send"). A channel that cannot reach
//    the customer hands the step to its fallback channel.
// 3. self-confirm (CN-014 idea 5): an order whose self-confirm WhatsApp got no reply in `messages.selfConfirm.waitHours`
//    goes to the call queue (self-confirm.ts).
//
// PR 149: every try is one NotificationAttempt row (append-only). A failed try is tried again after the waits of
// `messages.retry` (the row stays QUEUED with the next `sendAfter`); after the last try it is FAILED and the step's
// fallback channel is tried. A number the channel cannot reach is never retried. Staff retry a FAILED row (log.ts).
//
// No message text is stored: the row keeps the step, channel, recipient, template, sender, mode and why.
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { dueOf } from '@extas/orders/pure';
import type { Journey, JourneyStep, MessageChannel } from '@extas/settings';
import { nowOf, setting, TX, type MessagesDeps, type SendResult } from './context';
import { answerTemplate, audienceFits, dedupeKey, dueAt, isCapped, messageLocale, NEVER_QUIET, orderLink, quietUntil, render, SELF_CONFIRM_ANSWER, stepsOf, stillFits, OUT_FOR_DELIVERY_EVENT, type TimelineEvent } from './pure';

/** How long a claimed row is held by one run before another may take it again (a run that died mid-send). */
const CLAIM_LEASE_MS = 10 * 60_000;

/** The order statuses whose timeline rows start a step (the planner reads only these). */
const STEP_STATUSES = ['CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'DELIVERED', 'PARTIALLY_DELIVERED', 'CANCELLED', 'ON_HOLD', 'AWAITING_ADVANCE'] as const;

type NotificationStatus = NonNullable<Prisma.NotificationLogCreateManyInput['status']>;

const ORDER_SELECT = {
  id: true,
  storeId: true,
  number: true,
  status: true,
  placedAt: true,
  phone: true,
  email: true,
  customerName: true,
  customerId: true,
  paymentMethod: true,
  currency: true,
  totalMinor: true,
  walletAppliedMinor: true,
  paidMinor: true,
  isGift: true,
  giftSenderName: true,
  giftSenderContact: true,
} satisfies Prisma.OrderSelect;
type OrderFacts = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

const emailOf = (s: string | null | undefined): string | null => (s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) ? s.trim() : null);
/** A phone for SMS and WhatsApp: a Bangladeshi number in any form, or any number already in +country form. */
function phoneOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const bd = phoneNormalizeBD(s);
  if (bd.ok) return bd.e164;
  const t = s.replace(/[\s-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
}

/**
 * Who a step's message goes to on a channel. A gift's updates go to the sender who paid (his phone or e-mail), never to
 * the receiver — the receiver hears only from the gift receiver notice (PR 605, follow-up 213).
 */
export function recipientOf(o: Pick<OrderFacts, 'phone' | 'email' | 'isGift' | 'giftSenderContact'>, step: string, channel: MessageChannel): string | null {
  if (o.isGift && step !== 'giftReceiver') return channel === 'EMAIL' ? emailOf(o.giftSenderContact) : phoneOf(o.giftSenderContact);
  return channel === 'EMAIL' ? emailOf(o.email) : phoneOf(o.phone);
}

/** Whether a step applies to this order at all (no row is planned when it does not). */
async function stepApplies(deps: MessagesDeps, step: JourneyStep, cfg: Journey[JourneyStep], o: OrderFacts, selfConfirmNewOnly: boolean): Promise<boolean> {
  if (!audienceFits(cfg.who, o.paymentMethod)) return false;
  if (step === 'giftReceiver') return o.isGift;
  if (step === 'selfConfirm') {
    if (o.isGift) return false;
    if (selfConfirmNewOnly && o.phone) {
      const before = await deps.db.order.count({ where: { storeId: o.storeId, phone: o.phone, placedAt: { lt: o.placedAt }, status: { not: 'DRAFT' }, id: { not: o.id } } });
      if (before > 0) return false;
    }
  }
  return true;
}

export interface PlanResult {
  events: number;
  planned: number;
}

/** Step 1: the order timeline of the look-back becomes QUEUED rows (one per step and channel, never twice). */
export async function planMessages(deps: MessagesDeps, storeId: number): Promise<PlanResult> {
  const now = nowOf(deps);
  const [engine, journey, sc, timeZone] = await Promise.all([
    setting(deps, storeId, 'messages.engine'),
    setting(deps, storeId, 'messages.journey'),
    setting(deps, storeId, 'messages.selfConfirm'),
    setting(deps, storeId, 'store.timeZone'),
  ]);
  const events: TimelineEvent[] = await deps.db.orderEvent.findMany({
    where: {
      storeId,
      createdAt: { gte: new Date(now.getTime() - engine.lookbackMinutes * 60_000), lte: now },
      OR: [{ type: { in: ['order.placed', OUT_FOR_DELIVERY_EVENT] } }, { toStatus: { in: [...STEP_STATUSES] } }],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, orderId: true, type: true, toStatus: true, createdAt: true },
  });
  const wanted = events.map((e) => ({ e, steps: stepsOf(e).filter((s) => journey[s].on) })).filter((x) => x.steps.length);
  if (!wanted.length) return { events: events.length, planned: 0 };
  const orders = new Map(
    (await deps.db.order.findMany({ where: { storeId, id: { in: [...new Set(wanted.map((x) => x.e.orderId))] } }, select: ORDER_SELECT })).map((o) => [o.id, o]),
  );
  // A step an order already has a row for, on any channel, is never planned again: a channel changed in the journey
  // since then must not send the same step a second time on the new channel.
  const had = new Set(
    (
      await deps.db.notificationLog.findMany({
        where: { storeId, orderId: { in: [...orders.keys()] }, step: { in: [...new Set(wanted.flatMap((x) => x.steps))] } },
        select: { orderId: true, step: true },
      })
    ).map((r) => `${r.orderId}:${r.step}`),
  );
  const rows: Prisma.NotificationLogCreateManyInput[] = [];
  for (const { e, steps } of wanted) {
    const o = orders.get(e.orderId);
    if (!o) continue;
    for (const step of steps) {
      if (had.has(`${o.id}:${step}`)) continue;
      const cfg = journey[step];
      if (!(await stepApplies(deps, step, cfg, o, sc.newCustomersOnly))) continue;
      const channels: MessageChannel[] = [cfg.channel];
      if (cfg.email && cfg.channel !== 'EMAIL' && recipientOf(o, step, 'EMAIL')) channels.push('EMAIL');
      for (const channel of channels) {
        rows.push({
          storeId,
          orderId: o.id,
          customerId: o.customerId,
          channel,
          recipient: recipientOf(o, step, channel) ?? '',
          status: 'QUEUED',
          dedupeKey: dedupeKey(o.id, step, channel),
          step,
          sendAfter: dueAt(cfg.when, e.createdAt, timeZone),
          eventId: e.id,
        });
      }
    }
  }
  const made = rows.length ? await deps.db.notificationLog.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  return { events: events.length, planned: made.count };
}

/** The template rows of a store for a key and channel: the message's language first, then the other one. */
async function templateOf(deps: MessagesDeps, storeId: number, key: string, channel: MessageChannel, locale: 'bn' | 'en') {
  const rows = await deps.db.notificationTemplate.findMany({ where: { storeId, key, channel, archivedAt: null }, select: { id: true, locale: true, subject: true, body: true } });
  // `enabled` is not read: since PR 148 the journey's step switch decides whether a step sends; a template is its words.
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === (locale === 'bn' ? 'en' : 'bn')) ?? null;
}

/** The shop's address for links: the store's primary domain, else the preview host (`system.stagingHost`). */
async function linkHost(deps: MessagesDeps, storeId: number): Promise<string | null> {
  const d = await deps.db.storeDomain.findFirst({ where: { storeId, isPrimaryHost: true, archivedAt: null }, select: { hostname: true } });
  return d?.hostname ?? (await deps.settings.value('system.stagingHost')) ?? null;
}

export interface RunContext {
  storeId: number;
  now: Date;
  master: boolean;
  journey: Journey;
  caps: { SMS: number | null; WHATSAPP: number | null; EMAIL: number | null; total: number | null };
  selfConfirmCounts: boolean;
  quiet: { on: boolean; fromHour: number; toHour: number };
  timeZone: string;
  locale: 'bn' | 'en';
  storeName: string;
  host: string | null;
  amountLine: { en: string; bn: string };
  exact: { due: { en: string; bn: string }; paid: { en: string; bn: string } } | null;
  retry: { maxAttempts: number; delaysMinutes: number[] };
  senders: Map<MessageChannel, Awaited<ReturnType<MessagesDeps['sender']>>>;
}

export async function runContext(deps: MessagesDeps, storeId: number): Promise<RunContext> {
  const [master, journey, caps, sc, quiet, timeZone, lang, storeLocale, amountLine, exactCfg, exactOn, ownName, store, host, retry] = await Promise.all([
    setting(deps, storeId, 'messages.enabled'),
    setting(deps, storeId, 'messages.journey'),
    setting(deps, storeId, 'messages.caps'),
    setting(deps, storeId, 'messages.selfConfirm'),
    setting(deps, storeId, 'messages.quietHours'),
    setting(deps, storeId, 'store.timeZone'),
    setting(deps, storeId, 'messages.language'),
    setting(deps, storeId, 'store.locale'),
    setting(deps, storeId, 'messages.amountLine'),
    setting(deps, storeId, 'messages.exactAmount'),
    setting(deps, storeId, 'account.track.exactAmount'),
    setting(deps, storeId, 'store.name'),
    deps.db.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
    linkHost(deps, storeId),
    setting(deps, storeId, 'messages.retry'),
  ]);
  return {
    storeId,
    now: nowOf(deps),
    master,
    journey,
    caps,
    selfConfirmCounts: sc.countsAsTheOneWhatsApp,
    quiet,
    timeZone,
    locale: messageLocale(lang, storeLocale),
    storeName: ownName?.trim() || store.name,
    host,
    amountLine,
    exact: exactOn.enabled ? exactCfg : null,
    retry,
    senders: new Map(),
  };
}

const ROW_SELECT = { id: true, orderId: true, step: true, channel: true, attempts: true, sendAfter: true, dedupeKey: true, eventId: true } satisfies Prisma.NotificationLogSelect;
export { ROW_SELECT };
export type Row = Prisma.NotificationLogGetPayload<{ select: typeof ROW_SELECT }>;

/** What a row sends: a journey step's switch and template, or a self-confirm answer's template (from the reply's code). */
async function wordsKeyOf(deps: MessagesDeps, c: RunContext, row: Row): Promise<{ on: boolean; template: string } | null> {
  if (row.step === SELF_CONFIRM_ANSWER) {
    const reply = row.eventId ? await deps.db.orderEvent.findFirst({ where: { id: row.eventId, storeId: c.storeId }, select: { reasonCode: true } }) : null;
    const template = answerTemplate(reply?.reasonCode ?? null);
    return template ? { on: true, template } : null;
  }
  const cfg = c.journey[row.step as JourneyStep];
  return cfg ? { on: cfg.on, template: cfg.template } : null;
}

/** How one row ended this run. */
export type SendOutcome = 'SENT' | 'SKIPPED' | 'BLOCKED' | 'FAILED' | 'RETRYING' | 'WAITING';

/** How a row is sent: by the engine, or once more by hand (no further automatic tries; the staff member is recorded). */
export interface SendOptions {
  retriedById?: string | null;
  manual?: boolean;
}

/** The wait before try `next` (2, 3 …): the waits in turn, the last one repeating. */
export const retryDelayMinutes = (delays: readonly number[], next: number): number => delays[Math.min(Math.max(next - 2, 0), delays.length - 1)] ?? 0;

const SENT_STATES: NotificationStatus[] = ['SENT', 'DELIVERED'];

/** The order journey's messages already sent for an order (for the caps). */
async function sentCounts(deps: MessagesDeps, c: RunContext, orderId: string): Promise<{ byChannel: Map<string, number>; total: number }> {
  const capped = (await deps.db.notificationLog.findMany({ where: { storeId: c.storeId, orderId, status: { in: SENT_STATES } }, select: { step: true, channel: true } })).filter(
    (r) => r.step && isCapped(r.step, c.selfConfirmCounts),
  );
  const byChannel = new Map<string, number>();
  for (const r of capped) byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + 1);
  return { byChannel, total: capped.length };
}

/** Closes a row that will not be sent, with its reason; a step that could not reach the customer tries its fallback. */
async function close(deps: MessagesDeps, c: RunContext, row: Row, status: Extract<NotificationStatus, 'SKIPPED' | 'BLOCKED_BY_GUARD' | 'FAILED'>, reason: string, extra: Prisma.NotificationLogUpdateInput = {}, fallback = false): Promise<void> {
  await deps.db.notificationLog.update({ where: { id: row.id }, data: { status, reason, sendAfter: null, ...extra } });
  if (fallback) await queueFallback(deps, c, row);
}

/** The step's fallback channel, when the row was the step's own channel and the fallback is another one. */
async function queueFallback(deps: MessagesDeps, c: RunContext, row: Row): Promise<void> {
  const cfg = c.journey[row.step as JourneyStep];
  if (!cfg || !row.orderId || cfg.fallback === 'NONE' || row.channel !== cfg.channel || cfg.fallback === row.channel) return;
  const o = await deps.db.order.findUnique({ where: { id: row.orderId }, select: { customerId: true, phone: true, email: true, isGift: true, giftSenderContact: true } });
  if (!o) return;
  await deps.db.notificationLog.createMany({
    data: [{ storeId: c.storeId, orderId: row.orderId, customerId: o.customerId, channel: cfg.fallback, recipient: recipientOf(o, row.step!, cfg.fallback) ?? '', status: 'QUEUED', dedupeKey: dedupeKey(row.orderId, row.step!, cfg.fallback), step: row.step, sendAfter: c.now }],
    skipDuplicates: true,
  });
}

/** Step 2 for one row: every check at the moment it goes, then the sender. */
export async function sendOne(deps: MessagesDeps, c: RunContext, row: Row, opts: SendOptions = {}): Promise<SendOutcome> {
  // the claim: this run alone holds the row for the lease
  const claimed = await deps.db.notificationLog.updateMany({
    where: { id: row.id, status: 'QUEUED', sendAfter: row.sendAfter },
    data: { sendAfter: new Date(c.now.getTime() + CLAIM_LEASE_MS) },
  });
  if (claimed.count !== 1) return 'WAITING';
  const step = row.step as JourneyStep;
  if (!c.master) return close(deps, c, row, 'SKIPPED', 'MASTER_OFF').then(() => 'SKIPPED');
  const cfg = await wordsKeyOf(deps, c, row);
  if (!cfg || !row.orderId) return close(deps, c, row, 'SKIPPED', 'UNKNOWN_STEP').then(() => 'SKIPPED');
  if (!cfg.on) return close(deps, c, row, 'SKIPPED', 'STEP_OFF').then(() => 'SKIPPED');
  if (!NEVER_QUIET.has(step)) {
    const until = quietUntil(c.quiet, c.now, c.timeZone);
    if (until) {
      await deps.db.notificationLog.update({ where: { id: row.id }, data: { sendAfter: until, reason: 'QUIET_HOURS' } });
      return 'WAITING';
    }
  }
  const o = await deps.db.order.findUnique({ where: { id: row.orderId }, select: ORDER_SELECT });
  if (!o) return close(deps, c, row, 'SKIPPED', 'NO_ORDER').then(() => 'SKIPPED');
  if (!stillFits(step, o.status)) return close(deps, c, row, 'SKIPPED', 'ORDER_MOVED_ON').then(() => 'SKIPPED');
  const to = recipientOf(o, step, row.channel as MessageChannel);
  if (!to) return close(deps, c, row, 'SKIPPED', 'NO_RECIPIENT', { recipient: '' }, true).then(() => 'SKIPPED');
  if (isCapped(step, c.selfConfirmCounts)) {
    const sent = await sentCounts(deps, c, o.id);
    const cap = c.caps[row.channel as MessageChannel];
    if (cap !== null && (sent.byChannel.get(row.channel) ?? 0) >= cap) return close(deps, c, row, 'BLOCKED_BY_GUARD', `CAP_${row.channel}`, { recipient: to }).then(() => 'BLOCKED');
    if (c.caps.total !== null && sent.total >= c.caps.total) return close(deps, c, row, 'BLOCKED_BY_GUARD', 'CAP_TOTAL', { recipient: to }).then(() => 'BLOCKED');
  }
  const t = await templateOf(deps, c.storeId, cfg.template, row.channel as MessageChannel, c.locale);
  if (!t) return close(deps, c, row, 'SKIPPED', 'NO_TEMPLATE', { recipient: to }, true).then(() => 'SKIPPED');
  const lang = t.locale === 'en' ? 'en' : 'bn';
  const words = render(t.body, row.channel === 'EMAIL' ? (t.subject ?? '') : null, {
    storeName: c.storeName,
    customerName: (o.isGift ? o.giftSenderName : o.customerName)?.trim() || '',
    orderNumber: o.number,
    senderName: o.giftSenderName?.trim() || '',
    currency: o.currency,
    dueMinor: dueOf(o),
    link: orderLink(c.host, o.number),
    amountLine: c.amountLine[lang],
    exactAmount: c.exact ? { due: c.exact.due[lang], paid: c.exact.paid[lang] } : null,
  });
  if (!words.ok) return close(deps, c, row, 'SKIPPED', words.reason, { recipient: to, templateId: t.id, locale: t.locale }).then(() => 'SKIPPED');
  const attempt = row.attempts + 1;
  let sender = c.senders.get(row.channel as MessageChannel) ?? null;
  let r: SendResult;
  try {
    if (!sender) {
      sender = await deps.sender(c.storeId, row.channel as MessageChannel);
      c.senders.set(row.channel as MessageChannel, sender);
    }
    try {
      r = await sender.send({ to, text: words.text, subject: words.subject, purpose: `${cfg.template}` });
    } catch (e) {
      r = { ok: false, error: errorText(e) };
    }
  } catch (e) {
    r = { ok: false, error: `NO_SENDER: ${errorText(e)}` };
  }
  const tried = { recipient: to, templateId: t.id, locale: t.locale, provider: sender?.provider ?? null, mode: sender?.mode ?? null, attempts: attempt } satisfies Prisma.NotificationLogUpdateInput;
  const tryRow = (ok: boolean, more: { error?: string; providerMessageId?: string }) =>
    deps.db.notificationAttempt.create({
      data: { storeId: c.storeId, notificationLogId: row.id, attempt, channel: row.channel, provider: sender?.provider ?? null, mode: sender?.mode ?? null, ok, retriedById: opts.retriedById ?? null, ...more },
    });
  if (r.ok) {
    const messageId = r.messageId;
    await deps.db.$transaction(async (tx) => {
      await tx.notificationLog.update({ where: { id: row.id }, data: { ...tried, status: 'SENT', providerMessageId: messageId, sentAt: c.now, sendAfter: null, reason: null, error: null } });
      await tx.notificationAttempt.create({
        data: { storeId: c.storeId, notificationLogId: row.id, attempt, channel: row.channel, provider: sender?.provider ?? null, mode: sender?.mode ?? null, ok: true, providerMessageId: messageId, retriedById: opts.retriedById ?? null },
      });
    }, TX);
    return 'SENT';
  }
  const error = r.error.slice(0, 300);
  await tryRow(false, { error });
  if (!r.unreachable && !opts.manual && attempt < c.retry.maxAttempts) {
    const next = new Date(c.now.getTime() + retryDelayMinutes(c.retry.delaysMinutes, attempt + 1) * 60_000);
    await deps.db.notificationLog.update({ where: { id: row.id }, data: { ...tried, status: 'QUEUED', sendAfter: next, reason: 'RETRY', error } });
    return 'RETRYING';
  }
  await close(deps, c, row, 'FAILED', r.unreachable ? 'UNREACHABLE' : error.startsWith('NO_SENDER') ? 'NO_SENDER' : 'SEND_FAILED', { ...tried, error }, true);
  return 'FAILED';
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export interface SendRunResult {
  due: number;
  sent: number;
  skipped: number;
  blocked: number;
  failed: number;
  /** Failed this time, tried again later (PR 149). */
  retrying: number;
  waiting: number;
  /** Every sender was the mock: nothing left the server. */
  mock: boolean;
}

/** Step 2: every due row of the store, oldest first, at most `batchSize` per run. */
export async function sendDue(deps: MessagesDeps, storeId: number): Promise<SendRunResult> {
  const c = await runContext(deps, storeId);
  const engine = await setting(deps, storeId, 'messages.engine');
  const rows = await deps.db.notificationLog.findMany({
    where: { storeId, status: 'QUEUED', sendAfter: { lte: c.now }, orderId: { not: null }, step: { not: null } },
    orderBy: [{ sendAfter: 'asc' }, { id: 'asc' }],
    take: engine.batchSize,
    select: ROW_SELECT,
  });
  const out: SendRunResult = { due: rows.length, sent: 0, skipped: 0, blocked: 0, failed: 0, retrying: 0, waiting: 0, mock: true };
  for (const row of rows) {
    const r = await sendOne(deps, c, row);
    if (r === 'SENT') out.sent++;
    else if (r === 'SKIPPED') out.skipped++;
    else if (r === 'BLOCKED') out.blocked++;
    else if (r === 'FAILED') out.failed++;
    else if (r === 'RETRYING') out.retrying++;
    else out.waiting++;
  }
  out.mock = [...c.senders.values()].every((s) => s.mode === 'MOCK');
  return out;
}
