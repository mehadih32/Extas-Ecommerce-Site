// PR 828 (prototype v5, the call desk): two read-only cards over the call queue.
// - "Staff today": for each person who recorded a call or confirmed an order since the shop day began — calls recorded
//   (the order timeline's `order.callOutcome` lines), orders they confirmed, and calls that ended with a no answer (the
//   outcomes of `risk.history.noAnswerOutcomes`).
// - "Call again now": the open call tasks whose due time has come (a no-answer or "call later" task waits for its next
//   try; the longest overdue first).
// Nothing here calls, confirms, holds, cancels or blocks anyone; a person does that. Needs `orders.read`.
import { allow, nowOf, setting, type OrdersDeps, type Who } from './context';
import { zonedDayStart } from './day-range';
import { CALL_OUTCOME_EVENT } from './calls';

export interface DeskStaff {
  staffUserId: string;
  name: string;
  calls: number;
  confirmed: number;
  noAnswer: number;
}

export interface DeskDue {
  taskId: string;
  reason: string;
  dueAt: Date;
  tries: number;
  order: { id: string; number: string; customerName: string | null } | null;
}

export interface CallDesk {
  staff: DeskStaff[];
  due: DeskDue[];
  /** Every due task (the list above shows the first few). */
  dueTotal: number;
}

const DUE_SHOWN = 6;

export async function callDesk(deps: OrdersDeps, who: Who): Promise<CallDesk> {
  await allow(deps, who, 'orders.read');
  const [timeZone, history] = await Promise.all([setting(deps, who.storeId, 'store.timeZone'), setting(deps, who.storeId, 'risk.history')]);
  const now = nowOf(deps);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const since = zonedDayStart(day, timeZone);
  const noAnswer = new Set<string>(history.noAnswerOutcomes);
  const [calls, confirms, due, dueTotal] = await Promise.all([
    deps.db.orderEvent.findMany({ where: { storeId: who.storeId, type: CALL_OUTCOME_EVENT, createdAt: { gte: since }, actorId: { not: null } }, select: { actorId: true, reasonCode: true } }),
    deps.db.orderEvent.findMany({ where: { storeId: who.storeId, toStatus: 'CONFIRMED', actorType: 'STAFF', createdAt: { gte: since }, actorId: { not: null } }, select: { actorId: true, orderId: true } }),
    deps.db.callTask.findMany({
      where: { storeId: who.storeId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lte: now } },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: DUE_SHOWN,
      select: { id: true, reason: true, dueAt: true, orderId: true, notes: true },
    }),
    deps.db.callTask.count({ where: { storeId: who.storeId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lte: now } } }),
  ]);
  const rows = new Map<string, DeskStaff>();
  const row = (id: string): DeskStaff => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { staffUserId: id, name: '', calls: 0, confirmed: 0, noAnswer: 0 }));
    return r;
  };
  for (const c of calls) {
    const r = row(c.actorId!);
    r.calls += 1;
    if (c.reasonCode && noAnswer.has(c.reasonCode)) r.noAnswer += 1;
  }
  // one confirmation per order and person (a repeated event counts once)
  for (const key of new Set(confirms.map((c) => `${c.actorId}|${c.orderId}`))) row(key.split('|')[0]!).confirmed += 1;
  const ids = [...rows.keys()];
  const staff = ids.length ? await deps.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  for (const s of staff) row(s.id).name = s.displayName;
  const orderIds = [...new Set(due.map((t) => t.orderId).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: orderIds } }, select: { id: true, number: true, customerName: true } }) : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  return {
    staff: [...rows.values()].filter((r) => r.name).sort((a, b) => b.calls - a.calls || b.confirmed - a.confirmed || a.name.localeCompare(b.name)),
    due: due.map((t) => ({ taskId: t.id, reason: t.reason, dueAt: t.dueAt!, tries: t.notes ? t.notes.split('\n').length : 0, order: t.orderId ? (byId.get(t.orderId) ?? null) : null })),
    dueTotal,
  };
}
