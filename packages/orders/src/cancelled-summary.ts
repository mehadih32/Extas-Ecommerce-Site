// PR 660 (CN-048, admin prototype v5, GAP-MAP O-28) — the Cancelled summary on the order lists: how many orders were
// cancelled in a range of days, the money that did not come in, why (the reason split), at which stage each was cancelled
// and who cancelled it (the customer, a person of the team, the system). Read only: it counts what is there, it never
// cancels, refunds or edits anything. A day range is the store's own days (`dayRange`); no range means every cancelled
// order. The same filter feeds the file download (the export takes `view=cancelled` with the same `from` and `to`).
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Who } from './context';
import { dayRange } from './day-range';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'a day like 2026-11-13' });
export const cancelledSummaryQuery = z.object({ from: day.optional(), to: day.optional() }).strict();

export interface CancelledSummary {
  count: number;
  /** The order totals of the cancelled orders (minor units): what would have come in. */
  totalMinor: number;
  currency: string | null;
  /** Reason code → orders (no reason given: `none`), most first. */
  byReason: { code: string; count: number }[];
  /** The status the order was in when it was cancelled (`unknown` when no event says), most first. */
  byStage: { stage: string; count: number }[];
  /** Who cancelled: STAFF, CUSTOMER, SYSTEM … (`unknown` when no event says), most first. */
  byActor: { actor: string; count: number }[];
}

const tally = <T extends string>(keys: T[]): { key: T; count: number }[] => {
  const m = new Map<T, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

export async function cancelledSummary(deps: OrdersDeps, who: Who, query: unknown = {}): Promise<CancelledSummary> {
  await allow(deps, who, 'orders.read');
  const q = parse(cancelledSummaryQuery, query, 'query');
  const zone = await setting(deps, who.storeId, 'store.timeZone');
  const r = dayRange(q.from, q.to, zone);
  const orders = await deps.db.order.findMany({
    where: { storeId: who.storeId, archivedAt: null, status: 'CANCELLED', ...(r ? { cancelledAt: { ...(r.from ? { gte: r.from } : {}), ...(r.before ? { lt: r.before } : {}) } } : {}) },
    select: { id: true, totalMinor: true, currency: true, cancelReasonCode: true },
  });
  const events = orders.length
    ? await deps.db.orderEvent.findMany({ where: { storeId: who.storeId, orderId: { in: orders.map((o) => o.id) }, toStatus: 'CANCELLED' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { orderId: true, fromStatus: true, actorType: true } })
    : [];
  const last = new Map(events.map((e) => [e.orderId, e])); // the latest cancel event of each order wins
  return {
    count: orders.length,
    totalMinor: orders.reduce((n, o) => n + o.totalMinor, 0),
    currency: orders[0]?.currency ?? null,
    byReason: tally(orders.map((o) => o.cancelReasonCode ?? 'none')).map((x) => ({ code: x.key, count: x.count })),
    byStage: tally(orders.map((o) => last.get(o.id)?.fromStatus ?? 'unknown')).map((x) => ({ stage: x.key, count: x.count })),
    byActor: tally(orders.map((o) => last.get(o.id)?.actorType ?? 'unknown')).map((x) => ({ actor: x.key, count: x.count })),
  };
}
