// PR 542 — how much an advance request asks: always from what is still due and never more than it, the delivery charge
// only when the order has one, a part only with the owner's percent (rounded up to a whole taka), and the dialog's
// first choice the risk level's proposal when it can be asked.
import { describe, expect, it } from 'vitest';
import { advanceAmountOf, advanceAmounts, advancePurposeOf, defaultAdvanceKind, stillDueOf } from './advance-plan';

const order = (o: Partial<{ totalMinor: number; walletAppliedMinor: number; paidMinor: number; deliveryChargeMinor: number }> = {}) => ({ totalMinor: 250_000, walletAppliedMinor: 0, paidMinor: 0, deliveryChargeMinor: 12_000, ...o });

describe('PR 542 · advance amounts', () => {
  it('every amount is taken from what is still due, never more', () => {
    expect(stillDueOf(order({ walletAppliedMinor: 10_000, paidMinor: 40_000 }))).toBe(200_000);
    expect(advanceAmountOf('full', order({ paidMinor: 50_000 }), null)).toEqual({ ok: true, amountMinor: 200_000 });
    expect(advanceAmountOf('codOff', order(), null)).toEqual({ ok: true, amountMinor: 250_000 });
    expect(advanceAmountOf('delivery', order({ totalMinor: 5_000 }), null)).toEqual({ ok: true, amountMinor: 5_000 });
    for (const k of ['delivery', 'partial', 'full', 'codOff'] as const) expect(advanceAmountOf(k, order({ paidMinor: 250_000 }), 30)).toEqual({ ok: false, code: 'NOTHING_DUE' });
  });

  it('the delivery charge only when there is one; a part only with its percent, rounded up to a whole taka', () => {
    expect(advanceAmountOf('delivery', order(), null)).toEqual({ ok: true, amountMinor: 12_000 });
    expect(advanceAmountOf('delivery', order({ deliveryChargeMinor: 0 }), null)).toEqual({ ok: false, code: 'NO_CHARGE' });
    expect(advanceAmountOf('partial', order(), null)).toEqual({ ok: false, code: 'PARTIAL_UNSET' });
    // 33% of ৳2,499.50 = ৳824.835 → ৳825
    expect(advanceAmountOf('partial', order({ totalMinor: 249_950 }), 33)).toEqual({ ok: true, amountMinor: 82_500 });
    expect(advanceAmountOf('partial', order({ totalMinor: 150 }), 99)).toEqual({ ok: true, amountMinor: 150 });
  });

  it("the payment's purpose, and the dialog's first choice", () => {
    expect([advancePurposeOf('delivery'), advancePurposeOf('partial'), advancePurposeOf('full'), advancePurposeOf('codOff')]).toEqual(['ADVANCE_DELIVERY_CHARGE', 'PART_ADVANCE', 'FULL_ADVANCE', 'FULL_ADVANCE']);
    const a = advanceAmounts(order({ deliveryChargeMinor: 0 }), null);
    expect(defaultAdvanceKind('full', a)).toBe('full');
    expect(defaultAdvanceKind('delivery', a)).toBe('full');
    expect(defaultAdvanceKind(null, advanceAmounts(order(), null))).toBe('delivery');
    expect(defaultAdvanceKind('none', a)).toBe('full');
  });
});
