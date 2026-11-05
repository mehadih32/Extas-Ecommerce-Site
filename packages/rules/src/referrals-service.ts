// S13 · PR 273 — the referral programme (SIM-F-009, the referral half: "referral codes accepted on first orders").
// A signed-in customer has one invite code (a Referral row, made the first time he looks while the programme runs). A
// friend types it in the bag like any code: while `referrals.programme` is on, inside its days, and its friend rule (an
// offer that asks for a code, made by the owner) is live, it unlocks that rule on the friend's first order — guests too,
// the first order read by phone number (and account), the same check as a first-order coupon. A customer's own code is
// refused in words. Placing the order records one ReferralUse (inside the order's transaction; one per order). The
// friend's amount is the rule's; the sharer's reward is a wallet credit given later by a person (web lib/marketing/
// referrals.ts). Nothing here sets an amount, makes a rule or changes a price; the programme is off as it ships.
import { randomInt } from 'node:crypto';
import type { ReferralProgramme } from '@extas/settings';
import { nowOf, setting, type Db, type RulesDeps, type Tx } from './context';
import type { CouponCheck } from './coupons-service';
import { RulesError } from './errors';
import { isLive, unlocksWithCoupon } from './model';
import { toRule } from './rows';

/** A use is PENDING until the sharer's reward is given (REWARDED). */
export const REFERRAL_USE_STATUSES = ['PENDING', 'REWARDED'] as const;
export type ReferralUseStatus = (typeof REFERRAL_USE_STATUSES)[number];

/** The orders that do not make a buyer "not new" (as for first-order coupons): never placed, or cancelled. */
const NOT_AN_ORDER = ['DRAFT', 'CANCELLED'];
/** Letters and digits that cannot be misread (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Tries for a free random code before giving up (a technical bound). */
const CODE_TRIES = 8; // hardcode-ok: technical bound on retries, not a business number

const normalise = (code: string) => code.trim().toUpperCase();
/** The store's calendar day, `YYYY-MM-DD`. */
const dayIn = (now: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export interface ReferralNow {
  /** The programme runs now and its friend rule is live. */
  live: boolean;
  /** The live friend rule's id (null when not live). */
  ruleId: string | null;
  programme: ReferralProgramme;
}

/** Is the programme running now (switch, days, a live friend rule that asks for a code)? */
export async function referralProgrammeNow(deps: Pick<RulesDeps, 'db' | 'settings' | 'now'>, storeId: number): Promise<ReferralNow> {
  const [programme, timeZone] = await Promise.all([setting(deps, storeId, 'referrals.programme'), setting(deps, storeId, 'store.timeZone')]);
  const off = { live: false, ruleId: null, programme };
  if (!programme.on || !programme.friendRuleKey) return off;
  const now = nowOf(deps);
  const today = dayIn(now, timeZone);
  if ((programme.startsOn && today < programme.startsOn) || (programme.endsOn && today > programme.endsOn)) return off;
  const row = await deps.db.smartRule.findFirst({ where: { storeId, key: programme.friendRuleKey } });
  const rule = row ? toRule(row) : null;
  if (!rule || !unlocksWithCoupon(rule) || !isLive(rule, now)) return off;
  return { live: true, ruleId: rule.id, programme };
}

/** Has this number (or account) placed an order before (the order being placed left out)? */
async function orderedBefore(db: Db, storeId: number, who: { phone?: string | null; customerId?: string | null; orderId?: string | null }): Promise<boolean> {
  if (!who.phone && !who.customerId) return false;
  const n = await db.order.count({
    where: {
      storeId,
      status: { notIn: NOT_AN_ORDER as never[] },
      ...(who.orderId ? { id: { not: who.orderId } } : {}),
      OR: [...(who.phone ? [{ phone: who.phone }] : []), ...(who.customerId ? [{ customerId: who.customerId }] : [])],
    },
  });
  return n > 0;
}

/** Is this the code's own sharer (by account, or by his account's phone number)? */
async function isOwnCode(db: Db, storeId: number, referrerCustomerId: string, who: { phone?: string | null; customerId?: string | null }): Promise<boolean> {
  if (who.customerId && who.customerId === referrerCustomerId) return true;
  if (!who.phone) return false;
  const c = await db.customer.findFirst({ where: { id: referrerCustomerId, storeId }, select: { phone: true } });
  return !!c?.phone && c.phone === who.phone;
}

/**
 * A typed code that is not a coupon: is it a friend's invite code the programme takes now? null = not an invite code,
 * or the programme is not running (the bag then says "an invite code, not taken now"). Before his number is known (the
 * bag) a first order is let through; placing the order checks again with the number.
 */
export async function checkReferral(deps: Pick<RulesDeps, 'db' | 'settings' | 'now'>, input: { storeId: number; code: string; phone?: string | null; customerId?: string | null; orderId?: string | null }): Promise<CouponCheck | null> {
  const code = normalise(input.code);
  if (!code) return null;
  const r = await deps.db.referral.findUnique({ where: { storeId_code: { storeId: input.storeId, code } }, select: { id: true, referrerCustomerId: true } });
  if (!r) return null;
  const now = await referralProgrammeNow(deps, input.storeId);
  if (!now.live) return null;
  const base = { couponId: null, code, referralId: r.id };
  if (await isOwnCode(deps.db, input.storeId, r.referrerCustomerId, input)) return { ok: false, reason: 'REFERRAL_OWN', ruleId: null, ...base };
  if (await orderedBefore(deps.db, input.storeId, input)) return { ok: false, reason: 'FIRST_ORDER_ONLY', ruleId: null, ...base };
  return { ok: true, reason: null, ruleId: now.ruleId, ...base };
}

/**
 * Records an invite code's use by the order being placed, inside its transaction (called by `redeemCoupon` for a code
 * that is not a coupon). One use per order (a replay returns it). Refuses (COUPON_NOT_USABLE) a code that is not an
 * invite code, the sharer's own code, or a number that ordered before — the order must then be priced without it.
 */
export async function redeemReferral(tx: Tx, input: { storeId: number; code: string; orderId: string; phone?: string | null; customerId?: string | null }): Promise<{ redemptionId: string; replayed: boolean }> {
  const code = normalise(input.code);
  const r = await tx.referral.findUnique({ where: { storeId_code: { storeId: input.storeId, code } }, select: { id: true, referrerCustomerId: true } });
  if (!r) throw new RulesError('COUPON_NOT_USABLE', 'no such coupon', ['UNKNOWN']);
  const again = await tx.referralUse.findUnique({ where: { storeId_orderId: { storeId: input.storeId, orderId: input.orderId } } });
  if (again) return { redemptionId: again.id, replayed: true };
  if (await isOwnCode(tx, input.storeId, r.referrerCustomerId, input)) throw new RulesError('COUPON_NOT_USABLE', 'this is his own invite code', ['REFERRAL_OWN']);
  if (await orderedBefore(tx, input.storeId, input)) throw new RulesError('COUPON_NOT_USABLE', 'an invite code is for a first order', ['FIRST_ORDER_ONLY']);
  const u = await tx.referralUse.create({ data: { storeId: input.storeId, referralId: r.id, orderId: input.orderId, refereeCustomerId: input.customerId ?? null, phone: input.phone ?? null, status: 'PENDING' } });
  return { redemptionId: u.id, replayed: false };
}

export interface MyInvite {
  code: string;
  /** Friends' orders placed with it. */
  used: number;
  /** Rewards given to him. */
  rewarded: number;
}

/**
 * A signed-in customer's own invite code while the programme runs (made the first time, random, unambiguous, never a
 * coupon's code); null while it does not run (the account shows no invite card).
 */
export async function myInvite(deps: Pick<RulesDeps, 'db' | 'settings' | 'now'>, input: { storeId: number; customerId: string }): Promise<MyInvite | null> {
  const now = await referralProgrammeNow(deps, input.storeId);
  if (!now.live) return null;
  const counts = async (id: string, code: string): Promise<MyInvite> => {
    const [used, rewarded] = await Promise.all([deps.db.referralUse.count({ where: { referralId: id } }), deps.db.referralUse.count({ where: { referralId: id, status: 'REWARDED' } })]);
    return { code, used, rewarded };
  };
  const mine = await deps.db.referral.findUnique({ where: { storeId_referrerCustomerId: { storeId: input.storeId, referrerCustomerId: input.customerId } }, select: { id: true, code: true } });
  if (mine) return counts(mine.id, mine.code);
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = Array.from({ length: now.programme.codeLength }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (await deps.db.coupon.findUnique({ where: { storeId_code: { storeId: input.storeId, code } }, select: { id: true } })) continue;
    try {
      const made = await deps.db.referral.create({ data: { storeId: input.storeId, referrerCustomerId: input.customerId, code, status: 'ACTIVE' } });
      return counts(made.id, made.code);
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      // two tabs at once: his code was made a moment ago; or the random code was taken: try another
      const again = await deps.db.referral.findUnique({ where: { storeId_referrerCustomerId: { storeId: input.storeId, referrerCustomerId: input.customerId } }, select: { id: true, code: true } });
      if (again) return counts(again.id, again.code);
    }
  }
  throw new RulesError('CONFLICT', 'no free invite code was found');
}
