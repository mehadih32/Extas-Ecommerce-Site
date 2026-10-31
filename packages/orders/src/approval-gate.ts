// S06 · PR 540 — the approval digest and the permission gate ("the AI reports and then waits: 50 orders today; 30
// confirmed and moved on; 5 held for a call, for this reason; 10 have another order running, 8 of those are duplicates.
// Nothing is acted on until the owner says so").
//
// The gate (`risk.approval.gate`, off as shipped): while it is on the engine acts on nothing by itself. Where the
// duplicate check, a risk level or the blocklist would hold an order, the order gets a *proposed hold* instead — a mark
// and a timeline line naming the rule and the hold reason — and a person with `orders.hold` holds it ("Hold") or lets it
// go ("Let it go"), each with its reason in the timeline. "One parcel by itself" stays a proposal and no advance is asked
// by itself (bundling.ts, advance-request.ts read `gateOn`). Nothing here confirms, cancels or changes money.
//
// The digest (`approvalDigest`, `orders.read`): for one shop day, how many orders were placed, moved on (confirmed and
// beyond), wait (to confirm, for an advance), were held (by reason), cancelled (by reason), had another order running
// and how many of those look like duplicates; and what waits for a person now — the proposed holds, the open reviews, the
// one-parcel proposals and the blocklist proposals. The digest only reads.
import { z } from 'zod';
import { allow, parse, setting, UUID, type OrdersDeps, type Who } from './context';
import { holdWith } from './commands';
import { BUNDLE_FLAG, BUNDLEABLE } from './bundling';
import { isOrdersError, OrdersError } from './errors';
import type { OrderState } from './pure';
import { execute, staffBy, type By } from './service';

/** The order flag of a proposed hold (the team's screens show it, never the customer). */
export const HOLD_PROPOSED_FLAG = 'HOLD_PROPOSED';
/** The timeline type of a proposed hold, and of the decision on it. */
export const HOLD_PROPOSED_EVENT = 'order.holdProposed';
export const HOLD_DECIDED_EVENT = 'order.holdProposalDecided';
/** The engine's holds the gate turns into proposals. */
export const GATED_HOLDS = ['duplicateHold', 'levelHold', 'blocklistHold'] as const;
export type GatedHold = (typeof GATED_HOLDS)[number];
/** The states a proposed hold can still be held from (the hold command's own). */
export const HOLDABLE_PROPOSALS: readonly OrderState[] = ['PLACED', 'CONFIRMED', 'PROCESSING'];
/** The duplicate check's severities: any means another open order is running; "high" means a likely duplicate. */
const SEVERITIES = ['high', 'medium', 'low'];

/** The gate is on: the engine acts on nothing by itself (bundling.ts and advance-request.ts read the setting themselves). */
export async function gateOn(deps: OrdersDeps, storeId: number): Promise<boolean> {
  return (await setting(deps, storeId, 'risk.approval')).gate;
}

/** Writes a proposed hold on the order (once per rule): the mark and a timeline line with the rule and the reason key. */
export async function proposeHold(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, rule: GatedHold, reasonKey: string): Promise<void> {
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'holdProposed',
        input: { rule, reasonKey },
        effect: async (tx, o) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = row.flags.includes(HOLD_PROPOSED_FLAG) ? row.flags : [...row.flags, HOLD_PROPOSED_FLAG];
          return { data: { flags }, reasonCode: rule, eventData: { rule, reasonKey }, audit: { before: { flags: row.flags }, after: { flags } } };
        },
      },
      { idempotencyKey: `hold-proposed:${ref.orderId}:${rule}` },
    );
  } catch (e) {
    if (!isOrdersError(e) || e.code !== 'ILLEGAL_TRANSITION') throw e;
  }
}

export interface HoldProposal {
  rule: GatedHold;
  reasonKey: string;
  at: string;
}

/** The order's open proposed hold (marked, still holdable), or null. */
export async function holdProposalOf(deps: OrdersDeps, storeId: number, orderId: string): Promise<HoldProposal | null> {
  const o = await deps.db.order.findFirst({ where: { storeId, id: orderId }, select: { flags: true, status: true } });
  if (!o || !o.flags.includes(HOLD_PROPOSED_FLAG) || !HOLDABLE_PROPOSALS.includes(o.status as OrderState)) return null;
  const e = await deps.db.orderEvent.findFirst({ where: { storeId, orderId, type: HOLD_PROPOSED_EVENT }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { data: true, createdAt: true } });
  const d = (e?.data ?? {}) as { rule?: unknown; reasonKey?: unknown };
  if (!e || !(GATED_HOLDS as readonly unknown[]).includes(d.rule) || typeof d.reasonKey !== 'string') return null;
  return { rule: d.rule as GatedHold, reasonKey: d.reasonKey, at: e.createdAt.toISOString() };
}

export const decideHoldInput = z.object({ decision: z.enum(['hold', 'dismiss']), note: z.string().trim().min(1).max(500) }).strict();

/**
 * A person decides a proposed hold (`orders.hold`): "hold" holds the order with the proposal's reason (the note in the
 * timeline) and clears the mark in the same step; "dismiss" ("Let it go") clears the mark with the note. Refused with
 * NOTHING_CHANGED when there is no open proposal.
 */
export async function decideHoldProposal(deps: OrdersDeps, who: Who, orderId: string, input: unknown): Promise<{ decision: 'hold' | 'dismiss' }> {
  await allow(deps, who, 'orders.hold');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(decideHoldInput, input, 'decision');
  const p = await holdProposalOf(deps, who.storeId, orderId);
  if (!p) throw new OrdersError('NOTHING_CHANGED', 'no proposed hold is open on this order', ['orderId']);
  const ref = { storeId: who.storeId, orderId };
  const by = staffBy(who.actor, who.ctx);
  if (d.decision === 'hold') {
    // the hold and the cleared mark in one step
    await holdWith(deps, ref, by, p.reasonKey, d.note, {
      also: async (tx, o) => {
        const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
        await tx.order.update({ where: { id: o.id }, data: { flags: row.flags.filter((f) => f !== HOLD_PROPOSED_FLAG) } });
        return { proposal: p.rule };
      },
    });
    return { decision: 'hold' };
  }
  await execute(deps, ref, by, {
    command: 'holdProposalDecided',
    input: { decision: d.decision },
    effect: async (tx, o) => {
      const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
      const flags = row.flags.filter((f) => f !== HOLD_PROPOSED_FLAG);
      return { data: { flags }, reasonCode: 'dismiss', message: d.note, eventData: { decision: 'dismiss', rule: p.rule }, audit: { before: { flags: row.flags }, after: { flags } } };
    },
  });
  return { decision: 'dismiss' };
}

// ---------------------------------------------------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------------------------------------------------

export interface DigestCount {
  key: string;
  count: number;
}

export interface DigestWaitRow {
  orderId: string;
  number: string;
  /** The rule of a proposed hold, the action a review proposes, or null. */
  what: string | null;
  /** A proposed hold's reason key. */
  reasonKey: string | null;
  confidence: number | null;
  at: string;
}

export interface DigestList {
  rows: DigestWaitRow[];
  /** How many there are in all (the list shows at most `maxRows`). */
  total: number;
}

export interface ApprovalDigest {
  from: string;
  to: string;
  placed: number;
  /** Confirmed and beyond (packed, with the courier, delivered, returned). */
  movedOn: number;
  /** Placed and not confirmed yet. */
  toConfirm: number;
  awaitingAdvance: number;
  held: DigestCount[];
  cancelled: DigestCount[];
  /** The day's orders the duplicate check found another open order for, and those that look like duplicates. */
  running: number;
  duplicates: number;
  gate: boolean;
  /** What waits for a person now (any day). */
  holds: DigestList;
  reviews: DigestList;
  bundles: DigestList;
  blockProposals: number;
}

const MOVED_ON: readonly OrderState[] = ['CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'];
const desc = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/** The digest of the orders placed in [from, to) and what waits now (`orders.read`). */
export async function approvalDigest(deps: OrdersDeps, who: Who, period: { from: Date; to: Date }): Promise<ApprovalDigest> {
  await allow(deps, who, 'orders.read');
  const storeId = who.storeId;
  const cfg = await setting(deps, storeId, 'risk.approval');
  const day = { storeId, placedAt: { gte: period.from, lt: period.to } };
  const take = cfg.maxRows;
  const [byStatus, held, cancelled, checks, holdOrders, holdCount, alerts, alertCount, bundleOrders, bundleCount, blockProposals] = await Promise.all([
    deps.db.order.groupBy({ by: ['status'], where: day, _count: { _all: true } }),
    deps.db.order.groupBy({ by: ['holdReasonCode'], where: { ...day, status: 'ON_HOLD' }, _count: { _all: true } }),
    deps.db.order.groupBy({ by: ['cancelReasonCode'], where: { ...day, status: 'CANCELLED' }, _count: { _all: true } }),
    deps.db.orderEvent.findMany({ where: { storeId, type: 'order.duplicateCheck', reasonCode: { in: SEVERITIES }, order: { placedAt: { gte: period.from, lt: period.to } } }, orderBy: desc, select: { orderId: true, reasonCode: true } }),
    deps.db.order.findMany({ where: { storeId, flags: { has: HOLD_PROPOSED_FLAG }, status: { in: [...HOLDABLE_PROPOSALS] } }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take, select: { id: true, number: true } }),
    deps.db.order.count({ where: { storeId, flags: { has: HOLD_PROPOSED_FLAG }, status: { in: [...HOLDABLE_PROPOSALS] } } }),
    deps.db.fraudAlert.findMany({ where: { storeId, status: 'OPEN' }, orderBy: desc, take, select: { orderId: true, proposedAction: true, confidence: true, createdAt: true } }),
    deps.db.fraudAlert.count({ where: { storeId, status: 'OPEN' } }),
    deps.db.order.findMany({ where: { storeId, flags: { has: BUNDLE_FLAG }, orderGroupId: null, status: { in: [...BUNDLEABLE] } }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take, select: { id: true, number: true, placedAt: true } }),
    deps.db.order.count({ where: { storeId, flags: { has: BUNDLE_FLAG }, orderGroupId: null, status: { in: [...BUNDLEABLE] } } }),
    deps.db.riskBlockProposal.count({ where: { storeId, state: 'PROPOSED' } }),
  ]);
  const n = (s: OrderState[]) => byStatus.filter((r) => s.includes(r.status as OrderState)).reduce((a, r) => a + r._count._all, 0);
  // the first check of an order says whether another order was running when it landed
  const firstCheck = new Map<string, string>();
  for (const c of [...checks].reverse()) if (!firstCheck.has(c.orderId)) firstCheck.set(c.orderId, c.reasonCode ?? '');
  const [proposals, alertOrders] = await Promise.all([
    deps.db.orderEvent.findMany({ where: { storeId, orderId: { in: holdOrders.map((o) => o.id) }, type: HOLD_PROPOSED_EVENT }, orderBy: desc, select: { orderId: true, data: true, createdAt: true } }),
    deps.db.order.findMany({ where: { storeId, id: { in: alerts.map((a) => a.orderId) } }, select: { id: true, number: true } }),
  ]);
  const proposalOf = new Map<string, (typeof proposals)[number]>();
  for (const p of proposals) if (!proposalOf.has(p.orderId)) proposalOf.set(p.orderId, p);
  const numberOf = new Map(alertOrders.map((o) => [o.id, o.number]));
  const counts = (rows: { _count: { _all: number } }[], key: (r: never) => string | null) =>
    rows.map((r) => ({ key: key(r as never) ?? '', count: r._count._all })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    from: period.from.toISOString(),
    to: period.to.toISOString(),
    placed: n([...MOVED_ON, 'PLACED', 'AWAITING_ADVANCE', 'ON_HOLD', 'CANCELLED']),
    movedOn: n([...MOVED_ON]),
    toConfirm: n(['PLACED']),
    awaitingAdvance: n(['AWAITING_ADVANCE']),
    held: counts(held, (r: { holdReasonCode: string | null }) => r.holdReasonCode),
    cancelled: counts(cancelled, (r: { cancelReasonCode: string | null }) => r.cancelReasonCode),
    running: firstCheck.size,
    duplicates: [...firstCheck.values()].filter((s) => s === 'high').length,
    gate: cfg.gate,
    holds: {
      total: holdCount,
      rows: holdOrders.map((o) => {
        const p = proposalOf.get(o.id);
        const d = (p?.data ?? {}) as { rule?: unknown; reasonKey?: unknown };
        return { orderId: o.id, number: o.number, what: typeof d.rule === 'string' ? d.rule : null, reasonKey: typeof d.reasonKey === 'string' ? d.reasonKey : null, confidence: null, at: (p?.createdAt ?? new Date(0)).toISOString() };
      }),
    },
    reviews: {
      total: alertCount,
      rows: alerts.flatMap((a) => (numberOf.has(a.orderId) ? [{ orderId: a.orderId, number: numberOf.get(a.orderId)!, what: a.proposedAction, reasonKey: null, confidence: a.confidence, at: a.createdAt.toISOString() }] : [])),
    },
    bundles: { total: bundleCount, rows: bundleOrders.map((o) => ({ orderId: o.id, number: o.number, what: null, reasonKey: null, confidence: null, at: o.placedAt.toISOString() })) },
    blockProposals,
  };
}
