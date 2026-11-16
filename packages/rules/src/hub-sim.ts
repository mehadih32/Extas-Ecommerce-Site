// Parity round 3, lane F5 · PR 858 — the Rules page's "Checkout simulator" (prototype Rules › Checkout simulator): pick a delivery area, a
// cart value, the pieces, a category, how the customer pays, a coupon and whether it is a new customer, and see exactly what that
// customer would pay with every LIVE rule working together. It prices one made-up cart with the same engine the checkout uses
// (`quote`) against the rules that are live today. Read only: nothing is saved, no order, no message, no coupon use is counted
// (`rules.read`). Whether a coupon exists and is unlocked is read from the coupon table, never invented.
import { allow, nowOf, setting, type RulesDeps, type Who } from './context';
import { activeRules } from './core';
import { clockFacts, quote, type CartFacts, type Quote } from './engine';
import { categoryParents } from './facts';
import { RulesError } from './errors';

export const SIM_MAX_PIECES = 200; // hardcode-ok: a bound on a typed number in a read-only what-if
export const SIM_MAX_CART_MINOR = 100_000_000; // hardcode-ok: the same, 1,000,000.00 in minor units

export interface CheckoutSimInput {
  bandKey: string;
  /** What the cart costs before any offer, in minor units. */
  cartMinor: number;
  pieces: number;
  categoryId?: string | null;
  paymentMethod: string;
  couponCode?: string | null;
  newCustomer: boolean;
}

/** A typed input checked; throws INVALID_INPUT with the field names. Pure. */
export function checkSimInput(raw: unknown): CheckoutSimInput {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bad: string[] = [];
  const bandKey = typeof o.bandKey === 'string' && o.bandKey.trim() ? o.bandKey.trim().slice(0, 60) : (bad.push('bandKey'), ''); // hardcode-ok: a key's length guard
  const cartMinor = Number.isInteger(o.cartMinor) && (o.cartMinor as number) >= 1 && (o.cartMinor as number) <= SIM_MAX_CART_MINOR ? (o.cartMinor as number) : (bad.push('cartMinor'), 0);
  const pieces = Number.isInteger(o.pieces) && (o.pieces as number) >= 1 && (o.pieces as number) <= SIM_MAX_PIECES ? (o.pieces as number) : (bad.push('pieces'), 0);
  const paymentMethod = typeof o.paymentMethod === 'string' && /^[A-Z_]{2,20}$/.test(o.paymentMethod) ? o.paymentMethod : (bad.push('paymentMethod'), ''); // hardcode-ok: an enum name's shape
  const categoryId = typeof o.categoryId === 'string' && o.categoryId ? o.categoryId : null;
  const couponCode = typeof o.couponCode === 'string' && o.couponCode.trim() ? o.couponCode.trim().toUpperCase().slice(0, 40) : null; // hardcode-ok: a code's length guard
  if (bad.length) throw new RulesError('INVALID_INPUT', 'the cart is not valid', bad);
  return { bandKey, cartMinor, pieces, categoryId, paymentMethod, couponCode, newCustomer: o.newCustomer === true };
}

/** The one made-up cart: `pieces` pieces that together cost `cartMinor` (the last piece takes the rounding). Pure. */
export function simLines(input: Pick<CheckoutSimInput, 'cartMinor' | 'pieces'>, categoryIds: readonly string[]): CartFacts['lines'] {
  const each = Math.floor(input.cartMinor / input.pieces);
  const lines: CartFacts['lines'] = [];
  const rest = input.cartMinor - each * input.pieces;
  // one line for the pieces at the even price, and one more piece-line for the rounding left over (when there is any)
  lines.push({ id: 'sim-1', unitPriceMinor: each, quantity: input.pieces, productId: null, categoryIds: [...categoryIds], collectionIds: [] });
  if (rest > 0) lines.push({ id: 'sim-2', unitPriceMinor: rest, quantity: 1, productId: null, categoryIds: [...categoryIds], collectionIds: [] });
  return lines;
}

export interface CheckoutSimResult {
  /** Items before offers, the offers taken off, delivery and the total (null delivery = the band has no charge set). */
  quote: Pick<Quote, 'subtotalMinor' | 'discountMinor' | 'itemsMinor' | 'totalMinor' | 'totalKnown' | 'applied' | 'waiting' | 'floorHeld'> & {
    delivery: Quote['delivery'];
    cod: Quote['cod'];
    cutoffs: Quote['cutoffs'];
  };
  /** The coupon typed: found and unlocking a rule, or why not. */
  coupon: { code: string; state: 'unlocks' | 'unknown' | 'off' } | null;
  /** The band's own delivery days, for the line "Delivery (area, 2-3 days)". */
  hours: { min: number | null; max: number | null };
}

export async function simulateCheckout(deps: RulesDeps, who: Who, raw: unknown): Promise<CheckoutSimResult> {
  await allow(deps, who, 'rules.read');
  const input = checkSimInput(raw);
  const now = nowOf(deps);
  const band = await deps.db.deliveryBand.findFirst({ where: { storeId: who.storeId, key: input.bandKey, archivedAt: null }, select: { key: true, enabled: true, chargeMinor: true, hoursMin: true, hoursMax: true } });
  if (!band) throw new RulesError('NOT_FOUND', 'no such delivery area');
  const [timeZone, maxPercentOff, roundingStepMinor] = await Promise.all([setting(deps, who.storeId, 'store.timeZone'), setting(deps, who.storeId, 'rules.discount.maxPercentOff'), setting(deps, who.storeId, 'checkout.money.roundingStepMinor')]);
  let categoryIds: string[] = [];
  if (input.categoryId) {
    const parents = await categoryParents(deps.db, who.storeId);
    if (!parents.has(input.categoryId)) throw new RulesError('INVALID_INPUT', 'no such category', ['categoryId']);
    for (let cur: string | null | undefined = input.categoryId, guard = 0; cur && guard < 64 && !categoryIds.includes(cur); cur = parents.get(cur), guard++) categoryIds = [...categoryIds, cur]; // hardcode-ok: a loop guard
  }
  let coupon: CheckoutSimResult['coupon'] = null;
  let couponRuleIds: string[] = [];
  if (input.couponCode) {
    const c = await deps.db.coupon.findFirst({ where: { storeId: who.storeId, code: input.couponCode, archivedAt: null }, select: { ruleId: true, enabled: true, startsAt: true, endsAt: true, usageLimit: true, usedCount: true } });
    if (!c) coupon = { code: input.couponCode, state: 'unknown' };
    else if (!c.enabled || (c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt < now) || (c.usageLimit !== null && c.usedCount >= c.usageLimit)) coupon = { code: input.couponCode, state: 'off' };
    else {
      coupon = { code: input.couponCode, state: 'unlocks' };
      couponRuleIds = c.ruleId ? [c.ruleId] : [];
    }
  }
  const clock = clockFacts(now, timeZone);
  const facts: CartFacts = {
    now,
    lines: simLines(input, categoryIds),
    bandKey: band.key,
    bandChargeMinor: band.enabled ? band.chargeMinor : null,
    paymentMethod: input.paymentMethod,
    couponCode: input.couponCode ?? null,
    couponRuleIds,
    customer: { loggedIn: true, deliveredOrders: input.newCustomer ? 0 : null },
    source: null,
    weekday: clock.weekday,
    hour: clock.hour,
  };
  const rules = await activeRules(deps.db, who.storeId);
  const q = quote(rules, facts, { maxPercentOff, roundingStepMinor });
  return {
    quote: { subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, itemsMinor: q.itemsMinor, totalMinor: q.totalMinor, totalKnown: q.totalKnown, applied: q.applied, waiting: q.waiting, floorHeld: q.floorHeld, delivery: q.delivery, cod: q.cod, cutoffs: q.cutoffs },
    coupon,
    hours: { min: band.hoursMin, max: band.hoursMax },
  };
}

/** What the simulator's pickers offer: the shop's own delivery areas, its categories and the payment ways. Read only (`rules.read`). */
export const SIM_PAYMENTS = ['COD', 'BKASH', 'NAGAD', 'CARD', 'ONLINE'] as const; // hardcode-ok: the payment method names the engine's payment rules use

export interface CheckoutSimChoices {
  bands: { key: string; nameEn: string; nameBn: string | null; enabled: boolean; chargeMinor: number }[];
  categories: { id: string; nameEn: string; nameBn: string | null }[];
  payments: readonly string[];
  /** PR 941: the shop's own coupon codes for the picker; `on` is false for one that is off, not started, ended or used up. */
  coupons: { code: string; on: boolean }[];
}

export async function simChoices(deps: RulesDeps, who: Who): Promise<CheckoutSimChoices> {
  await allow(deps, who, 'rules.read');
  const now = nowOf(deps);
  const [bands, categories, coupons] = await Promise.all([
    deps.db.deliveryBand.findMany({ where: { storeId: who.storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], select: { key: true, nameEn: true, nameBn: true, enabled: true, chargeMinor: true } }),
    deps.db.category.findMany({ where: { storeId: who.storeId, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: 300, select: { id: true, nameEn: true, nameBn: true } }), // hardcode-ok: a cap on one picker
    deps.db.coupon.findMany({ where: { storeId: who.storeId, archivedAt: null }, orderBy: { code: 'asc' }, take: 200, select: { code: true, enabled: true, startsAt: true, endsAt: true, usageLimit: true, usedCount: true } }), // hardcode-ok: a cap on one picker
  ]);
  return {
    bands,
    categories,
    payments: SIM_PAYMENTS,
    coupons: coupons.map((c) => ({ code: c.code, on: c.enabled && !(c.startsAt && c.startsAt > now) && !(c.endsAt && c.endsAt < now) && !(c.usageLimit !== null && c.usedCount >= c.usageLimit) })),
  };
}
