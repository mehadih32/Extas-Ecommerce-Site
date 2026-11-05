// S13 · PR 273 (register "Referral programme"; SIM-F-009, the referral half) — Marketing › Referrals: the programme's
// settings card (switch, first and last day, the friend's offer = a Smart Rule that asks for a code, the sharer's wallet
// reward, the most rewards per customer, the code length), what it brought (codes, friends' orders, delivered, rewards
// given) and each friend's order with "Give reward". The friend's amount is the rule's; the sharer's reward is a wallet
// credit (`REFERRAL`, @extas/payments postWalletEntry), given once per order, only after the friend's order is delivered,
// by a person with the wallet permission (`payments.wallet`) after a confirm (CLAUDE.md rule 6). Switching the programme
// or changing it is the owner's OK (`rules.approve`). Off as it ships, no rule made, no amount set.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { postWalletEntry } from '@extas/payments';
import { referralProgrammeNow, unlocksWithCoupon, toRule } from '@extas/rules';
import { referralProgrammeSchema, storeTarget, type ReferralProgramme } from '@extas/settings';
import { moneyOf } from '@/components/admin/products/model';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from './ad-platforms';

const S = MOTHER_STORE_ID;
/** The friends' orders shown on the page, newest first (a page of the list). */
const USES_SHOWN = 100;

export class ReferralsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface ReferralsDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** The card shows the reward in whole currency units (taka), the setting keeps minor units: one minor unit = 1/unit. */
async function unitOf(deps: ReferralsDeps): Promise<number> {
  return 10 ** moneyOf(await deps.resolver.value('store.currency', { storeId: S }), 'en').digits;
}
/** The setting as the card shows it (reward in whole units). */
export const toScreen = (v: ReferralProgramme, unit: number) => ({ ...v, rewardMinor: v.rewardMinor === null ? null : v.rewardMinor / unit });

/** Why a friend's order cannot be rewarded now (null = it can). */
export type RewardBlock = 'NO_REWARD' | 'NOT_DELIVERED' | 'GIVEN' | 'CAP' | null;

export interface ReferralUseView {
  id: string;
  createdAt: string;
  code: string;
  sharer: { name: string | null; phone: string | null };
  order: { number: string; status: string; totalMinor: number; currency: string } | null;
  status: string;
  rewardMinor: number | null;
  rewardedAt: string | null;
  block: RewardBlock;
}

export interface ReferralsOverview {
  /** The settings card: the reward in whole units (taka); `version` is the stored value's. */
  card: { key: 'programme'; value: ReferralProgramme; version: string };
  /** The rules a friend's code can unlock (an offer that asks for a code), by key. */
  rules: { key: string; name: string; live: boolean }[];
  /** The programme runs now (switch, days, a live friend rule). */
  live: boolean;
  totals: { codes: number; uses: number; delivered: number; rewarded: number; rewardedMinor: number };
  uses: ReferralUseView[];
}

/** Can this friend's order be rewarded now? */
export function rewardBlock(p: Pick<ReferralProgramme, 'rewardMinor' | 'rewardsMax'>, use: { status: string }, orderStatus: string | null, sharerRewards: number): RewardBlock {
  if (use.status === 'REWARDED') return 'GIVEN';
  if (p.rewardMinor === null) return 'NO_REWARD';
  if (orderStatus !== 'DELIVERED') return 'NOT_DELIVERED';
  if (p.rewardsMax !== null && sharerRewards >= p.rewardsMax) return 'CAP';
  return null;
}

export async function referralsOverview(deps: ReferralsDeps): Promise<ReferralsOverview> {
  const settings = { db: deps.db, settings: deps.resolver, ...(deps.now ? { now: deps.now } : {}) };
  const [programme, now, ruleRows, codes, uses] = await Promise.all([
    deps.resolver.value('referrals.programme', { storeId: S }),
    referralProgrammeNow(settings, S),
    deps.db.smartRule.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { nameEn: 'asc' } }),
    deps.db.referral.count({ where: { storeId: S } }),
    deps.db.referralUse.findMany({ where: { storeId: S }, orderBy: { createdAt: 'desc' }, take: USES_SHOWN, include: { referral: { select: { code: true, referrerCustomerId: true } } } }),
  ]);
  const rules = ruleRows.flatMap((r) => {
    const rule = toRule(r);
    return rule && unlocksWithCoupon(rule) ? [{ key: r.key, name: r.nameEn, live: r.status === 'ACTIVE' }] : [];
  });
  const [orders, sharers, rewardedBy, all] = await Promise.all([
    deps.db.order.findMany({ where: { storeId: S, id: { in: uses.map((u) => u.orderId) } }, select: { id: true, number: true, status: true, totalMinor: true, currency: true } }),
    deps.db.customer.findMany({ where: { storeId: S, id: { in: [...new Set(uses.map((u) => u.referral.referrerCustomerId))] } }, select: { id: true, name: true, phone: true } }),
    deps.db.referralUse.groupBy({ by: ['referralId'], where: { storeId: S, status: 'REWARDED' }, _count: { _all: true } }),
    deps.db.referralUse.findMany({ where: { storeId: S }, select: { orderId: true, status: true, rewardMinor: true } }),
  ]);
  const orderOf = new Map(orders.map((o) => [o.id, o]));
  const sharerOf = new Map(sharers.map((c) => [c.id, c]));
  const rewardsOf = new Map(rewardedBy.map((g) => [g.referralId, g._count._all]));
  const delivered = await deps.db.order.count({ where: { storeId: S, status: 'DELIVERED', id: { in: all.map((u) => u.orderId) } } });
  const given = all.filter((u) => u.status === 'REWARDED');
  return {
    card: { key: 'programme', value: toScreen(programme, await unitOf(deps)), version: versionOf(programme) },
    rules,
    live: now.live,
    totals: { codes, uses: all.length, delivered, rewarded: given.length, rewardedMinor: given.reduce((a, u) => a + (u.rewardMinor ?? 0), 0) },
    uses: uses.map((u) => {
      const o = orderOf.get(u.orderId) ?? null;
      const c = sharerOf.get(u.referral.referrerCustomerId);
      return {
        id: u.id,
        createdAt: u.createdAt.toISOString(),
        code: u.referral.code,
        sharer: { name: c?.name ?? null, phone: c?.phone ?? null },
        order: o ? { number: o.number, status: o.status, totalMinor: o.totalMinor, currency: o.currency } : null,
        status: u.status,
        rewardMinor: u.rewardMinor,
        rewardedAt: u.rewardedAt?.toISOString() ?? null,
        block: rewardBlock(programme, u, o?.status ?? null, rewardsOf.get(u.referralId) ?? 0),
      };
    }),
  };
}

/** PUT {key: 'programme', value, version}: the programme's settings, the owner's OK (audited when they change). */
export async function saveReferralCard(deps: ReferralsDeps, who: AdPlatformsWho, input: unknown): Promise<ReferralsOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'programme') throw new ReferralsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('referrals.programme', { storeId: S });
  if (o.version !== versionOf(before)) throw new ReferralsError('STALE', 409);
  // an emptied number box comes as '' (FieldsCard): empty = none
  const raw = o.value && typeof o.value === 'object' ? { ...(o.value as Record<string, unknown>) } : {};
  for (const k of ['rewardMinor', 'rewardsMax', 'startsOn', 'endsOn'] as const) if (raw[k] === '') raw[k] = null;
  const unit = await unitOf(deps);
  if (typeof raw.rewardMinor === 'number') raw.rewardMinor = Math.round(raw.rewardMinor * unit);
  const ok = referralProgrammeSchema.safeParse(raw);
  if (!ok.success) throw new ReferralsError('INVALID_INPUT', 400, ok.error.issues.map((i) => i.path.join('.') || 'value'));
  if (ok.data.friendRuleKey) {
    const r = await deps.db.smartRule.findFirst({ where: { storeId: S, key: ok.data.friendRuleKey, archivedAt: null } });
    const rule = r ? toRule(r) : null;
    if (!rule || !unlocksWithCoupon(rule)) throw new ReferralsError('INVALID_INPUT', 400, ['friendRuleKey']);
  }
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('referrals.programme', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Referrals' });
    await audit(deps.db, who.actor, { storeId: S, action: 'referrals.settings', entityType: 'Setting', entityId: 'referrals.programme', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'programme', value: toScreen(ok.data, unit), version: versionOf(ok.data) };
}

/**
 * POST {action: 'reward', id, confirm: true}: gives the sharer his reward for one delivered friend's order — a wallet
 * credit of the programme's amount, once per order (claimed first, so two presses cannot pay twice), audited.
 */
export async function giveReferralReward(deps: ReferralsDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string; rewardMinor: number; walletEntryId: string }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (typeof o.id !== 'string') throw new ReferralsError('INVALID_INPUT', 400, ['id']);
  if (o.confirm !== true) throw new ReferralsError('CONFIRM_REQUIRED', 400, ['confirm']);
  const programme = await deps.resolver.value('referrals.programme', { storeId: S });
  const use = await deps.db.referralUse.findFirst({ where: { id: o.id, storeId: S }, include: { referral: { select: { id: true, code: true, referrerCustomerId: true } } } });
  if (!use) throw new ReferralsError('NOT_FOUND', 404);
  const order = await deps.db.order.findFirst({ where: { id: use.orderId, storeId: S }, select: { number: true, status: true } });
  const given = await deps.db.referralUse.count({ where: { referralId: use.referralId, status: 'REWARDED' } });
  const block = rewardBlock(programme, use, order?.status ?? null, given);
  if (block) throw new ReferralsError(block, 409);
  const amountMinor = programme.rewardMinor!;
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const claimed = await tx.referralUse.updateMany({ where: { id: use.id, status: 'PENDING' }, data: { status: 'REWARDED', rewardMinor: amountMinor, rewardedAt: now, rewardedById: who.actor.staffUserId ?? null } });
    if (claimed.count !== 1) throw new ReferralsError('GIVEN', 409);
    const e = await postWalletEntry(tx, { storeId: S, customerId: use.referral.referrerCustomerId, direction: 'CREDIT', amountMinor, reason: 'REFERRAL', idempotencyKey: `referral:${use.id}`, note: `Invite ${use.referral.code} · order #${order!.number}`, actorId: who.actor.staffUserId ?? null });
    await tx.referralUse.update({ where: { id: use.id }, data: { walletEntryId: e.entryId } });
    await audit(tx as never, who.actor, { storeId: S, action: 'referrals.reward', entityType: 'ReferralUse', entityId: use.id, after: { amountMinor, customerId: use.referral.referrerCustomerId, orderNumber: order!.number, walletEntryId: e.entryId } }, who.ctx);
    return { id: use.id, rewardMinor: amountMinor, walletEntryId: e.entryId };
  });
}

const answer = (e: unknown): Response => (e instanceof ReferralsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/referrals — GET the page (`marketing.campaigns.read`); PUT the programme card (`rules.approve`,
 * the owner's OK); POST {action: 'reward', id, confirm} (`payments.wallet`).
 */
export async function referralsHandler(request: Request, deps: AdminDeps | null, extra: Partial<ReferralsDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.campaigns.read' : method === 'PUT' ? 'rules.approve' : 'payments.wallet';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: ReferralsDeps = { db: deps!.db, resolver: deps!.resolver, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const o = await referralsOverview(d);
      return json({ ok: true, ...o, cards: { programme: o.card } });
    }
    if (method === 'PUT') return json({ ok: true, cards: { programme: await saveReferralCard(d, who, b) } });
    if (b.action === 'reward') return json({ ok: true, reward: await giveReferralReward(d, who, b) });
    throw new ReferralsError('INVALID_INPUT', 400, ['action']);
  } catch (e) {
    return answer(e);
  }
}
