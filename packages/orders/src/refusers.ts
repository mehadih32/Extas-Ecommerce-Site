// S06 · PR 163 — repeat refusers, reversible by hand (Blueprint S06 answer 5: "COD off, delivery charge in advance, full
// advance, or nothing; the owner chooses per case"; F #1–5: no automatic block anywhere).
//
// The list: numbers whose parcels came back refused at least `risk.refusers.minRefused` times, counted the way the phone
// history counts them (PR 157: a refusal for one of the owner's "our fault" reasons, or a try-on re-shipped in another
// size, never counts). Empty until the owner sets the number.
//
// The terms: per number, the owner (`risk.refuser.terms`) chooses nothing, the delivery charge first, the full amount
// first, or no cash on delivery, with a reason; the number of refusals then is kept with it. A new choice ends the old
// one; "End" ends it with a reason. Rows are never deleted. The terms also note the number's identity (PR 519), so the
// same person under another number gets them too.
//
// While `risk.refusers` is on, a new order from the number (or its identity) carries the terms the moment it lands (the
// `refuserTerms` command: a "Repeat refuser" mark and a timeline line), and the terms become the order's advance
// proposal ("Request advance", PR 542): a person sends it — unless the owner turned on that request's own auto option
// (`orders.advanceRequest.auto`, off), which then asks it right here. Nothing here changes a COD rule, a price or a charge
// by itself, cancels an order or tells the customer anything (CLAUDE.md rule 6).
import { audit } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery';
import { REFUSER_TERMS, RISK_BLOCK_REASON_LIMITS, riskRefusersSchema, storeTarget, type RefuserTerms, type RiskRefusers } from '@extas/settings';
import { z } from 'zod';
import { autoAdvance, type AdvanceRequestResult } from './advance-request';
import { allow, nowOf, parse, setting, TX, UUID, type OrdersDeps, type Who } from './context';
import { isOrdersError, OrdersError } from './errors';
import { clusterFamily, clusterOfOrder } from './identity-family';
import { historyOptions, phoneForms, phoneOrders } from './phone-history';
import { summarizeHistory } from './phone-summary';
import type { SettingsWriter } from './rule-switches';
import { execute, systemBy, type By } from './service';

/** The order flag of an order whose number has terms (Order.flags; the team's screens show it, never the customer). */
export const REFUSER_FLAG = 'REPEAT_REFUSER';
/** The timeline type of the terms written on an order. */
export const REFUSER_EVENT = 'order.refuserTerms';
/** How many numbers the list shows (the most refusals first) and how many ended terms (the newest). */
const CANDIDATES_SHOWN = 100;
const ENDED_SHOWN = 50;

export interface RefuserCandidate {
  phone: string;
  refused: number;
  delivered: number;
  orders: number;
  lastAt: string | null;
  /** The number's terms now, when it has some. */
  termId: string | null;
  terms: RefuserTerms | null;
}

export interface RefuserTermRow {
  id: string;
  phone: string;
  terms: RefuserTerms;
  reason: string;
  refusedAtDecision: number;
  identity: boolean;
  decidedAt: string;
  decidedBy: string | null;
  endedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
}

export interface RefusersView {
  value: RiskRefusers;
  candidates: RefuserCandidate[];
  active: RefuserTermRow[];
  ended: RefuserTermRow[];
  /** The shortest and longest reason a person may give. */
  reasonLimits: { min: number; max: number };
}

const reasonSchema = z.string().trim().min(RISK_BLOCK_REASON_LIMITS.min).max(RISK_BLOCK_REASON_LIMITS.max);
export const termsInput = z.object({ phone: z.string().trim().min(1).max(40), terms: z.enum(REFUSER_TERMS), reason: reasonSchema }).strict();
export const endTermsInput = z.object({ reason: reasonSchema }).strict();
export const saveRefusersInput = z.object({ value: z.unknown() }).strict();

const e164 = (raw: string | null | undefined): string | null => {
  const p = raw ? phoneNormalizeBD(raw) : null;
  return p?.ok ? p.e164 : null;
};

/** The number's history in counts, as the phone history counts it (our-fault refusals and try-ons never count). */
async function countsOf(deps: OrdersDeps, storeId: number, phone: string) {
  const opts = await historyOptions(deps, storeId);
  const past = await phoneOrders(deps, storeId, phone, { take: opts.take });
  return summarizeHistory(past, { ourFault: opts.ourFault });
}

/** Numbers with at least `min` refused parcels (raw first, then counted as the history counts them), most first. */
async function candidatesOf(deps: OrdersDeps, storeId: number, min: number | null, active: Map<string, { id: string; terms: string }>): Promise<RefuserCandidate[]> {
  if (min === null) return [];
  const groups = await deps.db.order.groupBy({ by: ['phone'], where: { storeId, status: 'RETURNED', archivedAt: null, phone: { not: null } }, _count: { _all: true } });
  // one number may be stored in two forms (E.164 and 01…): add them up under the one form
  const raw = new Map<string, number>();
  for (const g of groups) {
    const p = e164(g.phone);
    if (p) raw.set(p, (raw.get(p) ?? 0) + g._count._all);
  }
  const likely = [...raw].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out: RefuserCandidate[] = [];
  for (const [phone] of likely) {
    if (out.length >= CANDIDATES_SHOWN) break;
    const s = await countsOf(deps, storeId, phone);
    if (s.refused < min) continue;
    const t = active.get(phone);
    out.push({ phone, refused: s.refused, delivered: s.delivered, orders: s.orders, lastAt: s.lastAt?.toISOString() ?? null, termId: t?.id ?? null, terms: (t?.terms as RefuserTerms | undefined) ?? null });
  }
  return out;
}

async function staffNames(deps: OrdersDeps, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  const rows = await deps.db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } });
  return new Map(rows.map((r) => [r.id, r.displayName]));
}

async function viewOf(deps: OrdersDeps, storeId: number): Promise<RefusersView> {
  const [value, active, ended] = await Promise.all([
    setting(deps, storeId, 'risk.refusers'),
    deps.db.refuserTerm.findMany({ where: { storeId, endedAt: null }, orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }] }),
    deps.db.refuserTerm.findMany({ where: { storeId, endedAt: { not: null } }, orderBy: [{ endedAt: 'desc' }, { id: 'desc' }], take: ENDED_SHOWN }),
  ]);
  const all = [...active, ...ended];
  const [names, candidates] = await Promise.all([
    staffNames(
      deps,
      all.flatMap((r) => [r.decidedById, r.endedById]),
    ),
    candidatesOf(deps, storeId, value.minRefused, new Map(active.map((r) => [r.phone, { id: r.id, terms: r.terms }]))),
  ]);
  const row = (r: (typeof all)[number]): RefuserTermRow => ({
    id: r.id,
    phone: r.phone,
    terms: r.terms as RefuserTerms,
    reason: r.reason,
    refusedAtDecision: r.refusedAtDecision,
    identity: !!r.clusterId,
    decidedAt: r.decidedAt.toISOString(),
    decidedBy: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
    endedAt: r.endedAt?.toISOString() ?? null,
    endedBy: r.endedById ? (names.get(r.endedById) ?? null) : null,
    endReason: r.endReason,
  });
  return { value, candidates, active: active.map(row), ended: ended.map(row), reasonLimits: { ...RISK_BLOCK_REASON_LIMITS } };
}

/** The list, the terms and the switch (`risk.rules.read`). */
export async function refusers(deps: OrdersDeps, who: Who): Promise<RefusersView> {
  await allow(deps, who, 'risk.rules.read');
  return viewOf(deps, who.storeId);
}

/** The identity of the number's newest order the graph has linked, when there is one. */
async function clusterOfPhone(tx: Prisma.TransactionClient, storeId: number, phone: string): Promise<string | null> {
  const orders = await tx.order.findMany({ where: { storeId, phone: { in: phoneForms(phone) } }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: 20, select: { id: true } });
  for (const o of orders) {
    const c = await clusterOfOrder(tx, storeId, o.id);
    if (c) return c;
  }
  return null;
}

/**
 * The owner's choice for one number (`risk.refuser.terms`), with a reason; the old terms, when any, end with the same
 * reason. The same terms again change nothing.
 */
export async function setRefuserTerms(deps: OrdersDeps, who: Who, input: unknown): Promise<RefusersView> {
  await allow(deps, who, 'risk.refuser.terms');
  const d = parse(termsInput, input, 'terms');
  const phone = e164(d.phone);
  if (!phone) throw new OrdersError('INVALID_INPUT', 'a Bangladeshi mobile number is needed', ['phone']);
  const now = nowOf(deps);
  const counts = await countsOf(deps, who.storeId, phone);
  const staffId = who.actor.staffUserId ?? null;
  const { row, before } = await deps.db.$transaction(async (tx) => {
    // one number at a time per shop, so two people choosing at the same moment leave one set of terms
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`refuser-terms:${who.storeId}:${phone}`}, 0))`;
    const old = await tx.refuserTerm.findFirst({ where: { storeId: who.storeId, phone, endedAt: null }, select: { id: true, terms: true } });
    if (old?.terms === d.terms) throw new OrdersError('NOTHING_CHANGED', 'the number has these terms already', ['terms']);
    if (old) await tx.refuserTerm.update({ where: { id: old.id }, data: { endedAt: now, endedById: staffId, endReason: d.reason } });
    const clusterId = await clusterOfPhone(tx, who.storeId, phone);
    const created = await tx.refuserTerm.create({ data: { storeId: who.storeId, phone, clusterId, terms: d.terms, reason: d.reason, refusedAtDecision: counts.refused, decidedById: staffId, decidedAt: now } });
    return { row: created, before: old };
  }, TX);
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.refuser.terms', entityType: 'RefuserTerm', entityId: row.id, before: before ? { id: before.id, terms: before.terms } : null, after: { phone, terms: d.terms, reason: d.reason, refused: counts.refused, identity: !!row.clusterId } }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}

/** Ends a number's terms with a reason (`risk.refuser.terms`); the row stays with who ended them, when and why. */
export async function endRefuserTerms(deps: OrdersDeps, who: Who, id: string, input: unknown): Promise<RefusersView> {
  await allow(deps, who, 'risk.refuser.terms');
  if (!UUID.test(id)) throw new OrdersError('NOT_FOUND', 'no such terms', ['id']);
  const d = parse(endTermsInput, input, 'end');
  const done = await deps.db.refuserTerm.updateMany({ where: { storeId: who.storeId, id, endedAt: null }, data: { endedAt: nowOf(deps), endedById: who.actor.staffUserId ?? null, endReason: d.reason } });
  if (!done.count) {
    const exists = await deps.db.refuserTerm.findFirst({ where: { storeId: who.storeId, id }, select: { id: true } });
    throw exists ? new OrdersError('NOTHING_CHANGED', 'these terms have ended already', ['id']) : new OrdersError('NOT_FOUND', 'no such terms', ['id']);
  }
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.refuser.end', entityType: 'RefuserTerm', entityId: id, before: { active: true }, after: { active: false, reason: d.reason } }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}

/** Saves the switch and the number of refusals that lists a number (`risk.rules.write`). */
export async function saveRefusers(deps: OrdersDeps & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<RefusersView> {
  await allow(deps, who, 'risk.rules.write');
  const value = parse(riskRefusersSchema, parse(saveRefusersInput, input, 'refusers').value, 'refusers');
  const before = await setting(deps, who.storeId, 'risk.refusers');
  if (JSON.stringify(before) !== JSON.stringify(value)) {
    try {
      await deps.settings.set('risk.refusers', value, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Risk rules › Repeat refusers' });
    } catch (e) {
      const details = (e as { details?: string[] }).details ?? [];
      throw new OrdersError('INVALID_INPUT', 'the repeat refuser settings could not be saved', details.length ? details : ['value']);
    }
    await audit(deps.db, who.actor, { storeId: who.storeId, action: 'risk.refusers.save', entityType: 'RiskRefusersSettings', entityId: String(who.storeId), before, after: value }, { source: 'admin-api', ...who.ctx });
  }
  return viewOf(deps, who.storeId);
}

export interface RefuserTermsApplied {
  termId: string;
  terms: Exclude<RefuserTerms, 'none'>;
  via: 'phone' | 'identity';
  /** The owner's auto option asked it right here (its answer), or a refusal code; null when the option is off. */
  auto: AdvanceRequestResult | string | null;
}

/**
 * The look-up the moment an order lands (switch on): the number's (or its identity's) terms are written on the order
 * once, as its advance proposal. Off, no terms, or "nothing": null. Never changes COD, cancels or tells the customer.
 */
export async function refuserTermsOnOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy('refusers')): Promise<RefuserTermsApplied | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.refusers');
  if (!cfg.enabled) return null;
  const order = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { phone: true } });
  if (!order) return null;
  const phone = e164(order.phone);
  const clusterId = await clusterOfOrder(deps.db, ref.storeId, ref.orderId);
  const family = clusterId ? await clusterFamily(deps.db, ref.storeId, clusterId) : [];
  const or: Prisma.RefuserTermWhereInput[] = [...(phone ? [{ phone }] : []), ...(family.length ? [{ clusterId: { in: family } }] : [])];
  if (!or.length) return null;
  // the number's own terms first, then the identity's newest
  const rows = await deps.db.refuserTerm.findMany({ where: { storeId: ref.storeId, endedAt: null, OR: or }, orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }] });
  const hit = rows.find((r) => r.phone === phone) ?? rows[0];
  if (!hit || hit.terms === 'none' || !(REFUSER_TERMS as readonly string[]).includes(hit.terms)) return null;
  const terms = hit.terms as Exclude<RefuserTerms, 'none'>;
  const via = phone && hit.phone === phone ? 'phone' : 'identity';
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'refuserTerms',
        input: { termId: hit.id },
        effect: async (tx, o) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = row.flags.includes(REFUSER_FLAG) ? row.flags : [...row.flags, REFUSER_FLAG];
          return {
            data: { flags },
            reasonCode: terms,
            // `ask` is what the order's "Request advance" proposes (advance-request.ts reads it)
            eventData: { termId: hit.id, terms, ask: terms, via, reason: hit.reason, refused: hit.refusedAtDecision, decidedAt: hit.decidedAt.toISOString() },
            audit: { before: { flags: row.flags }, after: { flags } },
          };
        },
      },
      { idempotencyKey: `refuser-terms:${ref.orderId}` },
    );
  } catch (e) {
    if (isOrdersError(e) && e.code === 'ILLEGAL_TRANSITION') return null;
    throw e;
  }
  const auto = await autoAdvance(deps, ref, terms, `refuser-advance:${ref.orderId}`, by);
  return { termId: hit.id, terms, via, auto };
}
