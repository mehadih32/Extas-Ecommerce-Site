// PR 172 — the refund rules without a database: every move of a refund, when a refund may be asked (B3.6: none after
// delivery except the owner's sources), what is left to refund, the RTO amount (SIM-F-041) and the derived payment
// state. Every value is made up.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { HELD_REFUND_STATES, OWED_REFUND_STATES, REFUND_STATES, refundAllowed, refundedPaymentState, refundMove, refundRoom, rtoRefundAmount, rtoRefundSplit, type RefundRules } from './refund-pure';

const RULES: RefundRules = registry['payments.refunds'].default;

describe('PR 172 · refund rules', () => {
  it('the moves: asked → approved or rejected → paid out or failed; nothing comes back from rejected or completed', () => {
    const legal = REFUND_STATES.flatMap((from) => REFUND_STATES.filter((to) => refundMove(from, to)).map((to) => `${from}>${to}`));
    expect(legal.sort()).toEqual(['APPROVED>COMPLETED', 'APPROVED>FAILED', 'APPROVED>REJECTED', 'FAILED>COMPLETED', 'FAILED>REJECTED', 'REQUESTED>APPROVED', 'REQUESTED>REJECTED']);
    expect(refundMove('REQUESTED', 'COMPLETED')).toBe(false);
    expect(refundMove('REJECTED', 'APPROVED')).toBe(false);
    expect(refundMove('COMPLETED', 'FAILED')).toBe(false);
    expect(OWED_REFUND_STATES).toEqual(['REQUESTED', 'APPROVED', 'FAILED']);
    expect(HELD_REFUND_STATES).not.toContain('REJECTED');
  });

  it('the default rules: off after delivery except the rider overcharge; an RTO only once the parcel came back', () => {
    expect(RULES).toEqual({ toWallet: false, afterDelivery: false, afterDeliverySources: ['RIDER_OVERCHARGE'], rtoDeliveryCharge: 'REFUND', fourEyes: false, rtoAdvance: 'KEEP' });
    expect(refundAllowed(RULES, 'CONFIRMED', 'OUR_MISTAKE')).toEqual({ ok: true });
    expect(refundAllowed(RULES, 'DELIVERED', 'OUR_MISTAKE')).toEqual({ ok: false, rule: 'AFTER_DELIVERY' });
    expect(refundAllowed(RULES, 'PARTIALLY_DELIVERED', 'OTHER')).toEqual({ ok: false, rule: 'AFTER_DELIVERY' });
    expect(refundAllowed(RULES, 'DELIVERED', 'RIDER_OVERCHARGE')).toEqual({ ok: true });
    expect(refundAllowed(RULES, 'IN_TRANSIT', 'RTO')).toEqual({ ok: false, rule: 'RTO_NOT_RETURNED' });
    expect(refundAllowed(RULES, 'RETURNED', 'RTO')).toEqual({ ok: true });
    expect(refundAllowed(RULES, 'DRAFT', 'OTHER')).toEqual({ ok: false, rule: 'ORDER_STATE' });
    expect(refundAllowed({ ...RULES, afterDelivery: true }, 'DELIVERED', 'OTHER')).toEqual({ ok: true });
    expect(refundAllowed({ ...RULES, afterDeliverySources: [] }, 'DELIVERED', 'RIDER_OVERCHARGE')).toEqual({ ok: false, rule: 'AFTER_DELIVERY' });
  });

  it('what is left to refund: all the money in, less every refund still holding part of it, never below zero', () => {
    expect(refundRoom({ paidMinor: 100_000, walletAppliedMinor: 5_000, collectedMinor: 0, heldMinor: 0 })).toBe(105_000);
    expect(refundRoom({ paidMinor: 0, walletAppliedMinor: 0, collectedMinor: 80_000, heldMinor: 30_000 })).toBe(50_000);
    expect(refundRoom({ paidMinor: 10_000, walletAppliedMinor: 0, collectedMinor: 0, heldMinor: 20_000 })).toBe(0);
  });

  it('SIM-F-041 — a returned prepaid parcel gives everything back, or less the delivery charge when the owner keeps it', () => {
    const o = { paidMinor: 160_000, deliveryChargeMinor: 10_000 };
    expect(rtoRefundAmount(RULES, o)).toBe(160_000);
    expect(rtoRefundAmount({ ...RULES, rtoDeliveryCharge: 'KEEP' }, o)).toBe(150_000);
    expect(rtoRefundAmount({ ...RULES, rtoDeliveryCharge: 'KEEP' }, { paidMinor: 5_000, deliveryChargeMinor: 10_000 })).toBe(0);
  });

  it('review R3 (M3, minor 2) — a delivery-charge advance is kept unless asked back; KEEP reaches the wallet; our fault gives all', () => {
    const o = { paidMinor: 12_000, walletAppliedMinor: 0, deliveryChargeMinor: 12_000, advanceMinor: 12_000, ourFault: false };
    expect(rtoRefundSplit(RULES, o)).toEqual({ originalMinor: 0, walletMinor: 0 });
    expect(rtoRefundSplit({ ...RULES, rtoAdvance: 'ASK' }, o)).toEqual({ originalMinor: 12_000, walletMinor: 0 });
    expect(rtoRefundSplit(RULES, { ...o, ourFault: true })).toEqual({ originalMinor: 12_000, walletMinor: 0 });
    // an advance and a fully paid order: the advance kept, the rest back; KEEP never keeps the charge twice
    const both = { paidMinor: 172_000, walletAppliedMinor: 0, deliveryChargeMinor: 12_000, advanceMinor: 12_000, ourFault: false };
    expect(rtoRefundSplit(RULES, both).originalMinor).toBe(160_000);
    expect(rtoRefundSplit({ ...RULES, rtoDeliveryCharge: 'KEEP' }, both).originalMinor).toBe(160_000);
    // a value saved before `rtoAdvance` existed reads as KEEP
    expect(rtoRefundSplit({ ...RULES, rtoAdvance: undefined as unknown as 'KEEP' }, o).originalMinor).toBe(0);
    // KEEP with the wallet: what the online money cannot cover comes off the wallet part
    expect(rtoRefundSplit({ ...RULES, rtoDeliveryCharge: 'KEEP' }, { paidMinor: 5_000, walletAppliedMinor: 20_000, deliveryChargeMinor: 10_000, advanceMinor: 0, ourFault: false })).toEqual({ originalMinor: 0, walletMinor: 15_000 });
  });

  it('the payment state from its paid-out refunds (derived, never set by hand)', () => {
    expect(refundedPaymentState(100_000, 0)).toBe('PAID');
    expect(refundedPaymentState(100_000, 40_000)).toBe('PARTIALLY_REFUNDED');
    expect(refundedPaymentState(100_000, 100_000)).toBe('REFUNDED');
  });
});
