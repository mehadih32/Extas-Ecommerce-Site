// S28 · PR 664 — price adjust on every order: the arithmetic and the limit rule, with no database (the service is
// price-adjust.ts). Money is minor units, whole numbers only. An adjustment only ever lowers what the customer still has to
// pay (the order's total minus the wallet and what is paid already), so it never creates a refund and never goes below zero.
import type { PriceAdjustLimit } from '@extas/settings';

export const ADJUST_KINDS = ['AMOUNT', 'PERCENT', 'WALLET', 'FREE_DELIVERY'] as const;
export type AdjustKind = (typeof ADJUST_KINDS)[number];

/** The order's money as an adjustment reads it. */
export interface AdjustMoney {
  subtotalMinor: number;
  discountMinor: number;
  deliveryChargeMinor: number;
  totalMinor: number;
  walletAppliedMinor: number;
  paidMinor: number;
  codAmountMinor: number;
  /** Cash on Delivery: the amount at the door follows the total. */
  cod: boolean;
}

/** What the customer still has to pay: the room an adjustment has. */
export const priceDueOf = (m: Pick<AdjustMoney, 'totalMinor' | 'walletAppliedMinor' | 'paidMinor'>): number => Math.max(0, m.totalMinor - m.walletAppliedMinor - m.paidMinor);

export type AdjustCalc =
  | { ok: true; amountMinor: number; percent: number | null }
  | { ok: false; code: 'INVALID_INPUT' | 'NOTHING_TO_ADJUST' | 'ADJUST_TOO_MUCH'; field: string; maxMinor?: number };

/**
 * The amount an adjustment takes off. `value` is the typed number: minor units for AMOUNT and WALLET, a whole percent for
 * PERCENT, nothing for FREE_DELIVERY (the order's own delivery charge). A wallet adjustment with no value uses as much of
 * the wallet as the order has room for.
 */
export function calcAdjust(kind: AdjustKind, value: number | null | undefined, m: AdjustMoney, walletBalanceMinor: number): AdjustCalc {
  const room = priceDueOf(m);
  const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  let amount: number;
  let percent: number | null = null;
  switch (kind) {
    case 'AMOUNT':
      if (!whole(value) || value < 1) return { ok: false, code: 'INVALID_INPUT', field: 'value' };
      amount = value;
      break;
    case 'PERCENT':
      if (!whole(value) || value < 1 || value > 100) return { ok: false, code: 'INVALID_INPUT', field: 'value' };
      percent = value;
      amount = Math.round((m.subtotalMinor * value) / 100);
      break;
    case 'WALLET':
      if (value !== null && value !== undefined && (!whole(value) || value < 1)) return { ok: false, code: 'INVALID_INPUT', field: 'value' };
      amount = whole(value) ? value : Math.min(walletBalanceMinor, room);
      if (amount > walletBalanceMinor) return { ok: false, code: 'ADJUST_TOO_MUCH', field: 'value', maxMinor: walletBalanceMinor };
      break;
    case 'FREE_DELIVERY':
      amount = m.deliveryChargeMinor;
      break;
  }
  if (amount < 1) return { ok: false, code: 'NOTHING_TO_ADJUST', field: kind === 'FREE_DELIVERY' ? 'kind' : 'value' };
  if (amount > room) return { ok: false, code: 'ADJUST_TOO_MUCH', field: 'value', maxMinor: room };
  return { ok: true, amountMinor: amount, percent };
}

/** The order row's money fields after the adjustment (only what changes). */
export function adjustedMoney(kind: AdjustKind, amountMinor: number, m: AdjustMoney): { discountMinor?: number; deliveryChargeMinor?: number; walletAppliedMinor?: number; totalMinor: number; codAmountMinor: number } {
  switch (kind) {
    case 'AMOUNT':
    case 'PERCENT':
      return { discountMinor: m.discountMinor + amountMinor, totalMinor: m.totalMinor - amountMinor, codAmountMinor: m.cod ? Math.max(0, m.codAmountMinor - amountMinor) : m.codAmountMinor };
    case 'FREE_DELIVERY':
      return { deliveryChargeMinor: Math.max(0, m.deliveryChargeMinor - amountMinor), totalMinor: m.totalMinor - amountMinor, codAmountMinor: m.cod ? Math.max(0, m.codAmountMinor - amountMinor) : m.codAmountMinor };
    case 'WALLET':
      // the total stays; the wallet pays part of it, so less is due at the door
      return { walletAppliedMinor: m.walletAppliedMinor + amountMinor, totalMinor: m.totalMinor, codAmountMinor: m.cod ? Math.max(0, m.codAmountMinor - amountMinor) : m.codAmountMinor };
  }
}

/**
 * The limit of a person with these roles: the widest of their roles' limits (an owner has none). A role the owner did not
 * list has a limit of nothing, so everything it asks waits for approval; a listed role's `null` is "no limit" on that side.
 */
export function limitFor(roleKeys: readonly string[], roleLimits: Readonly<Record<string, PriceAdjustLimit>>, isOwner: boolean): PriceAdjustLimit {
  if (isOwner) return { amountMinor: null, percent: null };
  let amount: number | null = 0;
  let percent: number | null = 0;
  for (const k of roleKeys) {
    const l = roleLimits[k];
    if (!l) continue;
    amount = amount === null || l.amountMinor === null ? null : Math.max(amount, l.amountMinor);
    percent = percent === null || l.percent === null ? null : Math.max(percent, l.percent);
  }
  return { amountMinor: amount, percent };
}

/** Is this adjustment above the person's own limit (so it needs approval)? The customer's own wallet never counts. */
export function aboveLimit(kind: AdjustKind, c: { amountMinor: number; percent: number | null }, subtotalMinor: number, limit: PriceAdjustLimit): boolean {
  if (kind === 'WALLET') return false;
  if (limit.amountMinor !== null && c.amountMinor > limit.amountMinor) return true;
  if (limit.percent !== null) {
    // typed percent against the limit; a taka amount against the same percent of the subtotal
    if (kind === 'PERCENT' && c.percent !== null) return c.percent > limit.percent;
    return c.amountMinor * 100 > subtotalMinor * limit.percent;
  }
  return false;
}
