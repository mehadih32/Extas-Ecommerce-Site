// S28 · PR 677 (CN-048, admin prototype v5, Rules › Offers & discounts) — Offers & Discounts 360, a facade over the engines that
// are already built. The owner makes an offer in seven steps (Type, Value, Where, Who, When, Limits, Preview); the offer is kept in
// `Offer` and, once it is live, carried by what the shop already has:
//   - a percent, a flat taka amount or free delivery on any order → a Smart Rule (and a coupon when the offer has a code);
//   - the same three "for paying online" → the `checkout.prepaidReward.*` settings (the online-payment reward);
//   - points and wallet credit are kept as offers and can be sent for the owner's OK, but they cannot go live until the award job
//     exists (they answer OFFER_ENGINE_PENDING); nothing is promised to a customer that nothing pays.
// Nothing here changes a price by itself: an offer goes live only through the owner's OK (`rules.approve`; the admin API also asks
// for the PIN) and every step is a line in the offer's history. A live offer is paused or ended, never deleted.
import { Prisma } from '@extas/db/client';
import { storeTarget } from '@extas/settings';
import { z } from 'zod';
import {
  offerInputSchema,
  offerIssues,
  offerLimitsSchema,
  offerScopeSchema,
  offerValueSchema,
  offerWhoSchema,
  type OfferIssue,
  type OfferKindName,
  type OfferStateName,
} from './offers-model';
import { allow, found, holds, logChange, nowOf, parse, setting, type RulesDeps, type SettingsReader, type Who } from './context';
import type { SettingsWriter } from './eid-service';
import { RulesError } from './errors';
import type { RuleContent } from './pure';
import { blankContent } from './templates';
import { createCoupon, setCouponEnabled } from './coupons-service';
import { createRule, publishRule, saveDraft, setRuleStatus } from './rules-service';

/** What a code with no orders shows. */
const EMPTY_TALLY = { orders: 0, salesMinor: 0, discountMinor: 0, deliveredMinor: 0, returned: 0 }; // hardcode-ok: an empty tally, not a business number

export * from './offers-model';

export interface OfferDeps extends RulesDeps {
  settings: SettingsReader & SettingsWriter;
}

const tokenText = (en: string, bn: string) => ({ en, bn });

/** The Smart Rule that carries a percent, flat or free-delivery offer (a draft with the offer's own values). */
export function ruleContentFor(
  o: {
    id: string;
    kind: OfferKindName;
    nameEn: string;
    nameBn?: string | null;
    value: z.output<typeof offerValueSchema>;
    scope: z.output<typeof offerScopeSchema>;
    code: string | null;
    startsAt: string | null;
    endsAt: string | null;
    limits: z.output<typeof offerLimitsSchema>;
  },
  placements: readonly string[],
): RuleContent {
  const withCode = !!o.code;
  const key = `offer-${o.id.slice(0, 8)}`;
  const kind = o.kind === 'FREE_DELIVERY' && !withCode ? 'delivery' : 'discount';
  const base = blankContent(key, kind, o.nameEn);
  const params: RuleContent['params'] = [];
  const actions: RuleContent['actions'] = [];
  const min = o.limits.minOrderMinor ?? null;
  let short: ReturnType<typeof tokenText>;
  let full: ReturnType<typeof tokenText>;
  if (o.kind === 'PERCENT') {
    params.push({ key: 'percentOff', type: 'percent', value: o.value.percent ?? null, labelEn: 'Discount (%)', labelBn: 'ছাড় (%)' });
    if (min) params.push({ key: 'minOrder', type: 'money', value: min, labelEn: 'Smallest order', labelBn: 'সবচেয়ে ছোট অর্ডার' });
    if (o.value.maxMinor) params.push({ key: 'maxOff', type: 'money', value: o.value.maxMinor, labelEn: 'Largest discount', labelBn: 'সর্বোচ্চ ছাড়' });
    actions.push({
      type: 'discount',
      mode: 'percent',
      param: 'percentOff',
      target: o.scope.type === 'all' ? 'order' : 'lines',
      ...(o.value.maxMinor ? { maxParam: 'maxOff' } : {}),
      ...(min ? { minSubtotalParam: 'minOrder' } : {}),
      requiresCoupon: withCode,
      showWas: false,
    });
    short = tokenText('{percentOff} off', '{percentOff} ছাড়');
    full = tokenText('{percentOff} off the price.', 'দামে {percentOff} ছাড়।');
  } else if (o.kind === 'FLAT') {
    params.push({ key: 'amountOff', type: 'money', value: o.value.amountMinor ?? null, labelEn: 'Amount off', labelBn: 'কত টাকা ছাড়' });
    if (min) params.push({ key: 'minOrder', type: 'money', value: min, labelEn: 'Smallest order', labelBn: 'সবচেয়ে ছোট অর্ডার' });
    actions.push({ type: 'discount', mode: 'amount', param: 'amountOff', target: 'order', ...(min ? { minSubtotalParam: 'minOrder' } : {}), requiresCoupon: withCode, showWas: false });
    short = tokenText('{amountOff} off', '{amountOff} ছাড়');
    full = tokenText('{amountOff} off your order.', 'অর্ডারে {amountOff} ছাড়।');
  } else {
    if (min && !withCode) {
      params.push({ key: 'minOrder', type: 'money', value: min, labelEn: 'Free delivery from', labelBn: 'এর বেশি হলে ডেলিভারি ফ্রি' });
      actions.push({ type: 'freeDeliveryOver', param: 'minOrder' });
      short = tokenText('Free delivery over {minOrder}', '{minOrder}-এর বেশিতে ডেলিভারি ফ্রি');
      full = tokenText('Free delivery on orders over {minOrder}.', '{minOrder}-এর বেশি অর্ডারে ডেলিভারি ফ্রি।');
    } else {
      actions.push({ type: 'freeDelivery', requiresCoupon: withCode });
      short = tokenText('Free delivery', 'ডেলিভারি ফ্রি');
      full = tokenText('The delivery is free.', 'ডেলিভারি ফ্রি।');
    }
  }
  const scope = o.scope.type === 'all' ? { include: [{ type: 'all' as const }], exclude: [] } : { include: [o.scope], exclude: [] };
  return {
    ...base,
    ...(o.nameBn ? { nameBn: o.nameBn } : {}),
    text: { short, full, ...(kind === 'discount' ? { badge: short } : {}) },
    params,
    scope,
    actions,
    placements: [...placements],
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    status: 'ACTIVE',
  };
}

// ------------------------------------------------------------------------------------------------ views

export interface OfferView {
  id: string;
  kind: OfferKindName;
  trigger: 'ANY' | 'PAY_ONLINE';
  state: OfferStateName;
  nameEn: string;
  nameBn: string | null;
  value: z.output<typeof offerValueSchema>;
  scope: z.output<typeof offerScopeSchema>;
  who: z.output<typeof offerWhoSchema>;
  code: string | null;
  startsAt: string | null;
  endsAt: string | null;
  limits: z.output<typeof offerLimitsSchema>;
  ruleId: string | null;
  couponId: string | null;
  approvedAt: string | null;
  createdAt: string;
  issues: OfferIssue[];
}

type OfferRow = Prisma.OfferGetPayload<object>;

const asView = (r: OfferRow): OfferView => {
  const o = {
    id: r.id,
    kind: r.kind as OfferKindName,
    trigger: (r.trigger === 'PAY_ONLINE' ? 'PAY_ONLINE' : 'ANY') as 'ANY' | 'PAY_ONLINE',
    state: r.state as OfferStateName,
    nameEn: r.nameEn,
    nameBn: r.nameBn,
    value: r.value as OfferView['value'],
    scope: r.scope as OfferView['scope'],
    who: r.who as OfferView['who'],
    code: r.code,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    limits: r.limits as OfferView['limits'],
    ruleId: r.ruleId,
    couponId: r.couponId,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
  return { ...o, issues: offerIssues(o) };
};

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function event(tx: Prisma.TransactionClient, who: Who, offerId: string, action: string, note?: string | null) {
  await tx.offerEvent.create({ data: { storeId: who.storeId, offerId, action, actorId: who.actor.staffUserId ?? null, note: note ?? null } });
}

async function rowOf(deps: RulesDeps, who: Who, id: string): Promise<OfferRow> {
  return found(await deps.db.offer.findFirst({ where: { id, storeId: who.storeId } }), 'offer');
}

const codeOf = (c: string | null | undefined) => (c && c.trim() ? c.trim().toUpperCase() : null);

export async function listOfferRows(deps: RulesDeps, who: Who): Promise<OfferView[]> {
  await allow(deps, who, 'rules.read');
  return (await deps.db.offer.findMany({ where: { storeId: who.storeId }, orderBy: { createdAt: 'desc' }, take: 500 })).map(asView);
}

export async function getOffer(deps: RulesDeps, who: Who, id: string): Promise<{ offer: OfferView; history: { action: string; at: string; note: string | null }[] }> {
  await allow(deps, who, 'rules.read');
  const r = await rowOf(deps, who, id);
  const ev = await deps.db.offerEvent.findMany({ where: { offerId: id }, orderBy: { createdAt: 'asc' }, select: { action: true, createdAt: true, note: true } });
  return { offer: asView(r), history: ev.map((e) => ({ action: e.action, at: e.createdAt.toISOString(), note: e.note })) };
}

/** Saves a new offer as a draft (`rules.write`). Money-moving checks come at the step that sends it for the owner's OK. */
export async function createOffer(deps: RulesDeps, who: Who, input: unknown): Promise<OfferView> {
  await allow(deps, who, 'rules.write');
  const b = parse(offerInputSchema, input, 'offer');
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.offer.create({
      data: {
        storeId: who.storeId,
        kind: b.kind,
        trigger: b.trigger,
        state: 'DRAFT',
        nameEn: b.nameEn,
        nameBn: b.nameBn ?? null,
        value: json(b.value),
        scope: json(b.scope),
        who: json(b.who),
        code: codeOf(b.code),
        startsAt: b.startsAt ? new Date(b.startsAt) : null,
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        limits: json(b.limits),
        createdById: who.actor.staffUserId ?? null,
      },
    });
    await event(tx, who, r.id, 'CREATED');
    await logChange(tx, who, { action: 'offer.create', entityType: 'Offer', entityId: r.id, before: null, after: { kind: b.kind, nameEn: b.nameEn } });
    return r;
  });
  return asView(row);
}

/** Changes a draft (a offer sent for the owner's OK goes back to a draft first: `sendBack`). */
export async function updateOffer(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<OfferView> {
  await allow(deps, who, 'rules.write');
  const b = parse(offerInputSchema, input, 'offer');
  const cur = await rowOf(deps, who, id);
  if (cur.state !== 'DRAFT') throw new RulesError('CONFLICT', 'only a draft can be changed; send it back or pause it first', [cur.state]);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.offer.update({
      where: { id },
      data: {
        kind: b.kind,
        trigger: b.trigger,
        nameEn: b.nameEn,
        nameBn: b.nameBn ?? null,
        value: json(b.value),
        scope: json(b.scope),
        who: json(b.who),
        code: codeOf(b.code),
        startsAt: b.startsAt ? new Date(b.startsAt) : null,
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        limits: json(b.limits),
      },
    });
    await event(tx, who, id, 'EDITED');
    await logChange(tx, who, { action: 'offer.edit', entityType: 'Offer', entityId: id, before: asView(cur), after: asView(r) });
    return r;
  });
  return asView(row);
}

/** Sends the draft for the owner's OK (`rules.write`). Every check that can be made now is made now. */
export async function submitOffer(deps: RulesDeps, who: Who, id: string): Promise<OfferView> {
  await allow(deps, who, 'rules.write');
  const cur = await rowOf(deps, who, id);
  if (cur.state !== 'DRAFT') throw new RulesError('CONFLICT', 'only a draft can be sent', [cur.state]);
  const issues = asView(cur).issues;
  if (issues.length) throw new RulesError('OFFER_INVALID', 'the offer cannot be sent as it is', issues);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.offer.update({ where: { id }, data: { state: 'AWAITING_OK' } });
    await event(tx, who, id, 'SUBMITTED');
    await logChange(tx, who, { action: 'offer.submit', entityType: 'Offer', entityId: id, before: { state: cur.state }, after: { state: 'AWAITING_OK' } });
    return r;
  });
  return asView(row);
}

/** The owner sends it back for a change, with a note (`rules.approve`). */
export async function sendBackOffer(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<OfferView> {
  await allow(deps, who, 'rules.read');
  if (!(await holds(deps, who, 'rules.approve'))) throw new RulesError('OWNER_OK_REQUIRED', "only the owner's OK can send an offer back");
  const { note } = parse(z.object({ note: z.string().trim().max(500).optional() }).strict(), input, 'note');
  const cur = await rowOf(deps, who, id);
  if (cur.state !== 'AWAITING_OK') throw new RulesError('CONFLICT', 'the offer is not waiting for the OK', [cur.state]);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.offer.update({ where: { id }, data: { state: 'DRAFT' } });
    await event(tx, who, id, 'SENT_BACK', note);
    await logChange(tx, who, { action: 'offer.sendBack', entityType: 'Offer', entityId: id, before: { state: cur.state }, after: { state: 'DRAFT' } });
    return r;
  });
  return asView(row);
}

const PR = {
  enabled: 'checkout.prepaidReward.enabled',
  type: 'checkout.prepaidReward.type',
  amount: 'checkout.prepaidReward.amountMinor',
  percent: 'checkout.prepaidReward.percent',
  max: 'checkout.prepaidReward.maxMinor',
} as const;
type AnySet = { set(key: string, value: unknown, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null; ownerApproved?: boolean }): Promise<unknown> };
const anySet = (deps: OfferDeps) => deps.settings as unknown as AnySet;
const anyValue = (deps: OfferDeps, key: string, storeId: number) => (deps.settings as unknown as { value(k: string, o: { storeId: number }): Promise<unknown> }).value(key, { storeId });

async function writeReward(deps: OfferDeps, who: Who, v: Record<keyof typeof PR, unknown>, reason: string) {
  for (const [k, key] of Object.entries(PR)) await anySet(deps).set(key, v[k as keyof typeof PR], storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason, ownerApproved: true });
}

/**
 * Makes it live (`rules.approve` = the owner's OK; the admin API asks for the PIN before calling this). A percent, flat or free
 * delivery offer creates its Smart Rule (and coupon) and switches them on; the online-payment reward writes the reward settings.
 */
export async function approveOffer(deps: OfferDeps, who: Who, id: string): Promise<OfferView> {
  await allow(deps, who, 'rules.read');
  if (!(await holds(deps, who, 'rules.approve'))) throw new RulesError('OWNER_OK_REQUIRED', "an offer changes what customers pay: it needs the owner's OK");
  const cur = await rowOf(deps, who, id);
  if (cur.state !== 'AWAITING_OK') throw new RulesError('CONFLICT', 'the offer is not waiting for the OK', [cur.state]);
  const v = asView(cur);
  if (v.issues.length) throw new RulesError('OFFER_INVALID', 'the offer cannot go live as it is', v.issues);
  let ruleId: string | null = null;
  let couponId: string | null = null;
  if (v.trigger === 'PAY_ONLINE') {
    const taken = await deps.db.offer.findFirst({ where: { storeId: who.storeId, trigger: 'PAY_ONLINE', state: 'LIVE', NOT: { id } }, select: { id: true } });
    if (taken || (await anyValue(deps, PR.enabled, who.storeId)) === true) throw new RulesError('OFFER_INVALID', 'a reward for paying online is already on', ['ONLINE_REWARD_TAKEN']);
    await writeReward(
      deps,
      who,
      {
        enabled: true,
        type: v.kind === 'FREE_DELIVERY' ? 'freeDelivery' : v.kind === 'FLAT' ? 'amount' : 'percent',
        amount: v.kind === 'FLAT' ? v.value.amountMinor : null,
        percent: v.kind === 'PERCENT' ? v.value.percent : null,
        max: v.kind === 'PERCENT' ? (v.value.maxMinor ?? null) : null,
      },
      `Offer: ${v.nameEn}`,
    );
  } else {
    const placements = (await setting(deps, who.storeId, 'rules.placements')).map((p) => p.key);
    const content = ruleContentFor({ ...v, code: v.code }, placements);
    const rule = await createRule(deps, who, { key: content.key, kind: content.kind, nameEn: content.nameEn });
    ruleId = rule.id;
    await saveDraft(deps, who, rule.id, { content });
    await publishRule(deps, who, rule.id, { changeNote: `Offer ${v.nameEn}` });
    if (v.code) {
      const c = await createCoupon(deps, who, {
        code: v.code,
        ruleId,
        usageLimit: v.limits.usageLimit,
        perCustomerLimit: v.limits.perCustomerLimit,
        audience: v.who.firstOrderOnly ? 'FIRST_ORDER' : v.who.audience,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
      });
      couponId = c.id;
      await setCouponEnabled(deps, who, c.id, { enabled: true });
    }
  }
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.offer.update({ where: { id }, data: { state: 'LIVE', ruleId, couponId, approvedById: who.actor.staffUserId ?? null, approvedAt: nowOf(deps) } });
    await event(tx, who, id, 'APPROVED');
    await logChange(tx, who, { action: 'offer.approve', entityType: 'Offer', entityId: id, before: { state: cur.state }, after: { state: 'LIVE', ruleId, couponId, ownerOk: true } });
    return r;
  });
  return asView(row);
}

/** Pauses a live offer, brings a paused one back, or ends it for good (an ended offer stays in the history). */
export async function setOfferState(deps: OfferDeps, who: Who, id: string, input: unknown): Promise<OfferView> {
  await allow(deps, who, 'rules.read');
  if (!(await holds(deps, who, 'rules.approve'))) throw new RulesError('OWNER_OK_REQUIRED', "this changes what customers pay: it needs the owner's OK");
  const { action } = parse(z.object({ action: z.enum(['pause', 'resume', 'end']) }).strict(), input, 'action');
  const cur = await rowOf(deps, who, id);
  const from = cur.state;
  const allowed: Record<string, OfferStateName[]> = { pause: ['LIVE'], resume: ['PAUSED'], end: ['LIVE', 'PAUSED'] };
  if (!allowed[action]!.includes(from as OfferStateName)) throw new RulesError('CONFLICT', `an offer that is ${from} cannot be ${action}d`, [from]);
  const to: OfferStateName = action === 'pause' ? 'PAUSED' : action === 'resume' ? 'LIVE' : 'ENDED';
  const on = to === 'LIVE';
  if (cur.trigger === 'PAY_ONLINE') {
    if (on) {
      if ((await anyValue(deps, PR.enabled, who.storeId)) === true) throw new RulesError('OFFER_INVALID', 'a reward for paying online is already on', ['ONLINE_REWARD_TAKEN']);
      await anySet(deps).set(PR.enabled, true, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: `Offer resumed: ${cur.nameEn}`, ownerApproved: true });
    } else await anySet(deps).set(PR.enabled, false, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: `Offer ${action}: ${cur.nameEn}`, ownerApproved: true });
  } else {
    if (cur.couponId) await setCouponEnabled(deps, who, cur.couponId, { enabled: on });
    if (cur.ruleId) await setRuleStatus(deps, who, cur.ruleId, { status: on ? 'ACTIVE' : to === 'ENDED' ? 'ENDED' : 'PAUSED', changeNote: `Offer ${action}` });
  }
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.offer.update({ where: { id }, data: { state: to } });
    await event(tx, who, id, action === 'pause' ? 'PAUSED' : action === 'resume' ? 'RESUMED' : 'ENDED');
    await logChange(tx, who, { action: `offer.${action}`, entityType: 'Offer', entityId: id, before: { state: from }, after: { state: to, ownerOk: true } });
    return r;
  });
  return asView(row);
}

// ------------------------------------------------------------------------------------------------ the one list

export interface OfferResults {
  orders: number;
  salesMinor: number;
  discountMinor: number;
  deliveredMinor: number;
  returned: number;
}

export type OfferSource = 'offer' | 'coupon' | 'rule' | 'reward' | 'points' | 'wallet';

export interface OfferListRow {
  /** `offer:<id>`, `coupon:<id>`, `rule:<id>` or the engine's name. */
  id: string;
  source: OfferSource;
  offerId: string | null;
  kind: OfferKindName | null;
  nameEn: string;
  nameBn: string | null;
  code: string | null;
  state: OfferStateName | 'SCHEDULED';
  startsAt: string | null;
  endsAt: string | null;
  /** Counted from the orders that used the code; null when the offer has no code to count by. */
  results: OfferResults | null;
  /** Where the rest of this one is set (a built-in engine's own page). */
  href: string | null;
}

export interface OffersScreen {
  rows: OfferListRow[];
  /** The latest ends first; what is waiting for the owner. */
  awaiting: number;
  /** Money given by every code in the last 30 days and orders with a code. */
  discount30: { discountMinor: number; orders: number };
}

async function resultsByCode(deps: RulesDeps, storeId: number, codes: string[]): Promise<Map<string, OfferResults>> {
  const out = new Map<string, OfferResults>();
  if (!codes.length) return out;
  const orders = await deps.db.order.findMany({
    where: { storeId, couponCode: { in: codes }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    select: { couponCode: true, totalMinor: true, discountMinor: true, status: true },
  });
  for (const o of orders) {
    const r = out.get(o.couponCode!) ?? EMPTY_TALLY;
    r.orders += 1;
    r.salesMinor += o.totalMinor;
    r.discountMinor += o.discountMinor;
    if (o.status === 'DELIVERED' || o.status === 'PARTIALLY_DELIVERED') r.deliveredMinor += o.totalMinor;
    if (o.status === 'RETURNED') r.returned += 1;
    out.set(o.couponCode!, r);
  }
  return out;
}

/** Offers, coupons, built-in price rules, the online-payment reward, points and wallet in one list (`rules.read`). */
export async function offersScreen(deps: OfferDeps, who: Who): Promise<OffersScreen> {
  await allow(deps, who, 'rules.read');
  const now = nowOf(deps);
  const [offers, coupons, rules] = await Promise.all([
    deps.db.offer.findMany({ where: { storeId: who.storeId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    deps.db.coupon.findMany({ where: { storeId: who.storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 500 }),
    deps.db.smartRule.findMany({ where: { storeId: who.storeId, archivedAt: null, kind: { in: ['discount', 'setTier'] } }, orderBy: { updatedAt: 'desc' }, take: 200 }),
  ]);
  const codes = [...new Set([...offers.map((o) => o.code), ...coupons.map((c) => c.code)].filter((c): c is string => !!c))];
  const results = await resultsByCode(deps, who.storeId, codes);
  const rows: OfferListRow[] = [];
  const linkedCoupons = new Set(offers.map((o) => o.couponId).filter(Boolean));
  const linkedRules = new Set(offers.map((o) => o.ruleId).filter(Boolean));
  for (const o of offers) {
    const v = asView(o);
    rows.push({
      id: `offer:${o.id}`,
      source: 'offer',
      offerId: o.id,
      kind: v.kind,
      nameEn: o.nameEn,
      nameBn: o.nameBn,
      code: o.code,
      state: v.state === 'LIVE' && o.startsAt && o.startsAt > now ? 'SCHEDULED' : v.state,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      results: o.code ? (results.get(o.code) ?? EMPTY_TALLY) : null,
      href: null,
    });
  }
  for (const c of coupons) {
    if (linkedCoupons.has(c.id)) continue;
    const state: OfferListRow['state'] = !c.enabled ? 'PAUSED' : c.endsAt && c.endsAt < now ? 'ENDED' : c.startsAt && c.startsAt > now ? 'SCHEDULED' : 'LIVE';
    rows.push({
      id: `coupon:${c.id}`,
      source: 'coupon',
      offerId: null,
      kind: null,
      nameEn: c.code,
      nameBn: null,
      code: c.code,
      state,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      results: results.get(c.code) ?? EMPTY_TALLY,
      href: '/admin/rules/smart',
    });
  }
  for (const r of rules) {
    if (linkedRules.has(r.id)) continue;
    const live = r.status === 'ACTIVE' && !(r.startsAt && r.startsAt > now) && !(r.endsAt && r.endsAt < now);
    const state: OfferListRow['state'] = live ? 'LIVE' : r.status === 'ENDED' ? 'ENDED' : r.startsAt && r.startsAt > now ? 'SCHEDULED' : 'PAUSED';
    rows.push({
      id: `rule:${r.id}`,
      source: 'rule',
      offerId: null,
      kind: null,
      nameEn: r.nameEn,
      nameBn: r.nameBn,
      code: null,
      state,
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      results: null,
      href: `/admin/rules/smart?rule=${r.id}`,
    });
  }
  const st = deps.settings as unknown as { value(k: string, o: { storeId: number }): Promise<unknown> };
  const liveOnline = offers.some((o) => o.trigger === 'PAY_ONLINE' && o.state === 'LIVE');
  if (!liveOnline && (await st.value(PR.enabled, { storeId: who.storeId })) === true)
    rows.push({
      id: 'reward',
      source: 'reward',
      offerId: null,
      kind: null,
      nameEn: 'Reward for paying online',
      nameBn: 'অনলাইনে পেমেন্টের পুরস্কার',
      code: null,
      state: 'LIVE',
      startsAt: null,
      endsAt: null,
      results: null,
      href: null,
    });
  const points = (await st.value('customers.points', { storeId: who.storeId })) as { enabled?: boolean } | null;
  rows.push({
    id: 'points',
    source: 'points',
    offerId: null,
    kind: null,
    nameEn: 'Points',
    nameBn: 'পয়েন্ট',
    code: null,
    state: points?.enabled ? 'LIVE' : 'PAUSED',
    startsAt: null,
    endsAt: null,
    results: null,
    href: '/admin/customers/loyalty',
  });
  const wallet = (await st.value('checkout.wallet.enabled', { storeId: who.storeId })) as boolean | null;
  rows.push({
    id: 'wallet',
    source: 'wallet',
    offerId: null,
    kind: null,
    nameEn: 'Wallet credit',
    nameBn: 'ওয়ালেট ক্রেডিট',
    code: null,
    state: wallet ? 'LIVE' : 'PAUSED',
    startsAt: null,
    endsAt: null,
    results: null,
    href: '/admin/customers/loyalty',
  });
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const agg = await deps.db.order.aggregate({
    where: { storeId: who.storeId, couponCode: { not: null }, placedAt: { gte: since }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    _sum: { discountMinor: true },
    _count: { _all: true },
  });
  return { rows, awaiting: offers.filter((o) => o.state === 'AWAITING_OK').length, discount30: { discountMinor: agg._sum.discountMinor ?? 0, orders: agg._count._all } };
}
