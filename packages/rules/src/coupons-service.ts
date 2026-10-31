// PR 213 — coupons. A coupon is a code that unlocks one discount rule that asks for a coupon (`requiresCoupon`): the
// amount, the smallest order and the cap are the rule's values, so they are versioned, previewed and simulated with
// it. The coupon itself holds only the code, its window, its limits (uses in all, uses per customer) and who may use it
// (`audience`: everybody, guests only or signed-in members only; S04 PR 112, CN-018 answer 9, SIM-F-009). PR 213
// follow-up (go-live gate SIM-F-050): "first order only", checked on his order history by phone number (and account), so
// a repeat buyer who is not logged in no longer passes as new; "guests only" now says only what it checks (not logged in).
// A coupon is made off. Switching it on or off changes what customers pay: that needs the owner's OK (`rules.approve`,
// CLAUDE.md rule 6). Redeeming is part of placing an order (S04 calls `redeemCoupon` inside its transaction): the use
// count can never pass the limit, even with two orders at the same moment, and one order redeems a coupon once.
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, found, holds, logChange, nowOf, parse, setting, type Db, type RulesDeps, type Tx, type Who } from './context';
import { RulesError } from './errors';
import { COUPON_AUDIENCES, couponAudienceOf, isLive, type CouponAudience } from './model';
import { toRule } from './rows';

type CouponRow = Prisma.CouponGetPayload<object>;


export interface CouponView {
  id: string;
  code: string;
  ruleId: string | null;
  enabled: boolean;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  audience: CouponAudience;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  archived: boolean;
  createdAt: string;
}

const view = (c: CouponRow): CouponView => ({
  id: c.id,
  code: c.code,
  ruleId: c.ruleId,
  enabled: c.enabled,
  usageLimit: c.usageLimit,
  perCustomerLimit: c.perCustomerLimit,
  audience: couponAudienceOf(c.audience),
  usedCount: c.usedCount,
  startsAt: c.startsAt?.toISOString() ?? null,
  endsAt: c.endsAt?.toISOString() ?? null,
  archived: c.archivedAt !== null,
  createdAt: c.createdAt.toISOString(),
});

export const normaliseCode = (code: string) => code.trim().toUpperCase();

export async function listCoupons(deps: RulesDeps, who: Who, opts: { ruleId?: string; includeArchived?: boolean } = {}): Promise<CouponView[]> {
  await allow(deps, who, 'rules.read');
  const rows = await deps.db.coupon.findMany({ where: { storeId: who.storeId, ...(opts.ruleId ? { ruleId: opts.ruleId } : {}), ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: { createdAt: 'desc' }, take: 500 });
  return rows.map(view);
}

const createSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    ruleId: z.uuid(),
    usageLimit: z.int().min(1).max(10_000_000).nullable().optional(),
    perCustomerLimit: z.int().min(1).max(1000).nullable().optional(),
    audience: z.enum(COUPON_AUDIENCES).optional(),
    startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine((b) => !b.startsAt || !b.endsAt || Date.parse(b.endsAt) > Date.parse(b.startsAt), { message: 'the end must be after the start', path: ['endsAt'] });

/** A new coupon for a discount rule that asks for one: always off. */
export async function createCoupon(deps: RulesDeps, who: Who, input: unknown): Promise<CouponView> {
  await allow(deps, who, 'rules.write');
  const b = parse(createSchema, input, 'coupon');
  const code = normaliseCode(b.code);
  const pattern = await setting(deps, who.storeId, 'rules.coupons.codePattern');
  if (!new RegExp(pattern).test(code)) throw new RulesError('COUPON_CODE_INVALID', 'the code does not have the allowed shape', [code]);
  const ruleRow = found(await deps.db.smartRule.findFirst({ where: { id: b.ruleId, storeId: who.storeId } }), 'rule');
  const rule = toRule(ruleRow);
  if (!rule || !rule.actions.some((a) => a.type === 'discount' && a.requiresCoupon)) throw new RulesError('COUPON_RULE_INVALID', 'the rule must be a discount that asks for a coupon');
  if (await deps.db.coupon.findUnique({ where: { storeId_code: { storeId: who.storeId, code } }, select: { id: true } })) throw new RulesError('KEY_TAKEN', 'this code is used already', [code]);
  const row = await deps.db.$transaction(async (tx) => {
    const c = await tx.coupon.create({
      data: {
        storeId: who.storeId,
        code,
        kind: 'rule',
        value: {},
        ruleId: rule.id,
        usageLimit: b.usageLimit ?? null,
        perCustomerLimit: b.perCustomerLimit ?? null,
        audience: b.audience ?? 'ALL',
        startsAt: b.startsAt ? new Date(b.startsAt) : null,
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        enabled: false,
      },
    });
    await logChange(tx, who, { action: 'coupon.create', entityType: 'Coupon', entityId: c.id, before: null, after: view(c) });
    return c;
  });
  return view(row);
}

const enableSchema = z.object({ enabled: z.boolean() }).strict();

/** Switches a coupon on or off: the owner's OK (`rules.approve`). */
export async function setCouponEnabled(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<CouponView> {
  await allow(deps, who, 'rules.read');
  const b = parse(enableSchema, input, 'switch');
  const c = found(await deps.db.coupon.findFirst({ where: { id, storeId: who.storeId } }), 'coupon');
  if (c.archivedAt) throw new RulesError('RULE_ARCHIVED', 'the coupon is archived');
  if (!(await holds(deps, who, 'rules.approve'))) {
    throw new RulesError('OWNER_OK_REQUIRED', "switching a coupon on or off changes what customers pay and needs the owner's OK", ['enabled']);
  }
  if (c.enabled === b.enabled) return view(c);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.coupon.update({ where: { id }, data: { enabled: b.enabled } });
    await logChange(tx, who, { action: b.enabled ? 'coupon.enable' : 'coupon.disable', entityType: 'Coupon', entityId: id, before: { enabled: c.enabled }, after: { enabled: b.enabled, ownerOk: true } });
    return r;
  });
  return view(row);
}

/** Archives a coupon that is off (switch it off first), or brings it back (off). */
export async function archiveCoupon(deps: RulesDeps, who: Who, id: string, input: unknown): Promise<CouponView> {
  await allow(deps, who, 'rules.publish');
  const b = parse(z.object({ archived: z.boolean() }).strict(), input, 'archive');
  const c = found(await deps.db.coupon.findFirst({ where: { id, storeId: who.storeId } }), 'coupon');
  if (b.archived && c.enabled) throw new RulesError('RULE_ACTIVE', 'switch the coupon off before archiving it');
  if ((c.archivedAt !== null) === b.archived) return view(c);
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.coupon.update({ where: { id }, data: { archivedAt: b.archived ? nowOf(deps) : null } });
    await logChange(tx, who, { action: b.archived ? 'coupon.archive' : 'coupon.restore', entityType: 'Coupon', entityId: id, before: { archived: c.archivedAt !== null }, after: { archived: b.archived } });
    return r;
  });
  return view(row);
}

export type CouponRefusal = 'UNKNOWN' | 'OFF' | 'NOT_STARTED' | 'ENDED' | 'USED_UP' | 'PER_CUSTOMER' | 'MEMBERS_ONLY' | 'GUESTS_ONLY' | 'FIRST_ORDER_ONLY' | 'RULE_NOT_LIVE';

/** PR 213 follow-up — the orders that do not make a buyer "not new": never placed, or cancelled. */
const NOT_AN_ORDER = ['DRAFT', 'CANCELLED'] as const;

export interface CouponCheck {
  ok: boolean;
  reason: CouponRefusal | null;
  couponId: string | null;
  /** The rule the coupon unlocks (pass it to the engine as `couponRuleIds`). */
  ruleId: string | null;
  code: string;
}

/**
 * May this code be used now by this customer? (checkout, before the order; no permission: storefront server code)
 * `orderId`: the order being placed (redeeming), left out of his order history.
 */
export async function checkCoupon(db: Db, input: { storeId: number; code: string; phone?: string | null; customerId?: string | null; orderId?: string | null; now: Date }): Promise<CouponCheck> {
  const code = normaliseCode(input.code);
  const no = (reason: CouponRefusal, c?: CouponRow): CouponCheck => ({ ok: false, reason, couponId: c?.id ?? null, ruleId: c?.ruleId ?? null, code });
  const c = await db.coupon.findUnique({ where: { storeId_code: { storeId: input.storeId, code } } });
  if (!c || c.archivedAt) return no('UNKNOWN');
  if (!c.enabled) return no('OFF', c);
  if (c.startsAt && c.startsAt > input.now) return no('NOT_STARTED', c);
  if (c.endsAt && c.endsAt <= input.now) return no('ENDED', c);
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return no('USED_UP', c);
  // Who may use it (SIM-F-009): a members-only code asks a guest to sign in, in words; a guests-only code says so too.
  const audience = couponAudienceOf(c.audience);
  if (audience === 'MEMBERS' && !input.customerId) return no('MEMBERS_ONLY', c);
  if (audience === 'GUESTS' && input.customerId) return no('GUESTS_ONLY', c);
  // PR 213 follow-up (SIM-F-050): a first-order code reads his order history by phone (and account), logged in or not.
  // Before his number is known (the bag) it is let through; placing the order checks again with the number.
  if (audience === 'FIRST_ORDER' && (input.phone || input.customerId)) {
    const earlier = await db.order.count({
      where: {
        storeId: input.storeId,
        status: { notIn: [...NOT_AN_ORDER] },
        ...(input.orderId ? { id: { not: input.orderId } } : {}),
        OR: [...(input.phone ? [{ phone: input.phone }] : []), ...(input.customerId ? [{ customerId: input.customerId }] : [])],
      },
    });
    if (earlier > 0) return no('FIRST_ORDER_ONLY', c);
  }
  if (c.perCustomerLimit !== null && (input.phone || input.customerId)) {
    const used = await db.couponRedemption.count({ where: { couponId: c.id, OR: [...(input.phone ? [{ phone: input.phone }] : []), ...(input.customerId ? [{ customerId: input.customerId }] : [])] } });
    if (used >= c.perCustomerLimit) return no('PER_CUSTOMER', c);
  }
  const ruleRow = c.ruleId ? await db.smartRule.findFirst({ where: { id: c.ruleId, storeId: input.storeId } }) : null;
  const rule = ruleRow ? toRule(ruleRow) : null;
  if (!rule || !isLive(rule, input.now)) return no('RULE_NOT_LIVE', c);
  return { ok: true, reason: null, couponId: c.id, ruleId: c.ruleId, code };
}

/**
 * Records the use of a coupon by an order, inside the order's transaction. Idempotent per order. Refuses
 * (COUPON_NOT_USABLE) when the coupon cannot be used any more — the order must then be priced without it.
 */
export async function redeemCoupon(tx: Tx, input: { storeId: number; code: string; orderId: string; phone?: string | null; customerId?: string | null; discountMinor: number; now: Date }): Promise<{ redemptionId: string; replayed: boolean }> {
  const code = normaliseCode(input.code);
  const found = await tx.coupon.findUnique({ where: { storeId_code: { storeId: input.storeId, code } }, select: { id: true } });
  if (!found) throw new RulesError('COUPON_NOT_USABLE', 'no such coupon', ['UNKNOWN']);
  // Review R1 (B1): two orders redeeming the same code wait for each other here, so the per-customer count below is read
  // after the other order's redemption is in (the use count itself is also guarded by the conditional update).
  await tx.$queryRaw(Prisma.sql`SELECT 1 FROM "Coupon" WHERE "id" = ${found.id}::uuid FOR UPDATE`);
  const c = await tx.coupon.findUniqueOrThrow({ where: { id: found.id } });
  const again = await tx.couponRedemption.findUnique({ where: { couponId_orderId: { couponId: c.id, orderId: input.orderId } } });
  if (again) return { redemptionId: again.id, replayed: true };
  const check = await checkCoupon(tx, input);
  if (!check.ok) throw new RulesError('COUPON_NOT_USABLE', 'the coupon cannot be used now', [check.reason!]);
  // The limit holds under concurrency: the count only goes up while it is below the limit.
  const bumped = await tx.$executeRaw(Prisma.sql`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = now() WHERE "id" = ${c.id}::uuid AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`);
  if (bumped !== 1) throw new RulesError('COUPON_NOT_USABLE', 'the coupon was used up a moment ago', ['USED_UP']);
  const r = await tx.couponRedemption.create({ data: { storeId: input.storeId, couponId: c.id, orderId: input.orderId, phone: input.phone ?? null, customerId: input.customerId ?? null, discountMinor: input.discountMinor } });
  return { redemptionId: r.id, replayed: false };
}
