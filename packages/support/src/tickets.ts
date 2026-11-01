// S22 · PR 431 (Blueprint B4.14 item 7) — ticketing. One stretch of a conversation, from the customer's message until
// it is marked solved, is one ticket (the `Ticket` table of the schema skeleton): its status follows the chat's (open,
// waiting for the customer, solved), its owner is the employee the chat is assigned to, and it carries two timers set
// from `support.tickets` when it opens — the first answer and the solution — and, once solved, how long it took.
//
// - A ticket opens only while `support.tickets` is on; a ticket already open is kept up to date even after the switch
//   goes off, so no timer is left half-done.
// - The chat's `slaDueAt` is the next timer that counts (the first answer, then the solution); waiting for the
//   customer, or solved, it is empty: the ball is not with the team. The solution timer runs from the customer's first
//   message, so a long wait for the customer can make it late when they answer.
// - Solved and opened again by an employee, the same ticket opens again; a customer writing after "solved" starts a new
//   ticket (inbound.ts), so each question is counted once.
// - Late chats go into the notifications of their owner (and, with no owner, of the people who give chats out) while
//   `notify` is on. Nothing is sent outside the admin here: the owner's Telegram ping is the 18 Oct round's (PR 538).
import type { Prisma } from '@extas/db/client';
import type { SupportTicketsSettings } from '@extas/settings';
import { allow, setting, nowOf, type Db, type SupportDeps, type Who } from './context';
import type { ConversationStatus } from './pure';

/** The windows' bounds, for the settings card. */
export { TICKET_FIRST_MINUTES, TICKET_RESOLUTION_HOURS } from '@extas/settings';

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Which timer counts now: the first answer, or the solution. */
export type TicketStage = 'first' | 'resolve';

export interface TicketClock {
  stage: TicketStage;
  dueAt: Date;
  late: boolean;
}

interface TicketTimes {
  status: string;
  firstResponseDueAt: Date | null;
  firstResponseAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
}

/** The timer that counts now, or null (waiting for the customer, solved, or no timer). */
export function clockOf(t: TicketTimes, now: Date): TicketClock | null {
  if (t.resolvedAt || t.status !== 'OPEN') return null;
  if (!t.firstResponseAt && t.firstResponseDueAt) return { stage: 'first', dueAt: t.firstResponseDueAt, late: now > t.firstResponseDueAt };
  if (t.resolutionDueAt) return { stage: 'resolve', dueAt: t.resolutionDueAt, late: now > t.resolutionDueAt };
  return null;
}

/** The chat's `slaDueAt`: the timer that counts, by its own rule (no clock: empty). */
const dueOf = (t: TicketTimes): Date | null => (t.resolvedAt || t.status !== 'OPEN' ? null : !t.firstResponseAt && t.firstResponseDueAt ? t.firstResponseDueAt : t.resolutionDueAt);

/** Whole minutes from one time to another (never below 0). */
export const minutesFrom = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / MINUTE));

const openTicket = (tx: Db, conversationId: string) => tx.ticket.findFirst({ where: { conversationId, resolvedAt: null }, orderBy: { createdAt: 'desc' } });

async function keep(tx: Db, conversationId: string, id: string, data: Prisma.TicketUpdateInput): Promise<void> {
  const t = await tx.ticket.update({ where: { id }, data });
  await tx.conversation.update({ where: { id: conversationId }, data: { slaDueAt: dueOf(t) } });
}

/**
 * A customer's message: the open ticket is open again (it was waiting for them); with none open and tickets on, a new
 * one opens with both timers. Called inside receiveMessage's transaction, after the chat is updated.
 */
export async function ticketOnCustomerMessage(
  tx: Db,
  c: { storeId: number; conversationId: string; customerId: string | null; ownerId: string | null; subject: string; priority: string | null; at: Date },
  cfg: SupportTicketsSettings,
): Promise<void> {
  const open = await openTicket(tx, c.conversationId);
  if (open) {
    if (open.status !== 'OPEN') await keep(tx, c.conversationId, open.id, { status: 'OPEN' });
    return;
  }
  if (!cfg.enabled) return;
  const t = await tx.ticket.create({
    data: {
      storeId: c.storeId,
      conversationId: c.conversationId,
      customerId: c.customerId,
      subject: c.subject,
      status: 'OPEN',
      ownerId: c.ownerId,
      priority: c.priority,
      firstResponseDueAt: new Date(c.at.getTime() + cfg.firstResponseMinutes * MINUTE),
      resolutionDueAt: new Date(c.at.getTime() + cfg.resolutionHours * HOUR),
      createdAt: c.at,
    },
  });
  await tx.conversation.update({ where: { id: c.conversationId }, data: { slaDueAt: dueOf(t) } });
  await tx.conversationEvent.create({
    data: { storeId: c.storeId, conversationId: c.conversationId, kind: 'TICKET_OPENED', actorType: 'SYSTEM', data: { ticketId: t.id, firstDueAt: t.firstResponseDueAt!.toISOString(), resolveDueAt: t.resolutionDueAt!.toISOString() }, createdAt: new Date(c.at.getTime() + 1) },
  });
}

/** An employee's answer (not a note): the first answer is noted once; the ticket follows the chat's status. */
export async function ticketOnReply(tx: Db, conversationId: string, status: ConversationStatus, now: Date, ownerId: string | null): Promise<void> {
  const open = await openTicket(tx, conversationId);
  if (!open) return;
  await keep(tx, conversationId, open.id, { firstResponseAt: open.firstResponseAt ?? now, status, ownerId });
}

/** The chat was given to someone, or let go: the open ticket's owner follows. */
export async function ticketOnOwner(tx: Db, conversationId: string, ownerId: string | null): Promise<void> {
  await tx.ticket.updateMany({ where: { conversationId, resolvedAt: null }, data: { ownerId } });
}

/**
 * The chat's status was changed by an employee. Solved: the open ticket is solved and how long it took is logged.
 * Opened again from solved: the last ticket opens again. Otherwise the ticket follows the status.
 */
export async function ticketOnStatus(tx: Db, c: { storeId: number; conversationId: string; from: ConversationStatus; to: ConversationStatus; now: Date }): Promise<void> {
  if (c.to === 'SOLVED') {
    const open = await openTicket(tx, c.conversationId);
    if (!open) return;
    await keep(tx, c.conversationId, open.id, { status: 'SOLVED', resolvedAt: c.now });
    await tx.conversationEvent.create({
      data: { storeId: c.storeId, conversationId: c.conversationId, kind: 'TICKET_SOLVED', actorType: 'SYSTEM', data: { ticketId: open.id, minutes: minutesFrom(open.createdAt, c.now), late: !!open.resolutionDueAt && c.now > open.resolutionDueAt }, createdAt: new Date(c.now.getTime() + 1) },
    });
    return;
  }
  if (c.from === 'SOLVED') {
    const last = await tx.ticket.findFirst({ where: { conversationId: c.conversationId }, orderBy: { createdAt: 'desc' } });
    if (last?.resolvedAt) await keep(tx, c.conversationId, last.id, { status: c.to, resolvedAt: null });
    return;
  }
  const open = await openTicket(tx, c.conversationId);
  if (open) await keep(tx, c.conversationId, open.id, { status: c.to });
}

// ------------------------------------------------------------------------------------------------------------ read

export interface TicketView {
  id: string;
  status: ConversationStatus;
  owner: { id: string; name: string } | null;
  openedAt: Date;
  firstResponseDueAt: Date | null;
  firstResponseAt: Date | null;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
  clock: TicketClock | null;
  /** Minutes to the first answer, once answered. */
  firstMinutes: number | null;
  /** Minutes to the solution, once solved. */
  resolutionMinutes: number | null;
  /** Whether the first answer came after its timer. */
  firstLate: boolean;
  /** Whether the solution came after its timer. */
  resolutionLate: boolean;
  /** The chat's tickets solved before this one. */
  earlier: number;
}

/** The chat's latest ticket (open, or the last solved one), or null when it never had one. */
export async function ticketOf(db: Db, conversationId: string, now: Date): Promise<TicketView | null> {
  const [t, all] = await Promise.all([db.ticket.findFirst({ where: { conversationId }, orderBy: { createdAt: 'desc' } }), db.ticket.count({ where: { conversationId } })]);
  if (!t) return null;
  const owner = t.ownerId ? await db.staffUser.findUnique({ where: { id: t.ownerId }, select: { displayName: true } }) : null;
  const late = (at: Date | null, due: Date | null) => !!at && !!due && at > due;
  return {
    id: t.id,
    status: t.status as ConversationStatus,
    owner: t.ownerId ? { id: t.ownerId, name: owner?.displayName ?? '' } : null,
    openedAt: t.createdAt,
    firstResponseDueAt: t.firstResponseDueAt,
    firstResponseAt: t.firstResponseAt,
    resolutionDueAt: t.resolutionDueAt,
    resolvedAt: t.resolvedAt,
    clock: clockOf(t, now),
    firstMinutes: t.firstResponseAt ? minutesFrom(t.createdAt, t.firstResponseAt) : null,
    resolutionMinutes: t.resolvedAt ? minutesFrom(t.createdAt, t.resolvedAt) : null,
    firstLate: late(t.firstResponseAt, t.firstResponseDueAt),
    resolutionLate: late(t.resolvedAt, t.resolutionDueAt),
    earlier: all - 1,
  };
}

/** The timers of these chats' open tickets, by chat. */
export async function clocksOf(db: Db, conversationIds: string[], now: Date): Promise<Map<string, TicketClock>> {
  if (!conversationIds.length) return new Map();
  const open = await db.ticket.findMany({ where: { conversationId: { in: conversationIds }, resolvedAt: null }, orderBy: { createdAt: 'asc' } });
  const out = new Map<string, TicketClock>();
  for (const t of open) {
    const k = clockOf(t, now);
    if (k && t.conversationId) out.set(t.conversationId, k);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ notes

/** Most late chats in one person's notifications. */
export const LATE_NOTES_MOST = 20;

export interface LateChat {
  conversationId: string;
  refCode: string;
  name: string | null;
  stage: TicketStage;
  dueAt: Date;
  /** Whether the chat has no owner (it is in the list for the people who give chats out). */
  unowned: boolean;
}

/**
 * The late chats for this person's notifications, most late first: theirs, and — for the people who may give chats out
 * (`support.assign`) — the late chats nobody owns. Empty while `support.tickets` or its `notify` is off, or for
 * someone who may not read support.
 */
export async function lateChats(deps: Pick<SupportDeps, 'db' | 'settings' | 'now'>, who: Who): Promise<LateChat[]> {
  const cfg = await setting(deps, who.storeId, 'support.tickets');
  if (!cfg.enabled || !cfg.notify) return [];
  let held: Set<string>;
  try {
    held = await allow(deps, who, 'support.read');
  } catch {
    return [];
  }
  const me = who.actor.staffUserId;
  const now = nowOf(deps);
  const mine: Prisma.ConversationWhereInput[] = [...(me ? [{ assignedToId: me }] : []), ...(held.has('support.assign') ? [{ assignedToId: null }] : [])];
  if (!mine.length) return [];
  const rows = await deps.db.conversation.findMany({
    where: { storeId: who.storeId, status: 'OPEN', slaDueAt: { lt: now }, OR: mine },
    orderBy: { slaDueAt: 'asc' },
    take: LATE_NOTES_MOST,
    select: { id: true, refCode: true, assignedToId: true, contact: { select: { displayName: true } } },
  });
  const clocks = await clocksOf(deps.db, rows.map((r) => r.id), now);
  return rows.flatMap((r) => {
    const k = clocks.get(r.id);
    return k?.late ? [{ conversationId: r.id, refCode: r.refCode, name: r.contact.displayName, stage: k.stage, dueAt: k.dueAt, unowned: !r.assignedToId }] : [];
  });
}
