// PR 798 (prototype v5 Reports › Team): who did what in the period — calls confirmed, orders cancelled, packed, handed to a courier,
// size exchanges, customer messages answered — with the time to confirm, the first reply time to a customer message and the share of
// chats that turned into an order within 48 hours of the person's reply. Counted from the shop's own records (OrderEvent with a staff
// actor, Message OUT by a staff user, Order); nothing is typed in by anyone. Read-only. Practice orders count only while practice mode is on.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { daysPeriod } from '@extas/metrics';
import type { AdminDeps } from '../admin-auth';
import { practiceScope } from './practice';

const S = MOTHER_STORE_ID;
const HOUR_MS = 3_600_000; // hardcode-ok: milliseconds in an hour
const MIN_MS = 60_000; // hardcode-ok: milliseconds in a minute
/** A chat counts as turned into an order when the customer ordered within this many hours after the reply (the prototype's rule). */
export const CONVERT_HOURS = 48;

export type LogKind = 'confirmed' | 'cancelled' | 'packed' | 'exchange' | 'replied';

export interface Act {
  confirm: number;
  cancel: number;
  pack: number;
  hand: number;
  exch: number;
  msgs: number;
  /** First-reply times in minutes. */
  rt: number[];
  /** Hours from order placed to confirmed. */
  ct: number[];
  log: { at: number; kind: LogKind; orderId?: string; label: string }[];
}

export const emptyAct = (): Act => ({ confirm: 0, cancel: 0, pack: 0, hand: 0, exch: 0, msgs: 0, rt: [], ct: [], log: [] });
export const total = (a: Act) => a.confirm + a.cancel + a.pack + a.hand + a.exch + a.msgs;
export const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 0);

export interface EventRow {
  staffId: string;
  type: string;
  toStatus: string | null;
  at: number;
  orderId: string;
  orderNumber: string;
  placedAt: number;
}

export interface ReplyRow {
  staffId: string;
  conversationId: string;
  at: number;
  /** Minutes since the customer's message just before, when the one before was the customer's. */
  afterMin: number | null;
  contact: string;
}

/** The pure part: events and replies into one Act per person. */
export function actsOf(events: readonly EventRow[], replies: readonly ReplyRow[]): Map<string, Act> {
  const m = new Map<string, Act>();
  const of = (id: string) => m.get(id) ?? (m.set(id, emptyAct()), m.get(id)!);
  for (const e of events) {
    const a = of(e.staffId);
    if (e.toStatus === 'CONFIRMED') {
      a.confirm++;
      a.ct.push((e.at - e.placedAt) / HOUR_MS);
      a.log.push({ at: e.at, kind: 'confirmed', orderId: e.orderId, label: e.orderNumber });
    } else if (e.toStatus === 'CANCELLED') {
      a.cancel++;
      a.log.push({ at: e.at, kind: 'cancelled', orderId: e.orderId, label: e.orderNumber });
    } else if (e.toStatus === 'PACKED') {
      a.pack++;
      a.log.push({ at: e.at, kind: 'packed', orderId: e.orderId, label: e.orderNumber });
    } else if (e.toStatus === 'HANDED_OVER') a.hand++;
    else if (e.type === 'order.exchange') {
      a.exch++;
      a.log.push({ at: e.at, kind: 'exchange', orderId: e.orderId, label: e.orderNumber });
    }
  }
  for (const r of replies) {
    const a = of(r.staffId);
    a.msgs++;
    if (r.afterMin !== null) a.rt.push(r.afterMin);
    a.log.push({ at: r.at, kind: 'replied', label: r.contact });
  }
  return m;
}

export interface Conv {
  customerId: string | null;
  /** The person who answered last in the period, and when the first reply of the period was sent. */
  by: string;
  firstReplyAt: number;
}

/** Chats that turned into an order: per person, chats answered and those whose customer ordered within 48 hours of the first reply. */
export function chatConversion(convs: readonly Conv[], orders: readonly { customerId: string; at: number }[]): Map<string, { chats: number; orders: number }> {
  const m = new Map<string, { chats: number; orders: number }>();
  for (const c of convs) {
    const x = m.get(c.by) ?? { chats: 0, orders: 0 };
    x.chats++;
    if (c.customerId && orders.some((o) => o.customerId === c.customerId && o.at >= c.firstReplyAt && o.at <= c.firstReplyAt + CONVERT_HOURS * HOUR_MS)) x.orders++;
    m.set(c.by, x);
  }
  return m;
}

export interface Person {
  id: string;
  name: string;
  role: string | null;
}

export interface TeamData {
  people: Person[];
  cur: Map<string, Act>;
  prev: Map<string, Act>;
  conv: Map<string, { chats: number; orders: number }>;
  convPrev: Map<string, { chats: number; orders: number }>;
  newWaiting: number;
  unassigned: number;
}

async function loadActs(db: PrismaClient, tz: string, from: string, to: string, scope: { isPractice?: false }): Promise<{ acts: Map<string, Act>; convs: Conv[]; orders: { customerId: string; at: number }[] }> {
  const per = daysPeriod(from, to, tz);
  const ev = await db.orderEvent.findMany({
    where: { storeId: S, actorType: 'STAFF', actorId: { not: null }, createdAt: { gte: per.from, lt: per.to }, OR: [{ toStatus: { in: ['CONFIRMED', 'CANCELLED', 'PACKED', 'HANDED_OVER'] } }, { type: 'order.exchange' }], order: { ...scope } },
    select: { actorId: true, type: true, toStatus: true, createdAt: true, orderId: true, order: { select: { number: true, placedAt: true } } },
    take: 50000,
  });
  const events: EventRow[] = ev.map((e) => ({ staffId: e.actorId!, type: e.type, toStatus: e.toStatus, at: e.createdAt.getTime(), orderId: e.orderId, orderNumber: e.order.number, placedAt: e.order.placedAt.getTime() }));
  const msgs = await db.message.findMany({
    where: { storeId: S, isInternalNote: false, sentAt: { gte: per.from, lt: per.to }, direction: 'OUT', senderType: 'STAFF', senderStaffId: { not: null } },
    select: { senderStaffId: true, conversationId: true, sentAt: true, conversation: { select: { customerId: true, contact: { select: { displayName: true } } } } },
    orderBy: { sentAt: 'asc' },
    take: 50000,
  });
  const cids = [...new Set(msgs.map((m) => m.conversationId))];
  const around = cids.length ? await db.message.findMany({ where: { conversationId: { in: cids }, isInternalNote: false, sentAt: { lt: per.to } }, select: { conversationId: true, direction: true, sentAt: true }, orderBy: { sentAt: 'asc' }, take: 100000 }) : [];
  const byConv = new Map<string, { direction: string; at: number }[]>();
  for (const x of around) byConv.set(x.conversationId, [...(byConv.get(x.conversationId) ?? []), { direction: x.direction, at: x.sentAt.getTime() }]);
  const replies: ReplyRow[] = msgs.map((m) => {
    const list = byConv.get(m.conversationId) ?? [];
    const at = m.sentAt.getTime();
    const before = [...list].reverse().find((x) => x.at < at);
    return { staffId: m.senderStaffId!, conversationId: m.conversationId, at, afterMin: before && before.direction === 'IN' ? (at - before.at) / MIN_MS : null, contact: m.conversation.contact?.displayName ?? '—' };
  });
  const convMap = new Map<string, Conv>();
  for (const m of msgs) {
    const at = m.sentAt.getTime();
    const x = convMap.get(m.conversationId);
    convMap.set(m.conversationId, { customerId: m.conversation.customerId, by: m.senderStaffId!, firstReplyAt: x ? x.firstReplyAt : at });
  }
  const custIds = [...new Set([...convMap.values()].map((c) => c.customerId).filter((x): x is string => !!x))];
  const ords = custIds.length ? await db.order.findMany({ where: { storeId: S, customerId: { in: custIds }, archivedAt: null, status: { not: 'DRAFT' }, placedAt: { gte: per.from, lt: new Date(per.to.getTime() + CONVERT_HOURS * HOUR_MS) }, ...scope }, select: { customerId: true, placedAt: true }, take: 50000 }) : [];
  return { acts: actsOf(events, replies), convs: [...convMap.values()], orders: ords.map((o) => ({ customerId: o.customerId!, at: o.placedAt.getTime() })) };
}

/** Everything the Team report draws for the span and the span before it. */
export async function loadTeam(deps: Pick<AdminDeps, 'db' | 'resolver'>, tz: string, from: string, to: string, before: { from: string; to: string }): Promise<TeamData> {
  const db: PrismaClient = deps.db;
  const scope = await practiceScope(deps);
  const [a, b, staff, newWaiting, unassigned] = await Promise.all([
    loadActs(db, tz, from, to, scope),
    loadActs(db, tz, before.from, before.to, scope),
    db.staffUser.findMany({ where: { archivedAt: null, status: 'ACTIVE' }, select: { id: true, displayName: true, roleAssignments: { where: { revokedAt: null }, select: { role: { select: { nameEn: true } } }, take: 1 } }, orderBy: { displayName: 'asc' }, take: 200 }),
    db.order.count({ where: { storeId: S, archivedAt: null, status: 'PLACED', ...scope } }),
    db.conversation.count({ where: { storeId: S, status: 'OPEN', assignedToId: null } }),
  ]);
  return {
    people: staff.map((s) => ({ id: s.id, name: s.displayName, role: s.roleAssignments[0]?.role.nameEn ?? null })),
    cur: a.acts,
    prev: b.acts,
    conv: chatConversion(a.convs, a.orders),
    convPrev: chatConversion(b.convs, b.orders),
    newWaiting,
    unassigned,
  };
}
