// S05 · PR 150 — the customer's whole order history and each order's life, as he may see it (Blueprint B1.1 "customer
// dashboard with full order history and lifecycle"; demo 60-account.js acc_tabOrders, ord_track). Pure: no database.
//
// - My orders groups his orders the way he thinks of them: still on its way, delivered, or stopped (cancelled or
//   returned). The groups are read from the stored state only (moving an order is the order service's, CN-022).
// - "What happened" on the order page is his order's own story from what the order stores: its step times, and the
//   order service's timeline rows that are about him or his parcel — his edits and the team's, a piece added or taken
//   out, his two-size answer, his cancel request and its answer, the advance. Never the team's internal rows (notes,
//   flags, holds, duplicate and risk checks), never a staff member's name, never a note the team wrote.
import type { OrderState, OrderTimes } from './pure';

/** PR 150 — the groups My orders can show ("all" is every placed order). */
export const ORDER_SHOWS = ['all', 'open', 'delivered', 'ended'] as const;
export type OrderShow = (typeof ORDER_SHOWS)[number];

/** The stored states of each group (DRAFT is never his order). */
export const SHOW_STATES: Readonly<Record<Exclude<OrderShow, 'all'>, readonly OrderState[]>> = {
  open: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT'],
  delivered: ['DELIVERED', 'PARTIALLY_DELIVERED'],
  ended: ['CANCELLED', 'RETURNED'],
};

export const isOrderShow = (v: unknown): v is OrderShow => typeof v === 'string' && (ORDER_SHOWS as readonly string[]).includes(v);

/** The group a stored state belongs to (null: a draft). */
export function showOf(status: OrderState): Exclude<OrderShow, 'all'> | null {
  for (const k of ['open', 'delivered', 'ended'] as const) if (SHOW_STATES[k].includes(status)) return k;
  return null;
}

/** A page number from an address's query (?page=2): a whole number from 1, anything else is the first page. */
export function pageOf(raw: unknown): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof v === 'string' && /^\d{1,5}$/.test(v) ? Number(v) : 1;
  return n >= 1 ? n : 1;
}

/** One row of "What happened". */
export type LifeKind =
  | 'placed'
  | 'advanceWait'
  | 'advancePaid'
  | 'confirmed'
  | 'edited'
  | 'added'
  | 'removed'
  | 'sizeAnswered'
  | 'cancelAsked'
  | 'cancelKept'
  | 'packed'
  | 'courier'
  | 'delivered'
  | 'partDelivered'
  | 'returned'
  | 'cancelled';

/** What an edit changed, in the words of the page (`account.life.field.*`). */
export type LifeField = 'name' | 'phone' | 'address' | 'note';

export interface LifeStep {
  at: string;
  kind: LifeKind;
  /** Who did it: he did ("you"), the shop did, or nobody to name (a step of the parcel's journey). */
  by: 'you' | 'shop' | null;
  /** edited: the fields changed (never their values: the page shows the order as it is now). */
  fields?: LifeField[];
  /** edited / added / removed: the pieces, as the order stored them ("Polo · Navy · M"), with the new one for a size. */
  lines?: { from: string; to: string | null }[];
  /** sizeAnswered: the piece and what he kept ("M", or null for every size). */
  product?: string;
  keep?: string | null;
}

/** A timeline row the shop may show him (the order service's `order.<command>` rows). */
export interface LifeEventRow {
  type: string;
  actorType: string;
  at: Date | string;
  data: unknown;
  /** added / removed: the line the row names, as the order stored it. */
  line?: string | null;
}

/** The timeline rows his page reads; every other type is the team's own. */
export const LIFE_EVENT_TYPES = [
  'order.awaitAdvance',
  'order.recordAdvance',
  'order.edit',
  'order.addLine',
  'order.removeLine',
  'order.twoSizeAnswer',
  'order.requestCancel',
  'order.refuseCancelRequest',
  'order.cancel',
  'order.cancelAfterBooking',
] as const;

const FIELD: Readonly<Record<string, LifeField>> = { customerName: 'name', phone: 'phone', address: 'address', deliveryNote: 'note' };

const iso = (d: Date | string): string => new Date(d).toISOString();
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const byOf = (actorType: string): 'you' | 'shop' => (actorType === 'CUSTOMER' ? 'you' : 'shop');

/** The order of rows that happened in the same second (a step before what it caused). */
const RANK: Readonly<Record<LifeKind, number>> = {
  placed: 0,
  advanceWait: 1,
  advancePaid: 2,
  confirmed: 3,
  edited: 4,
  added: 4,
  removed: 4,
  sizeAnswered: 4,
  cancelAsked: 5,
  cancelKept: 6,
  packed: 7,
  courier: 8,
  delivered: 9,
  partDelivered: 9,
  returned: 10,
  cancelled: 11,
};

/** An edit row as his page tells it (null: nothing in it he would recognise). */
function editStep(e: LifeEventRow): LifeStep | null {
  const d = rec(e.data);
  const fields = (Array.isArray(d.fields) ? d.fields : []).map((f) => FIELD[String(rec(f).field)]).filter((f): f is LifeField => !!f);
  const lines = (Array.isArray(d.lines) ? d.lines : []).flatMap((l) => {
    const r = rec(l);
    const from = str(r.label);
    if (!from) return [];
    return [{ from, to: r.kind === 'size' ? str(r.toLabel) : null }];
  });
  if (!fields.length && !lines.length) return null;
  return { at: iso(e.at), kind: 'edited', by: byOf(e.actorType), ...(fields.length ? { fields: [...new Set(fields)] } : {}), ...(lines.length ? { lines } : {}) };
}

/**
 * The order's life, oldest first: its stored step times, and the timeline rows that are his to see. A cancelled order
 * says who cancelled it (he did, or the shop), never the team's reason code.
 */
export function lifecycleOf(o: { status: OrderState; times: OrderTimes }, events: readonly LifeEventRow[]): LifeStep[] {
  const out: LifeStep[] = [];
  const t = o.times;
  const step = (kind: LifeKind, at: Date | string | null | undefined, by: LifeStep['by'] = null) => {
    if (at) out.push({ at: iso(at), kind, by });
  };
  step('placed', t.placedAt);
  step('confirmed', t.confirmedAt, 'shop');
  step('packed', t.packedAt);
  step('courier', t.handedOverAt);
  step(o.status === 'PARTIALLY_DELIVERED' ? 'partDelivered' : 'delivered', t.deliveredAt);
  step('returned', t.returnedAt);
  let cancelBy: LifeStep['by'] = null;
  for (const e of events) {
    switch (e.type) {
      case 'order.awaitAdvance':
        out.push({ at: iso(e.at), kind: 'advanceWait', by: null });
        break;
      case 'order.recordAdvance':
        out.push({ at: iso(e.at), kind: 'advancePaid', by: null });
        break;
      case 'order.edit': {
        const s = editStep(e);
        if (s) out.push(s);
        break;
      }
      case 'order.addLine':
      case 'order.removeLine':
        out.push({ at: iso(e.at), kind: e.type === 'order.addLine' ? 'added' : 'removed', by: byOf(e.actorType), ...(e.line ? { lines: [{ from: e.line, to: null }] } : {}) });
        break;
      case 'order.twoSizeAnswer': {
        const d = rec(e.data);
        const keep = str(d.keep);
        out.push({ at: iso(e.at), kind: 'sizeAnswered', by: byOf(e.actorType), product: str(d.product) ?? '', keep: keep === 'all' ? null : keep });
        break;
      }
      case 'order.requestCancel':
        out.push({ at: iso(e.at), kind: 'cancelAsked', by: 'you' });
        break;
      case 'order.refuseCancelRequest':
        out.push({ at: iso(e.at), kind: 'cancelKept', by: 'shop' });
        break;
      case 'order.cancel':
      case 'order.cancelAfterBooking':
        cancelBy = byOf(e.actorType);
        break;
    }
  }
  if (o.status === 'CANCELLED' || t.cancelledAt) step('cancelled', t.cancelledAt ?? null, cancelBy ?? 'shop');
  return out.sort((a, b) => a.at.localeCompare(b.at) || RANK[a.kind] - RANK[b.kind]);
}
