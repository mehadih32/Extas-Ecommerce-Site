// S28 · PR 695 — Influencers & affiliates, the sums. No database here. A partner earns commission on the GOODS value of a
// DELIVERED order that used the partner's code (the order's subtotal less its discount; delivery and fees never count),
// once `holdDays` have passed since delivery. An order that is returned, cancelled or not yet delivered earns nothing.
// What is owed = earned and past the hold, less what the ledger has paid (a reversal row is a negative payout).
import { z } from 'zod';

export const AFFILIATE_PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'Facebook', 'Other'] as const;

/** A code is upper-case letters and digits, 3 to 20 of them. */
export const cleanAffiliateCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
export const isAffiliateCode = (code: string): boolean => /^[A-Z0-9]{3,20}$/.test(code);

/** Basis points of a percent figure (7.5 -> 750), whole basis points. */
export const toBp = (pct: number): number => Math.round(pct * 100);
export const fromBp = (bp: number): number => bp / 100;

export const affiliateInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    handle: z.string().trim().max(200).optional(),
    platform: z.enum(AFFILIATE_PLATFORMS).optional(),
    code: z.string().trim().min(1).max(40),
    /** A coupon of the shop the code belongs to (the coupon gives the buyer the discount). */
    couponId: z.string().uuid().optional(),
    /** The partner's own commission in percent (empty: the shop's default). */
    commissionPct: z.number().min(0).max(100).optional(),
  })
  .strict();

export interface CommissionOrder {
  status: string;
  deliveredAt: Date | null;
  subtotalMinor: number;
  discountMinor: number;
}

/** The goods value of an order (never below zero). */
export const goodsValue = (o: Pick<CommissionOrder, 'subtotalMinor' | 'discountMinor'>): number => Math.max(0, o.subtotalMinor - o.discountMinor);

/** Commission on one order in minor units, rounded down; 0 for anything not delivered. */
export function commissionOf(o: CommissionOrder, commissionBp: number): number {
  if (o.status !== 'DELIVERED' || !o.deliveredAt) return 0;
  return Math.floor((goodsValue(o) * commissionBp) / 10_000); // hardcode-ok: basis points to a fraction
}

/** Has the hold passed (days after delivery)? */
export function pastHold(deliveredAt: Date | null, holdDays: number, now: Date): boolean {
  if (!deliveredAt) return false;
  return now.getTime() >= deliveredAt.getTime() + holdDays * 86_400_000; // hardcode-ok: ms per day
}

export interface Standing {
  /** All commission on delivered orders, hold or not. */
  earnedMinor: number;
  /** Of it, still inside the hold days. */
  onHoldMinor: number;
  /** The ledger: paid, less reversed. */
  paidMinor: number;
  /** Earned, past the hold, less paid (never below zero). */
  dueMinor: number;
  deliveredOrders: number;
}

export function standing(orders: CommissionOrder[], commissionBp: number, holdDays: number, payoutAmounts: number[], now: Date): Standing {
  let earned = 0;
  let hold = 0;
  let delivered = 0;
  for (const o of orders) {
    const c = commissionOf(o, commissionBp);
    if (o.status === 'DELIVERED' && o.deliveredAt) delivered++;
    earned += c;
    if (c > 0 && !pastHold(o.deliveredAt, holdDays, now)) hold += c;
  }
  const paid = payoutAmounts.reduce((a, b) => a + b, 0);
  return { earnedMinor: earned, onHoldMinor: hold, paidMinor: paid, dueMinor: Math.max(0, earned - hold - paid), deliveredOrders: delivered };
}
