// S06 · PR 521 — the alert summary: one review (a duplicate's, PR 145/520, or a risk section's, PR 541) explained in one
// read, so the person who decides needs seconds, not a search — why it fired (the duplicate rules that fired with their
// confidence, the old look-back's "how alike", or the risk signals), which earlier orders matched (number, status, when,
// total, how alike, the rules that matched it and, with the identity graph on, how it is the same person), what the
// riders wrote on this customer's parcels (the courier's events and the return records, PR 526 fills them), what his
// number and his identity came to, and the decisions this person may take, the proposed one first.
// A read only (`orders.risk.read`): nothing here decides, holds, cancels or blocks; the decision stays decideReview's.
import { actorPermissions } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { allow, setting, UUID, type OrdersDeps, type OrdersPermission, type Who } from './context';
import { DECISIONS, reviewKindOf, DUPLICATE_SECTION, type Decision, type StoredRuleHit } from './duplicates';
import { clusterOrders } from './identity-graph';
import { historyOptions, pastOrdersOf, phoneForms, phoneOrders } from './phone-history';
import { summarizeHistory, type IdentityVia, type OrderState, type PhoneSummary } from './pure';

/** One matched earlier order, as the summary shows it. */
export interface AlertMatch {
  orderId: string;
  number: string;
  status: OrderState;
  placedAt: Date;
  totalMinor: number;
  /** How alike the lines are (high, medium, low), when the check said. */
  severity: string | null;
  /** PR 520: the rules that matched this order. */
  rules: string[];
  /** PR 519: how it is the same person (empty: not linked, or the graph is off). */
  via: IdentityVia[];
}

/** What a rider wrote on one of this customer's parcels. */
export interface RiderNote {
  orderId: string;
  number: string;
  at: Date;
  note: string;
  /** The courier's event, or the return record (with its reason). */
  from: 'courier' | 'return';
  reasonCode: string | null;
}

export interface AlertSummary {
  alertId: string;
  orderId: string;
  number: string;
  status: string;
  kind: 'duplicate' | 'risk';
  section: string;
  severity: string | null;
  confidence: number | null;
  proposedAction: string;
  /** The decision the alert proposes (cancel → decline, hold → hold, anything else → approve). */
  proposed: Decision;
  /** PR 541: the risk signals that put it in its section. */
  because: string[];
  /** PR 520: the duplicate rules that fired (empty for the look-back and for a risk review). */
  rules: StoredRuleHit[];
  /** The check ran again after an edit (PR 142). */
  afterEdit: boolean;
  matches: AlertMatch[];
  riderNotes: RiderNote[];
  history: {
    /** Every other order of this number. */
    phone: PhoneSummary;
    /** PR 519: the identity's other orders (other numbers too); null when the graph is off or the order is not linked. */
    identity: PhoneSummary | null;
    otherPhones: number;
  };
  /** The decisions this person may take now, the proposed one first (empty once decided). */
  options: Decision[];
  createdAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
}

/** How many rider notes and identity orders one summary reads. */
const SUMMARY_TAKE = { notes: 5, identity: 50 } as const;
const PROPOSES: Readonly<Record<string, Decision>> = { CANCEL: 'decline', HOLD: 'hold' };
/** The permission each decision needs beside `orders.risk.decide`. */
const NEEDS: Readonly<Partial<Record<Decision, OrdersPermission>>> = { decline: 'orders.cancel', hold: 'orders.hold', merge: 'orders.merge' };

/** One review explained. Null: no such review in this store (or not a duplicate's or a risk section's). */
export async function alertSummary(deps: OrdersDeps, who: Who, alertId: string): Promise<AlertSummary | null> {
  await allow(deps, who, 'orders.risk.read');
  if (!UUID.test(alertId)) return null;
  const a = await deps.db.fraudAlert.findFirst({ where: { id: alertId, storeId: who.storeId } });
  if (!a) return null;
  const k = reviewKindOf(a.summary);
  if (!k.risk && k.section !== DUPLICATE_SECTION) return null;
  const storeId = who.storeId;
  const o = await deps.db.order.findFirst({ where: { id: a.orderId, storeId }, select: { id: true, number: true, phone: true } });
  if (!o) return null;
  const summary = (a.summary ?? {}) as { matches?: { orderId?: unknown; severity?: unknown }[]; after?: unknown };
  const severity = new Map((summary.matches ?? []).flatMap((m) => (typeof m.orderId === 'string' ? [[m.orderId, typeof m.severity === 'string' ? m.severity : null] as const] : [])));

  // his number's history and (with the graph on) his identity's
  const [opts, identityOn] = await Promise.all([historyOptions(deps, storeId), setting(deps, storeId, 'risk.identity').then((c) => c.enabled)]);
  const [past, cluster] = await Promise.all([phoneOrders(deps, storeId, o.phone, { excludeOrderId: o.id, take: opts.take }), identityOn ? clusterOrders(deps, storeId, o.id, SUMMARY_TAKE.identity) : null]);
  const sumOpts = { ourFault: opts.ourFault, noAnswerOutcomes: opts.noAnswerOutcomes };
  const identityPast = cluster ? await pastOrdersOf(deps, storeId, cluster.orders) : null;
  const forms = new Set(phoneForms(o.phone));
  const via = new Map((cluster?.orders ?? []).map((x) => [x.id, x.via]));

  const matchedRows = a.matchedOrderIds.length
    ? await deps.db.order.findMany({ where: { storeId, id: { in: a.matchedOrderIds } }, select: { id: true, number: true, status: true, placedAt: true, totalMinor: true } })
    : [];
  const byId = new Map(matchedRows.map((r) => [r.id, r]));
  const matches: AlertMatch[] = a.matchedOrderIds.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [{ orderId: r.id, number: r.number, status: r.status as OrderState, placedAt: r.placedAt, totalMinor: r.totalMinor, severity: severity.get(id) ?? null, rules: k.rules.filter((h) => h.matches.some((m) => m.orderId === id)).map((h) => h.rule), via: via.get(id) ?? [] }];
  });

  // what the riders wrote on this customer's parcels (the matched orders, his number's and his identity's)
  const related = [...new Set([o.id, ...a.matchedOrderIds, ...past.map((p) => p.id), ...(cluster?.orders ?? []).map((x) => x.id)])];
  const noted: Prisma.StringNullableFilter = { not: null };
  const [events, returns] = await Promise.all([
    deps.db.shipmentEvent.findMany({ where: { storeId, riderNote: noted, shipment: { orderId: { in: related } } }, orderBy: { occurredAt: 'desc' }, take: SUMMARY_TAKE.notes, select: { riderNote: true, occurredAt: true, shipment: { select: { orderId: true } } } }),
    deps.db.returnRecord.findMany({ where: { storeId, riderNote: noted, orderId: { in: related } }, orderBy: { createdAt: 'desc' }, take: SUMMARY_TAKE.notes, select: { orderId: true, riderNote: true, reasonCode: true, createdAt: true } }),
  ]);
  const noteIds = [...new Set([...events.map((e) => e.shipment.orderId), ...returns.map((r) => r.orderId)])];
  const numbers = new Map((noteIds.length ? await deps.db.order.findMany({ where: { storeId, id: { in: noteIds } }, select: { id: true, number: true } }) : []).map((r) => [r.id, r.number]));
  const riderNotes: RiderNote[] = [
    ...events.map((e): RiderNote => ({ orderId: e.shipment.orderId, number: numbers.get(e.shipment.orderId) ?? '', at: e.occurredAt, note: e.riderNote ?? '', from: 'courier', reasonCode: null })),
    ...returns.map((r): RiderNote => ({ orderId: r.orderId, number: numbers.get(r.orderId) ?? '', at: r.createdAt, note: r.riderNote ?? '', from: 'return', reasonCode: r.reasonCode })),
  ]
    .filter((n) => n.note.trim())
    .sort((x, y) => y.at.getTime() - x.at.getTime())
    .slice(0, SUMMARY_TAKE.notes);

  // the decisions this person may take, the proposed one first
  const proposed = PROPOSES[a.proposedAction] ?? 'approve';
  let options: Decision[] = [];
  const held = a.status === 'OPEN' ? await actorPermissions(deps.db, who.actor, { storeId }) : new Set<string>();
  if (held.has('orders.risk.decide')) {
    for (const dcs of DECISIONS) {
      if (dcs === 'merge' && (k.risk || !a.matchedOrderIds.length)) continue;
      const need = NEEDS[dcs];
      if (need && !held.has(need)) continue;
      options.push(dcs);
    }
    if (options.includes(proposed)) options = [proposed, ...options.filter((x) => x !== proposed)];
  }

  return {
    alertId: a.id,
    orderId: o.id,
    number: o.number,
    status: a.status,
    kind: k.risk ? 'risk' : 'duplicate',
    section: k.section,
    severity: a.severity,
    confidence: a.confidence,
    proposedAction: a.proposedAction,
    proposed,
    because: k.because,
    rules: k.rules,
    afterEdit: summary.after === 'edit',
    matches,
    riderNotes,
    history: { phone: summarizeHistory(past, sumOpts), identity: identityPast ? summarizeHistory(identityPast, sumOpts) : null, otherPhones: new Set((cluster?.orders ?? []).map((x) => x.phone).filter((p): p is string => !!p && !forms.has(p))).size },
    options,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt,
    decisionReason: a.decisionReason,
  };
}
