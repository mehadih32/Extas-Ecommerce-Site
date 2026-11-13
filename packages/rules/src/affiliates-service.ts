// S28 · PR 695 (CN-048; prototype v5 Marketing › Tools › Influencers & affiliates; gap M11, N4) — partners with a personal
// code. The code is the code of a coupon the owner made (the coupon gives the buyer the discount; this makes none). A
// partner earns commission only on a DELIVERED order that used the code, after the hold days; a returned parcel earns
// nothing. What is owed is earned less the append-only payout ledger (a correction is a negative row that names the row it
// reverses; nothing is edited or deleted). Seeing needs `rules.read`; adding, editing and pausing `rules.write`.
// The Pay action (`recordAffiliatePayout`) is OFF (`marketing.affiliates.payoutsOn`, owner decision 13 Nov item 7: not
// built) and, when the owner turns it on, needs the money key `payments.record`; each payout writes one cost line
// (CostEntry, service AFFILIATE) in the same transaction. Off as shipped: while `enabled` is false nothing is listed.
import { z } from 'zod';
import { requirePermission } from '@extas/auth';
import { allow, found, logChange, nowOf, parse, setting, type RulesDeps, type Who } from './context';
import { RulesError } from './errors';
import { affiliateInput, cleanAffiliateCode, fromBp, isAffiliateCode, standing, toBp, type Standing } from './affiliates-pure';

export interface AffiliateRow extends Standing {
  id: string;
  name: string;
  handle: string | null;
  platform: string | null;
  status: string;
  codes: { id: string; code: string; couponId: string | null }[];
  /** The partner's own percent, or the shop's default (`own` says which). */
  commissionPct: number;
  own: boolean;
}

export interface AffiliateBoard {
  enabled: boolean;
  payoutsOn: boolean;
  defaultPct: number;
  holdDays: number;
  currency: string;
  list: AffiliateRow[];
  payouts: { id: string; affiliateId: string; amountMinor: number; method: string; note: string | null; reversesId: string | null; createdAt: Date }[];
  totals: { dueMinor: number; paidMinor: number; earnedMinor: number };
}

async function rules(deps: RulesDeps, storeId: number) {
  const r = await setting(deps, storeId, 'marketing.affiliates');
  if (!r.enabled) throw new RulesError('AFFILIATE_OFF', 'affiliates are switched off');
  return r;
}

async function standingOf(deps: RulesDeps, storeId: number, a: { id: string; shareBp: number | null; codes: { code: string }[] }, def: { commissionPct: number; holdDays: number }) {
  const bp = a.shareBp ?? toBp(def.commissionPct);
  const codes = a.codes.map((c) => c.code);
  const [orders, pays] = await Promise.all([
    codes.length ? deps.db.order.findMany({ where: { storeId, couponCode: { in: codes } }, select: { status: true, deliveredAt: true, subtotalMinor: true, discountMinor: true } }) : Promise.resolve([]),
    deps.db.affiliatePayout.findMany({ where: { storeId, affiliateId: a.id }, select: { amountMinor: true } }),
  ]);
  return { bp, st: standing(orders, bp, def.holdDays, pays.map((p) => p.amountMinor), nowOf(deps)) };
}

/** The page: every partner with what was earned, held, paid and is owed, and the ledger. `rules.read`. Off: empty. */
export async function affiliateBoard(deps: RulesDeps, who: Who): Promise<AffiliateBoard> {
  await allow(deps, who, 'rules.read');
  const [r, currency] = await Promise.all([setting(deps, who.storeId, 'marketing.affiliates'), setting(deps, who.storeId, 'store.currency')]);
  const empty = { enabled: false, payoutsOn: r.payoutsOn, defaultPct: r.commissionPct, holdDays: r.holdDays, currency, list: [], payouts: [], totals: { dueMinor: 0, paidMinor: 0, earnedMinor: 0 } };
  if (!r.enabled) return empty;
  const rows = await deps.db.affiliate.findMany({ where: { storeId: who.storeId, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'asc' }, include: { codes: { orderBy: { createdAt: 'asc' } } } });
  const list: AffiliateRow[] = [];
  for (const a of rows) {
    const { bp, st } = await standingOf(deps, who.storeId, a, r);
    list.push({ id: a.id, name: a.name, handle: a.handle, platform: a.platform, status: a.status, codes: a.codes.map((c) => ({ id: c.id, code: c.code, couponId: c.couponId })), commissionPct: fromBp(bp), own: a.shareBp !== null, ...st });
  }
  const payouts = await deps.db.affiliatePayout.findMany({ where: { storeId: who.storeId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, affiliateId: true, amountMinor: true, method: true, note: true, reversesId: true, createdAt: true } });
  const sum = (k: 'dueMinor' | 'paidMinor' | 'earnedMinor') => list.reduce((s, x) => s + x[k], 0);
  return { ...empty, enabled: true, list, payouts, totals: { dueMinor: sum('dueMinor'), paidMinor: sum('paidMinor'), earnedMinor: sum('earnedMinor') } };
}

/** Adds a partner with a personal code. `rules.write`. The code must be free in this shop and, if a coupon is named, that coupon's. */
export async function addAffiliate(deps: RulesDeps, who: Who, input: unknown): Promise<{ id: string; code: string }> {
  await allow(deps, who, 'rules.write');
  await rules(deps, who.storeId);
  const b = parse(affiliateInput, input, 'partner');
  const code = cleanAffiliateCode(b.code);
  if (!isAffiliateCode(code)) throw new RulesError('INVALID_INPUT', 'the code is not valid', ['code']);
  if (b.couponId) {
    const c = await deps.db.coupon.findFirst({ where: { id: b.couponId, storeId: who.storeId }, select: { code: true } });
    if (!c || c.code.toUpperCase() !== code) throw new RulesError('INVALID_INPUT', 'the coupon is not this shop\'s or has another code', ['couponId']);
  }
  if (await deps.db.affiliateCode.findUnique({ where: { storeId_code: { storeId: who.storeId, code } }, select: { id: true } })) throw new RulesError('CODE_TAKEN', 'this code is already used', ['code']);
  return deps.db.$transaction(async (tx) => {
    const a = await tx.affiliate.create({
      data: { storeId: who.storeId, name: b.name, handle: b.handle ?? null, platform: b.platform ?? null, shareBp: b.commissionPct === undefined ? null : toBp(b.commissionPct), createdById: who.actor.staffUserId ?? null },
    });
    await tx.affiliateCode.create({ data: { storeId: who.storeId, affiliateId: a.id, code, couponId: b.couponId ?? null } });
    await logChange(tx, who, { action: 'affiliate.add', entityType: 'Affiliate', entityId: a.id, before: null, after: { name: b.name, code } });
    return { id: a.id, code };
  });
}

const statusInput = z.object({ id: z.string().uuid(), status: z.enum(['ON', 'PAUSED', 'ARCHIVED']) }).strict();

/** Pauses, resumes or archives a partner (never deleted). `rules.write`. A paused partner earns on no new code use; delivered orders keep their commission. */
export async function setAffiliateStatus(deps: RulesDeps, who: Who, input: unknown): Promise<void> {
  await allow(deps, who, 'rules.write');
  await rules(deps, who.storeId);
  const b = parse(statusInput, input, 'partner status');
  const a = found(await deps.db.affiliate.findFirst({ where: { id: b.id, storeId: who.storeId } }), 'partner');
  if (a.status === b.status) return;
  await deps.db.$transaction(async (tx) => {
    await tx.affiliate.update({ where: { id: a.id }, data: { status: b.status } });
    await logChange(tx, who, { action: 'affiliate.status', entityType: 'Affiliate', entityId: a.id, before: { status: a.status }, after: { status: b.status } });
  });
}

const payInput = z
  .object({ affiliateId: z.string().uuid(), amountMinor: z.number().int().positive(), method: z.string().trim().min(1).max(40), note: z.string().trim().max(300).optional() })
  .strict();

/**
 * Pay: one ledger row and one cost line. OFF as shipped (`payoutsOn`; owner decision: not built until the owner says so).
 * `payments.record` (money). Never more than is owed. A payout is never edited: `reverseAffiliatePayout` adds a negative row.
 */
export async function recordAffiliatePayout(deps: RulesDeps, who: Who, input: unknown): Promise<{ id: string }> {
  await requirePermission(deps.db, who.actor, 'payments.record', { storeId: who.storeId });
  const r = await rules(deps, who.storeId);
  if (!r.payoutsOn) throw new RulesError('PAYOUTS_OFF', 'paying partners is switched off');
  const b = parse(payInput, input, 'payout');
  const a = found(await deps.db.affiliate.findFirst({ where: { id: b.affiliateId, storeId: who.storeId }, include: { codes: true } }), 'partner');
  const { st } = await standingOf(deps, who.storeId, a, r);
  if (st.dueMinor <= 0) throw new RulesError('NOTHING_DUE', 'nothing is due to this partner');
  if (b.amountMinor > st.dueMinor) throw new RulesError('TOO_MUCH', 'more than is due', [`due:${st.dueMinor}`]);
  const currency = await setting(deps, who.storeId, 'store.currency');
  return deps.db.$transaction(async (tx) => {
    const cost = await tx.costEntry.create({
      data: { storeId: who.storeId, service: 'AFFILIATE', module: 'marketing', amountMinor: b.amountMinor, currency, refType: 'affiliate_payout', refId: a.id, detail: `${a.name} · ${b.method}`.slice(0, 200), source: 'affiliates', occurredAt: nowOf(deps) },
    });
    const p = await tx.affiliatePayout.create({ data: { storeId: who.storeId, affiliateId: a.id, amountMinor: b.amountMinor, method: b.method, note: b.note ?? null, costEntryId: cost.id, paidById: who.actor.staffUserId ?? null } });
    await logChange(tx, who, { action: 'affiliate.payout', entityType: 'AffiliatePayout', entityId: p.id, before: null, after: { affiliateId: a.id, amountMinor: b.amountMinor, method: b.method } });
    return { id: p.id };
  });
}

/** A correction: a negative ledger row that names the row it reverses (once). The cost line is reversed too. `payments.record`. */
export async function reverseAffiliatePayout(deps: RulesDeps, who: Who, id: string): Promise<{ id: string }> {
  await requirePermission(deps.db, who.actor, 'payments.record', { storeId: who.storeId });
  const r = await rules(deps, who.storeId);
  if (!r.payoutsOn) throw new RulesError('PAYOUTS_OFF', 'paying partners is switched off');
  const p = found(await deps.db.affiliatePayout.findFirst({ where: { id, storeId: who.storeId } }), 'payout');
  if (p.amountMinor <= 0 || (await deps.db.affiliatePayout.count({ where: { storeId: who.storeId, reversesId: p.id } })) > 0) throw new RulesError('CONFLICT', 'this payout cannot be reversed');
  const currency = await setting(deps, who.storeId, 'store.currency');
  return deps.db.$transaction(async (tx) => {
    const cost = await tx.costEntry.create({
      data: { storeId: who.storeId, service: 'AFFILIATE', module: 'marketing', amountMinor: -p.amountMinor, currency, refType: 'affiliate_payout', refId: p.affiliateId, detail: 'reversal', source: 'affiliates', occurredAt: nowOf(deps) },
    });
    const n = await tx.affiliatePayout.create({ data: { storeId: who.storeId, affiliateId: p.affiliateId, amountMinor: -p.amountMinor, method: p.method, reversesId: p.id, costEntryId: cost.id, paidById: who.actor.staffUserId ?? null } });
    await logChange(tx, who, { action: 'affiliate.payout.reverse', entityType: 'AffiliatePayout', entityId: n.id, before: { id: p.id }, after: { amountMinor: -p.amountMinor } });
    return { id: n.id };
  });
}
