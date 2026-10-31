// S06 · PR 162 — the blocklist with reasons and an undo (Blueprint S06 answer 3; BACKEND-ARCHITECTURE §5.3 ORD-06
// "Blocklist (reason, who, Undo)"). A person lists a phone number with a reason (`risk.block`: owner, manager and
// customer-facing staff as the register records it); "Undo" (`risk.unblock`) writes who, when and why on the same row,
// which is never deleted. A number is listed once at a time; listing it from an order also notes that order's identity
// (PR 519), so the same person under another number is recognised.
//
// While `risk.blocklist` is on, every new order is looked up the moment it lands (`blocklistOnOrder`): an order whose
// number, or whose identity, is on the list is marked for the team (the `blocklistMatch` command: a flag and a timeline
// line naming the listing), and with "hold" also held with the owner's hold reason, for a person to decide. Nothing here
// cancels an order, tells the customer, moves money or changes COD, a price or a charge (CLAUDE.md rule 6).
//
// PR 523: the register also holds what we know about the person — the numbers, the names and addresses given, every
// product ordered with its date — written when the number is listed (block-proposal.ts). The proposals that fill it
// (`risk.blockProposal`) are decided here: "Block" lists the number with the proposal's facts, "Not now" keeps it off
// with a reason; both need `risk.block`, and both are audited. A person always decides.
import { audit } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery';
import { RISK_BLOCK_REASON_LIMITS, riskBlocklistSchema, storeTarget, type RiskBlocklist } from '@extas/settings';
import { z } from 'zod';
import { blockProposalRows, registerFactsOf, personOrders, registerFacts, type BlockProposalRow, type RegisterFacts } from './block-proposal';
import { allow, nowOf, parse, setting, TX, UUID, type OrdersDeps, type Who } from './context';
import { holdWith } from './commands';
import { gateOn, proposeHold } from './approval-gate';
import { recordDecision } from './learning';
import { clusterFamily, clusterOfOrder } from './identity-family';
import { isOrdersError, OrdersError } from './errors';
import type { SettingsWriter } from './rule-switches';
import { execute, staffBy, systemBy, type By } from './service';

/** The order flag of an order from a listed number (Order.flags; the team's screens show it, never the customer). */
export const BLOCKLIST_FLAG = 'RISK_BLOCKLIST';
/** The timeline type of the mark. */
export const BLOCKLIST_EVENT = 'order.blocklistMatch';
/** How many undone listings the screen shows under the active ones (the newest; the rest stay in the database). */
const UNDONE_SHOWN = 50;

export interface BlockRow {
  id: string;
  phone: string;
  reason: string;
  orderId: string | null;
  orderNumber: string | null;
  identity: boolean;
  blockedAt: string;
  blockedBy: string | null;
  undoneAt: string | null;
  undoneBy: string | null;
  undoReason: string | null;
  /** PR 523: what the register holds about the person (null for a listing made before it). */
  facts: RegisterFacts | null;
}

export interface BlocklistView {
  value: RiskBlocklist;
  active: BlockRow[];
  undone: BlockRow[];
  holdReasons: { key: string; en: string; bn: string }[];
  /** PR 523: numbers proposed for the list (a person blocks or says "Not now"), and the newest decided ones. */
  proposals: BlockProposalRow[];
  decidedProposals: BlockProposalRow[];
  /** The shortest and longest reason a person may give (the form and the undo say so before sending). */
  reasonLimits: { min: number; max: number };
}

/** The longest reason (the order screen's dialog stops typing there; the schema checks it). */
export const BLOCK_REASON_MAX = RISK_BLOCK_REASON_LIMITS.max;

const reasonSchema = z.string().trim().min(RISK_BLOCK_REASON_LIMITS.min).max(RISK_BLOCK_REASON_LIMITS.max);
export const blockInput = z.object({ phone: z.string().trim().min(1).max(40).optional(), orderId: z.string().regex(UUID).optional(), reason: reasonSchema }).strict();
export const unblockInput = z.object({ reason: reasonSchema }).strict();
export const saveBlocklistInput = z.object({ value: z.unknown() }).strict();
export const decideProposalInput = z.object({ decision: z.enum(['block', 'dismiss']), reason: reasonSchema }).strict();

async function staffNames(deps: OrdersDeps, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await deps.db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

async function viewOf(deps: OrdersDeps, storeId: number): Promise<BlocklistView> {
  const [value, reasons, active, undone, proposals] = await Promise.all([
    setting(deps, storeId, 'risk.blocklist'),
    setting(deps, storeId, 'orders.hold.reasons'),
    deps.db.riskBlock.findMany({ where: { storeId, undoneAt: null }, orderBy: [{ blockedAt: 'desc' }, { id: 'desc' }] }),
    deps.db.riskBlock.findMany({ where: { storeId, undoneAt: { not: null } }, orderBy: [{ undoneAt: 'desc' }, { id: 'desc' }], take: UNDONE_SHOWN }),
    blockProposalRows(deps, storeId),
  ]);
  const all = [...active, ...undone];
  const [names, orders] = await Promise.all([
    staffNames(deps, all.flatMap((r) => [r.blockedById, r.undoneById])),
    deps.db.order.findMany({ where: { storeId, id: { in: all.map((r) => r.orderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } }),
  ]);
  const numbers = new Map(orders.map((o) => [o.id, o.number]));
  const row = (r: (typeof all)[number]): BlockRow => ({
    id: r.id,
    phone: r.phone,
    reason: r.reason,
    orderId: r.orderId,
    orderNumber: r.orderId ? (numbers.get(r.orderId) ?? null) : null,
    identity: !!r.clusterId,
    blockedAt: r.blockedAt.toISOString(),
    blockedBy: r.blockedById ? (names.get(r.blockedById) ?? null) : null,
    undoneAt: r.undoneAt?.toISOString() ?? null,
    undoneBy: r.undoneById ? (names.get(r.undoneById) ?? null) : null,
    undoReason: r.undoReason,
    facts: r.facts === null ? null : registerFactsOf(r.facts),
  });
  return {
    value,
    active: active.map(row),
    undone: undone.map(row),
    holdReasons: reasons.map((r) => ({ key: r.key, en: r.en, bn: r.bn })),
    proposals: proposals.open,
    decidedProposals: proposals.decided,
    reasonLimits: { ...RISK_BLOCK_REASON_LIMITS },
  };
}

/** PR 523: what the register holds about the person behind a number (and the order's identity, when listed from one). */
async function factsFor(deps: OrdersDeps, storeId: number, phone: string, clusterId: string | null): Promise<RegisterFacts> {
  const family = clusterId ? await clusterFamily(deps.db, storeId, clusterId) : [];
  const take = (await setting(deps, storeId, 'risk.history')).orders;
  return registerFacts(deps.db, await personOrders(deps.db, storeId, phone, family, take));
}

/** The list and its switch (`risk.rules.read`). */
export async function blocklist(deps: OrdersDeps, who: Who): Promise<BlocklistView> {
  await allow(deps, who, 'risk.rules.read');
  return viewOf(deps, who.storeId);
}

/** Lists a number with a reason (`risk.block`): typed, or the number of an order. A number listed already is refused. */
export async function blockNumber(deps: OrdersDeps, who: Who, input: unknown): Promise<BlocklistView> {
  await allow(deps, who, 'risk.block');
  const d = parse(blockInput, input, 'listing');
  let raw = d.phone ?? null;
  let orderId: string | null = null;
  if (d.orderId) {
    const o = await deps.db.order.findFirst({ where: { storeId: who.storeId, id: d.orderId }, select: { id: true, phone: true } });
    if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
    orderId = o.id;
    raw ??= o.phone;
  }
  const p = raw ? phoneNormalizeBD(raw) : null;
  const phone = p?.ok ? p.e164 : null;
  if (!phone) throw new OrdersError('INVALID_INPUT', 'a Bangladeshi mobile number is needed', ['phone']);
  const now = nowOf(deps);
  const clusterId = orderId ? await clusterOfOrder(deps.db, who.storeId, orderId) : null;
  // PR 523: what the register holds about the person, written with the listing
  const facts = await factsFor(deps, who.storeId, phone, clusterId);
  const row = await deps.db.$transaction(async (tx) => {
    // one number at a time per shop, so two people listing it at the same moment make one line
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`risk-blocklist:${who.storeId}:${phone}`}, 0))`;
    if (await tx.riskBlock.findFirst({ where: { storeId: who.storeId, phone, undoneAt: null }, select: { id: true } })) throw new OrdersError('ALREADY_LISTED', 'this number is on the blocklist already', ['phone']);
    const made = await tx.riskBlock.create({ data: { storeId: who.storeId, phone, clusterId, orderId, reason: d.reason, facts: facts as unknown as Prisma.InputJsonValue, blockedById: who.actor.staffUserId ?? null, blockedAt: now } });
    // PR 523: an open proposal for the number is answered by this listing
    const open = await tx.riskBlockProposal.findFirst({ where: { storeId: who.storeId, phone, state: 'PROPOSED' }, select: { id: true, rejections: true } });
    if (open) {
      await tx.riskBlockProposal.update({
        where: { id: open.id },
        data: { state: 'BLOCKED', blockId: made.id, decidedById: who.actor.staffUserId ?? null, decidedAt: now, decisionReason: d.reason, rejectionsAtDecision: open.rejections, version: { increment: 1 } },
      });
    }
    return made;
  }, TX);
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.block', entityType: 'RiskBlock', entityId: row.id, before: null, after: { phone, orderId, reason: d.reason, identity: !!row.clusterId } }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}

/** Undoes a listing with a reason (`risk.unblock`); the row stays with who undid it, when and why. */
export async function unblockNumber(deps: OrdersDeps, who: Who, id: string, input: unknown): Promise<BlocklistView> {
  await allow(deps, who, 'risk.unblock');
  if (!UUID.test(id)) throw new OrdersError('NOT_FOUND', 'no such listing', ['id']);
  const d = parse(unblockInput, input, 'undo');
  const now = nowOf(deps);
  const done = await deps.db.riskBlock.updateMany({ where: { storeId: who.storeId, id, undoneAt: null }, data: { undoneAt: now, undoneById: who.actor.staffUserId ?? null, undoReason: d.reason } });
  if (!done.count) {
    const exists = await deps.db.riskBlock.findFirst({ where: { storeId: who.storeId, id }, select: { id: true } });
    throw exists ? new OrdersError('NOTHING_CHANGED', 'this listing was undone already', ['id']) : new OrdersError('NOT_FOUND', 'no such listing', ['id']);
  }
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.unblock', entityType: 'RiskBlock', entityId: id, before: { active: true }, after: { active: false, reason: d.reason } }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}

/**
 * PR 523: a person decides a proposal (`risk.block`): "block" lists the number with the proposal's facts and the reason;
 * "dismiss" ("Not now") keeps it off with the reason, until a new rejection proposes it again. Decided already is
 * NOTHING_CHANGED; a number listed meanwhile is ALREADY_LISTED (the proposal stays for a person to dismiss).
 */
export async function decideBlockProposal(deps: OrdersDeps, who: Who, id: string, input: unknown): Promise<BlocklistView> {
  await allow(deps, who, 'risk.block');
  if (!UUID.test(id)) throw new OrdersError('NOT_FOUND', 'no such proposal', ['id']);
  const d = parse(decideProposalInput, input, 'decision');
  const now = nowOf(deps);
  const by = who.actor.staffUserId ?? null;
  const out = await deps.db.$transaction(async (tx) => {
    const p = await tx.riskBlockProposal.findFirst({ where: { storeId: who.storeId, id } });
    if (!p) throw new OrdersError('NOT_FOUND', 'no such proposal', ['id']);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`risk-blocklist:${who.storeId}:${p.phone}`}, 0))`;
    const fresh = await tx.riskBlockProposal.findUniqueOrThrow({ where: { id } });
    if (fresh.state !== 'PROPOSED') throw new OrdersError('NOTHING_CHANGED', 'this proposal was decided already', ['id']);
    const decided = { decidedById: by, decidedAt: now, decisionReason: d.reason, rejectionsAtDecision: fresh.rejections, version: { increment: 1 } };
    // PR 543: the decision log the learning reads
    await recordDecision(tx, staffBy(who.actor, who.ctx), { storeId: who.storeId, kind: 'blockProposal', decision: d.decision, orderId: fresh.lastOrderId, note: d.reason });
    if (d.decision === 'dismiss') {
      await tx.riskBlockProposal.update({ where: { id }, data: { state: 'DISMISSED', ...decided } });
      return { blockId: null, phone: fresh.phone, rejections: fresh.rejections };
    }
    if (await tx.riskBlock.findFirst({ where: { storeId: who.storeId, phone: fresh.phone, undoneAt: null }, select: { id: true } })) throw new OrdersError('ALREADY_LISTED', 'this number is on the blocklist already', ['phone']);
    const made = await tx.riskBlock.create({
      data: { storeId: who.storeId, phone: fresh.phone, clusterId: fresh.clusterId, orderId: fresh.lastOrderId, reason: d.reason, facts: fresh.facts as Prisma.InputJsonValue, blockedById: by, blockedAt: now },
    });
    await tx.riskBlockProposal.update({ where: { id }, data: { state: 'BLOCKED', blockId: made.id, ...decided } });
    return { blockId: made.id, phone: fresh.phone, rejections: fresh.rejections };
  }, TX);
  const ctx = { source: 'admin-api', ...who.ctx };
  if (out.blockId) await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.block', entityType: 'RiskBlock', entityId: out.blockId, before: null, after: { phone: out.phone, proposalId: id, reason: d.reason } }, ctx);
  await audit(deps.db, who.actor, { storeId: who.storeId, action: `risk.blockProposal.${d.decision}`, entityType: 'RiskBlockProposal', entityId: id, before: { state: 'PROPOSED' }, after: { state: out.blockId ? 'BLOCKED' : 'DISMISSED', reason: d.reason, rejections: out.rejections } }, ctx);
  return viewOf(deps, who.storeId);
}

/** Saves the switch, what a match gets and the hold reason (`risk.rules.write`). */
export async function saveBlocklist(deps: OrdersDeps & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<BlocklistView> {
  await allow(deps, who, 'risk.rules.write');
  const value = parse(riskBlocklistSchema, parse(saveBlocklistInput, input, 'blocklist').value, 'blocklist');
  const before = await setting(deps, who.storeId, 'risk.blocklist');
  if (JSON.stringify(before) !== JSON.stringify(value)) {
    try {
      await deps.settings.set('risk.blocklist', value, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Risk rules › Blocklist' });
    } catch (e) {
      const details = (e as { details?: string[] }).details ?? [];
      throw new OrdersError('INVALID_INPUT', 'the blocklist settings could not be saved', details.length ? details : ['value']);
    }
    await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.blocklist.save', entityType: 'RiskBlocklistSettings', entityId: String(who.storeId), before, after: value }, { source: 'admin-api', ...who.ctx });
  }
  return viewOf(deps, who.storeId);
}

export interface BlocklistMatch {
  blockId: string;
  via: 'phone' | 'identity';
  hold: 'held' | 'NO_REASON' | 'NOT_HOLDABLE' | 'GATED' | null;
}

/**
 * The look-up the moment an order lands (switch on): its number or its identity on the list marks it once, and with
 * "hold" holds it with the owner's reason. Off, or no match: null. Never cancels or tells the customer.
 */
export async function blocklistOnOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy('blocklist')): Promise<BlocklistMatch | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.blocklist');
  if (!cfg.enabled) return null;
  const order = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { phone: true } });
  if (!order) return null;
  const p = order.phone ? phoneNormalizeBD(order.phone) : null;
  const phone = p?.ok ? p.e164 : null;
  const clusterId = await clusterOfOrder(deps.db, ref.storeId, ref.orderId);
  // PR 163: the identity and every identity since merged into it (a listing made before a merge names the old one)
  const family = clusterId ? await clusterFamily(deps.db, ref.storeId, clusterId) : [];
  const or: Prisma.RiskBlockWhereInput[] = [...(phone ? [{ phone }] : []), ...(family.length ? [{ clusterId: { in: family } }] : [])];
  if (!or.length) return null;
  const hit = await deps.db.riskBlock.findFirst({ where: { storeId: ref.storeId, undoneAt: null, OR: or }, orderBy: [{ blockedAt: 'asc' }, { id: 'asc' }] });
  if (!hit) return null;
  const via = phone && hit.phone === phone ? 'phone' : 'identity';
  let hold: BlocklistMatch['hold'] = null;
  if (cfg.onOrder === 'hold') {
    const reasons = await setting(deps, ref.storeId, 'orders.hold.reasons');
    if (!reasons.some((r) => r.key === cfg.holdReasonKey)) hold = 'NO_REASON';
    // PR 540: with the gate on the hold is only proposed; a person holds it or lets it go
    else if (await gateOn(deps, ref.storeId)) {
      await proposeHold(deps, ref, by, 'blocklistHold', cfg.holdReasonKey);
      hold = 'GATED';
    } else {
      try {
        await holdWith(deps, ref, by, cfg.holdReasonKey, undefined, { idempotencyKey: `blocklist-hold:${ref.orderId}` });
        hold = 'held';
      } catch (e) {
        if (!isOrdersError(e) || e.code !== 'ILLEGAL_TRANSITION') throw e;
        hold = 'NOT_HOLDABLE';
      }
    }
  }
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'blocklistMatch',
        input: { blockId: hit.id },
        effect: async (tx, o) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = row.flags.includes(BLOCKLIST_FLAG) ? row.flags : [...row.flags, BLOCKLIST_FLAG];
          return {
            data: { flags },
            // the reason is in the event's data (the team's timeline line says it once)
            reasonCode: via,
            eventData: { blockId: hit.id, via, reason: hit.reason, blockedAt: hit.blockedAt.toISOString(), hold },
            audit: { before: { flags: row.flags }, after: { flags } },
          };
        },
      },
      { idempotencyKey: `blocklist-match:${ref.orderId}` },
    );
  } catch (e) {
    if (isOrdersError(e) && e.code === 'ILLEGAL_TRANSITION') return null;
    throw e;
  }
  return { blockId: hit.id, via, hold };
}
