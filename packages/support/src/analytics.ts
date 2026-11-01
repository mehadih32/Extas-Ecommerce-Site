// S22 · PR 436 (Blueprint B4.13, B4.14 item 12) — support analytics: per channel and per employee (and EXTAS AI), how
// many chats, answers and tickets, how fast the first answer and the solution came (the middle and the average), how many
// ran late, and chat → order conversion with the orders' value and what of it was delivered (Sales, the shop's one
// definition from @extas/metrics: an order placed is "ordered", only a delivered one is "sales").
//
// - The period is whole shop days in the store's time zone (`store.timeZone`): the last 7, 30 or 90 days, or a from–to
//   of at most SUPPORT_ANALYTICS_MAX_DAYS days. Everything counted happened inside it: a customer's message, an answer,
//   a ticket opened, an order from a chat placed, a follow-up sent.
// - A message counts on the moment it was sent (`sentAt`: the channel's time for a customer's, ours for an answer).
// - An order is a chat's when it was made in the chat ("Create order", PR 430: the ORDER_CREATED line) or came from a
//   product link sent in it (PR 429: PRODUCT_ORDERED). It is credited to the person who made it, or who sent the link
//   (or EXTAS AI when the AI did). A linked order the chat is only about is not counted.
// - A channel's (and the team's) chats are those where a customer wrote; a person's are those they answered. A ticket
//   belongs to its owner, or, while nobody owned it, to the person whose answer was its first; one nobody owned or
//   answered counts only in its channel and the team.
// - Who sees what (B4.12): a person who gives chats out (`support.assign`) sees the team, every channel and every
//   person; anyone else with `support.read` sees only their own row. Reading changes nothing.
import { counts, daysPeriod, lastDays, ymdIn, type Period } from '@extas/metrics/pure';
import { z } from 'zod';
import { allow, nowOf, parse, setting, SupportError, type SupportDeps, type Who } from './context';
import { emptyFacts, figureOf, ticketLate, type FigureFacts, type SupportFigure } from './analytics-pure';
import { minutesFrom } from './tickets';

/** The quick periods the screen offers (last N shop days, today included), and the default. */
export const SUPPORT_ANALYTICS_PERIODS = [7, 30, 90] as const;
export const SUPPORT_ANALYTICS_DEFAULT_DAYS = 30;
/** The longest from–to (a year and a day: a leap year whole), so one read stays bounded. */
export const SUPPORT_ANALYTICS_MAX_DAYS = 366;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const supportAnalyticsInput = z
  .object({
    days: z.coerce.number().int().refine((n) => (SUPPORT_ANALYTICS_PERIODS as readonly number[]).includes(n), 'one of the quick periods').optional(),
    from: z.string().regex(YMD).optional(),
    to: z.string().regex(YMD).optional(),
  })
  .strict()
  .refine((v) => !v.from === !v.to, { message: 'from and to go together', path: ['to'] });

export type SupportAnalyticsRowKind = 'channel' | 'person' | 'ai';

export interface SupportAnalyticsRow extends SupportFigure {
  /** The channel's id, the person's id, or "ai". */
  key: string;
  kind: SupportAnalyticsRowKind;
  /** The channel's or the person's name ("" for EXTAS AI: the screen names it). */
  label: string;
  /** A channel's kind (whatsapp, messenger, live …), for its icon and words. */
  channelKind?: string;
}

export interface SupportAnalytics {
  /** The shop days shown, both included, and the period they make. */
  from: string;
  to: string;
  days: number | null;
  period: Period;
  /** team: everything; own: only the reader's own row (no channels, the total is theirs). */
  scope: 'team' | 'own';
  total: SupportFigure;
  byChannel: SupportAnalyticsRow[];
  byPerson: SupportAnalyticsRow[];
}

const DAY = 86_400_000;
const AI = 'ai';

/** The period asked for: a quick one (default 30 days) or a from–to, in the store's days. */
async function periodOf(deps: Pick<SupportDeps, 'settings' | 'now'>, storeId: number, input: z.output<typeof supportAnalyticsInput>) {
  const tz = await setting(deps, storeId, 'store.timeZone');
  if (input.from && input.to) {
    let period: Period;
    try {
      period = daysPeriod(input.from, input.to, tz);
      // a day that does not exist (2026-02-30) is read by the calendar as another: refuse it rather than show another span
      if (ymdIn(period.from, tz) !== input.from || ymdIn(new Date(period.to.getTime() - 1), tz) !== input.to) throw new RangeError('no such day');
    } catch {
      throw new SupportError('INVALID_INPUT', 'the period is not valid', ['to']);
    }
    if (Math.round((period.to.getTime() - period.from.getTime()) / DAY) > SUPPORT_ANALYTICS_MAX_DAYS) throw new SupportError('INVALID_INPUT', 'the period is too long', ['from']);
    return { from: input.from, to: input.to, days: null, period };
  }
  const days = input.days ?? SUPPORT_ANALYTICS_DEFAULT_DAYS;
  const r = lastDays(days, nowOf(deps), tz);
  return { from: r.from, to: r.to, days, period: r.period };
}

/** The support report for a period (support.read; the team's rows only to `support.assign`). */
export async function supportAnalytics(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who, input: unknown): Promise<SupportAnalytics> {
  const held = await allow(deps, who, 'support.read');
  const asked = parse(supportAnalyticsInput, input, 'period');
  const { from, to, days, period } = await periodOf(deps, who.storeId, asked);
  const storeId = who.storeId;
  const at = { gte: period.from, lt: period.to };
  const now = nowOf(deps);

  const [inbound, outbound, tickets, events, followUps, channels] = await Promise.all([
    deps.db.message.groupBy({ by: ['conversationId'], where: { storeId, direction: 'IN', isInternalNote: false, sentAt: at } }),
    deps.db.message.groupBy({ by: ['conversationId', 'senderType', 'senderStaffId'], where: { storeId, direction: 'OUT', isInternalNote: false, sentAt: at }, _count: { _all: true } }),
    deps.db.ticket.findMany({ where: { storeId, createdAt: at }, select: { conversationId: true, ownerId: true, status: true, createdAt: true, firstResponseDueAt: true, firstResponseAt: true, resolutionDueAt: true, resolvedAt: true } }),
    deps.db.conversationEvent.findMany({ where: { storeId, kind: { in: ['ORDER_CREATED', 'PRODUCT_ORDERED'] }, createdAt: at }, select: { conversationId: true, kind: true, actorType: true, actorStaffId: true, data: true } }),
    deps.db.supportFollowUp.findMany({ where: { storeId, sentAt: at }, select: { conversationId: true, outcome: true, decidedById: true } }),
    deps.db.supportChannel.findMany({ where: { storeId }, select: { id: true, kind: true, name: true, enabled: true, archivedAt: true } }),
  ]);

  // the orders from chats: each once (the first line naming it), with who it is credited to
  const orderOf = new Map<string, { conversationId: string; credit: string | null; viaShare: boolean }>();
  for (const e of events) {
    const id = (e.data as { orderId?: unknown } | null)?.orderId;
    if (typeof id !== 'string' || orderOf.has(id)) continue;
    const credit = e.kind === 'ORDER_CREATED' ? (e.actorType === 'AI_AGENT' ? AI : e.actorStaffId) : null;
    orderOf.set(id, { conversationId: e.conversationId, credit, viaShare: e.kind === 'PRODUCT_ORDERED' });
  }
  const orderIds = [...orderOf.keys()];
  const shared = orderIds.filter((id) => orderOf.get(id)!.viaShare);
  const convIds = [...new Set([...inbound.map((r) => r.conversationId), ...outbound.map((r) => r.conversationId), ...tickets.map((t) => t.conversationId).filter((x): x is string => !!x), ...events.map((e) => e.conversationId), ...followUps.map((f) => f.conversationId)])];
  const [orders, shares, convs] = await Promise.all([
    orderIds.length ? deps.db.order.findMany({ where: { storeId, id: { in: orderIds } }, select: { id: true, status: true, totalMinor: true } }) : [],
    shared.length ? deps.db.supportProductShare.findMany({ where: { storeId, orderId: { in: shared } }, select: { orderId: true, sentById: true } }) : [],
    convIds.length ? deps.db.conversation.findMany({ where: { storeId, id: { in: convIds } }, select: { id: true, channelId: true } }) : [],
  ]);
  for (const s of shares) if (s.orderId && orderOf.has(s.orderId)) orderOf.get(s.orderId)!.credit = s.sentById;
  // a ticket nobody owned belongs to the person whose answer was its first (that answer's moment is its firstResponseAt)
  const unowned = tickets.filter((x) => !x.ownerId && x.firstResponseAt && x.conversationId);
  const firstBy = new Map<string, string>();
  if (unowned.length) {
    const answers = await deps.db.message.findMany({
      where: { storeId, direction: 'OUT', isInternalNote: false, conversationId: { in: [...new Set(unowned.map((x) => x.conversationId!))] }, sentAt: { in: unowned.map((x) => x.firstResponseAt!) } },
      select: { conversationId: true, sentAt: true, senderType: true, senderStaffId: true },
    });
    for (const m of answers) {
      const by = m.senderType === 'AI_AGENT' ? AI : m.senderType === 'STAFF' ? m.senderStaffId : null;
      if (by) firstBy.set(`${m.conversationId}@${m.sentAt.getTime()}`, by);
    }
  }
  const channelOf = new Map(convs.map((c) => [c.id, c.channelId]));

  // the facts of every row
  const total = emptyFacts();
  const byChannel = new Map<string, FigureFacts>();
  const byPerson = new Map<string, FigureFacts>();
  const rowOf = (m: Map<string, FigureFacts>, k: string): FigureFacts => {
    let f = m.get(k);
    if (!f) m.set(k, (f = emptyFacts()));
    return f;
  };
  const chanOf = (conversationId: string | null): FigureFacts | null => {
    const ch = conversationId ? channelOf.get(conversationId) : undefined;
    return ch ? rowOf(byChannel, ch) : null;
  };

  for (const r of inbound) {
    total.chats.add(r.conversationId);
    chanOf(r.conversationId)?.chats.add(r.conversationId);
  }
  for (const r of outbound) {
    const n = r._count._all;
    total.replies += n;
    const c = chanOf(r.conversationId);
    if (c) c.replies += n;
    const person = r.senderType === 'AI_AGENT' ? AI : r.senderType === 'STAFF' ? r.senderStaffId : null;
    if (person) {
      const p = rowOf(byPerson, person);
      p.replies += n;
      p.chats.add(r.conversationId);
    }
  }
  for (const t of tickets) {
    const person = t.ownerId ?? (t.firstResponseAt ? firstBy.get(`${t.conversationId}@${t.firstResponseAt.getTime()}`) : undefined);
    const rows = [total, chanOf(t.conversationId), person ? rowOf(byPerson, person) : null].filter((x): x is FigureFacts => !!x);
    const late = ticketLate(t, now);
    for (const f of rows) {
      f.tickets++;
      if (t.firstResponseAt) f.firstMinutes.push(minutesFrom(t.createdAt, t.firstResponseAt));
      if (t.resolvedAt) f.resolveMinutes.push(minutesFrom(t.createdAt, t.resolvedAt));
      if (late) f.late++;
    }
  }
  const placed = new Map(orders.filter((o) => counts('ordered', o.status)).map((o) => [o.id, { valueMinor: o.totalMinor, delivered: counts('sales', o.status) }]));
  for (const [id, o] of orderOf) {
    const fig = placed.get(id);
    if (!fig) continue; // never placed (a draft), or not this store's
    const rows = [total, chanOf(o.conversationId), o.credit ? rowOf(byPerson, o.credit) : null].filter((x): x is FigureFacts => !!x);
    for (const f of rows) {
      f.orders.set(id, fig);
      f.orderChats.add(o.conversationId);
    }
  }
  for (const u of followUps) {
    const ordered = u.outcome === 'ORDERED';
    const rows = [total, chanOf(u.conversationId), u.decidedById ? rowOf(byPerson, u.decidedById) : null].filter((x): x is FigureFacts => !!x);
    for (const f of rows) {
      f.followUpsSent++;
      if (ordered) f.followUpsOrdered++;
    }
  }

  // names, and who sees what
  const team = held.has('support.assign');
  const me = who.actor.staffUserId;
  const staffIds = [...byPerson.keys()].filter((k) => k !== AI && (team || k === me));
  const names = new Map(staffIds.length ? (await deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]) : []);
  if (!team) {
    const mine = byPerson.get(me ?? '') ?? emptyFacts();
    const label = me ? (names.get(me) ?? (await deps.db.staffUser.findUnique({ where: { id: me }, select: { displayName: true } }))?.displayName ?? '') : '';
    const row: SupportAnalyticsRow[] = me ? [{ key: me, kind: 'person', label, ...figureOf(mine) }] : [];
    return { from, to, days, period, scope: 'own', total: figureOf(mine), byChannel: [], byPerson: row };
  }
  const people: SupportAnalyticsRow[] = [...byPerson]
    .map(([k, f]) => ({ key: k, kind: k === AI ? ('ai' as const) : ('person' as const), label: k === AI ? '' : (names.get(k) ?? ''), ...figureOf(f) }))
    .sort((a, b) => (a.kind === 'ai' ? 1 : 0) - (b.kind === 'ai' ? 1 : 0) || b.replies - a.replies || b.tickets - a.tickets || a.label.localeCompare(b.label));
  const shown = channels.filter((c) => byChannel.has(c.id) || (c.enabled && !c.archivedAt));
  const chans: SupportAnalyticsRow[] = shown
    .map((c) => ({ key: c.id, kind: 'channel' as const, label: c.name, channelKind: c.kind, ...figureOf(byChannel.get(c.id) ?? emptyFacts()) }))
    .sort((a, b) => b.chats - a.chats || b.replies - a.replies || a.label.localeCompare(b.label));
  return { from, to, days, period, scope: 'team', total: figureOf(total), byChannel: chans, byPerson: people };
}

