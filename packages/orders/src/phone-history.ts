// S06 · PR 157 — phone history: every earlier order of the same number in the store, matched in its stored and its local
// form through the one BD phone helper (@extas/delivery phoneNormalizeBD), each with its outcome — delivered, refused
// (and why: the owner's refusal reasons, read from the order service's `returned` step or the courier's return record),
// cancelled (and the code), still open or with the courier — with the call outcomes on it and its returns after delivery.
// It is a read: for the risk score (PR 156) and for the order page beside the order (`orders.read`).
//
// SIM-F-044: a refusal for one of the owner's "our fault" reasons (`risk.history.ourFaultRefusals`) is shown, marked,
// and never counted against the number. Nothing here changes an order, blocks a number or moves money.
import { phoneNormalizeBD } from '@extas/delivery';
import { allow, setting, UUID, type OrdersDeps, type Who } from './context';
import { summarizeHistory, type OrderState, type PastOrder, type PhoneSummary } from './pure';

const RETURN_KINDS_AFTER_DELIVERY: ('RETURNED' | 'CHARGE_PAID_RETURN' | 'DEFECT_RETURN')[] = ['RETURNED', 'CHARGE_PAID_RETURN', 'DEFECT_RETURN'];

/** The forms one number may be stored in (E.164 as the checkout stores it, the local 01… form); the raw text otherwise. */
export function phoneForms(phone: string | null | undefined): string[] {
  if (!phone) return [];
  const p = phoneNormalizeBD(phone);
  return p.ok ? [...new Set([p.e164, p.digits])] : [phone];
}

/** The refusal reason of each returned order: the order service's `returned` step, else the courier's return record. */
export async function refusalKeys(deps: OrdersDeps, storeId: number, ids: string[]): Promise<Map<string, string | null>> {
  if (!ids.length) return new Map();
  const [events, records] = await Promise.all([
    deps.db.orderEvent.findMany({ where: { storeId, orderId: { in: ids }, type: 'order.returned' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { orderId: true, reasonCode: true } }),
    deps.db.returnRecord.findMany({ where: { storeId, orderId: { in: ids }, kind: 'REFUSED_AT_DOOR' }, orderBy: { createdAt: 'asc' }, select: { orderId: true, reasonCode: true } }),
  ]);
  const out = new Map<string, string | null>();
  for (const r of records) if (r.reasonCode) out.set(r.orderId, r.reasonCode);
  for (const e of events) if (e.reasonCode) out.set(e.orderId, e.reasonCode);
  return out;
}

/**
 * The earlier orders of one number in a store, newest first (at most `take`), without `excludeOrderId`, only those
 * placed before `before` when given (the score reads the history as it was when the order landed).
 */
export async function phoneOrders(deps: OrdersDeps, storeId: number, phone: string | null, opts: { excludeOrderId?: string; before?: Date; take: number }): Promise<PastOrder[]> {
  const forms = phoneForms(phone);
  if (!forms.length) return [];
  const rows = await deps.db.order.findMany({
    where: {
      storeId,
      phone: { in: forms },
      status: { not: 'DRAFT' },
      archivedAt: null,
      ...(opts.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
      ...(opts.before ? { placedAt: { lt: opts.before } } : {}),
    },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: Math.max(0, opts.take),
    select: { id: true, number: true, placedAt: true, status: true, totalMinor: true, cancelReasonCode: true, areaId: true },
  });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [keys, calls, returns] = await Promise.all([
    refusalKeys(deps, storeId, rows.filter((r) => r.status === 'RETURNED').map((r) => r.id)),
    deps.db.callTask.findMany({ where: { storeId, orderId: { in: ids }, outcome: { not: null } }, select: { orderId: true, outcome: true } }),
    deps.db.returnRecord.findMany({ where: { storeId, orderId: { in: ids }, kind: { in: RETURN_KINDS_AFTER_DELIVERY } }, select: { orderId: true, kind: true, reasonCode: true } }),
  ]);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    placedAt: r.placedAt,
    status: r.status as OrderState,
    totalMinor: r.totalMinor,
    refusalKey: keys.get(r.id) ?? null,
    cancelCode: r.cancelReasonCode,
    areaId: r.areaId,
    callOutcomes: calls.filter((c) => c.orderId === r.id).map((c) => c.outcome!),
    returns: returns.filter((x) => x.orderId === r.id).map((x) => ({ kind: x.kind, reasonCode: x.reasonCode })),
  }));
}

/** The owner's `risk.history`: how many earlier orders are read, the our-fault refusals, the "no answer" call outcomes. */
export async function historyOptions(deps: OrdersDeps, storeId: number): Promise<{ take: number; ourFault: ReadonlySet<string>; noAnswerOutcomes: ReadonlySet<string> }> {
  const h = await setting(deps, storeId, 'risk.history');
  return { take: h.orders, ourFault: new Set(h.ourFaultRefusals), noAnswerOutcomes: new Set(h.noAnswerOutcomes) };
}

export interface PhoneHistoryRow {
  id: string;
  number: string;
  status: OrderState;
  placedAt: Date;
  totalMinor: number;
  refusalKey: string | null;
  /** A refusal for a reason the shop caused: shown, never counted. */
  ourFault: boolean;
  cancelCode: string | null;
}

export interface PhoneHistoryView {
  /** The number as the team reads it (01712-345678), or the stored text when it is not a mobile number. */
  phone: string | null;
  summary: PhoneSummary;
  recent: PhoneHistoryRow[];
}

/** The history of one order's phone number now (every other order of the number), for the order page (`orders.read`). */
export async function orderPhoneHistory(deps: OrdersDeps, who: Who, orderId: string, take = 5): Promise<PhoneHistoryView | null> {
  await allow(deps, who, 'orders.read');
  if (!UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, phone: true } });
  if (!o) return null;
  const opts = await historyOptions(deps, who.storeId);
  const past = await phoneOrders(deps, who.storeId, o.phone, { excludeOrderId: o.id, take: opts.take });
  const p = o.phone ? phoneNormalizeBD(o.phone) : null;
  return {
    phone: p?.ok ? p.nice : (o.phone ?? null),
    summary: summarizeHistory(past, { ourFault: opts.ourFault, noAnswerOutcomes: opts.noAnswerOutcomes }),
    recent: past.slice(0, Math.max(0, take)).map((x) => ({
      id: x.id,
      number: x.number,
      status: x.status,
      placedAt: x.placedAt,
      totalMinor: x.totalMinor,
      refusalKey: x.refusalKey,
      ourFault: x.status === 'RETURNED' && !!x.refusalKey && opts.ourFault.has(x.refusalKey),
      cancelCode: x.cancelCode,
    })),
  };
}
