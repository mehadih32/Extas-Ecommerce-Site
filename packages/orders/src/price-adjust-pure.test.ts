// S28 · PR 664 — the price-adjust arithmetic and limit rule (no database). Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { aboveLimit, adjustedMoney, calcAdjust, priceDueOf, limitFor, type AdjustMoney } from './price-adjust-pure';

const M: AdjustMoney = { subtotalMinor: 200000, discountMinor: 0, deliveryChargeMinor: 8000, totalMinor: 208000, walletAppliedMinor: 0, paidMinor: 0, codAmountMinor: 208000, cod: true };

describe('PR 664 · what an adjustment takes off', () => {
  it('a taka amount is taken as typed, a percent off the subtotal, the delivery charge as the order has it', () => {
    expect(calcAdjust('AMOUNT', 5000, M, 0)).toEqual({ ok: true, amountMinor: 5000, percent: null });
    expect(calcAdjust('PERCENT', 10, M, 0)).toEqual({ ok: true, amountMinor: 20000, percent: 10 });
    expect(calcAdjust('FREE_DELIVERY', null, M, 0)).toEqual({ ok: true, amountMinor: 8000, percent: null });
  });

  it('refuses nothing, fractions, more than is left to pay, a percent outside 1 to 100, and a free delivery with no charge', () => {
    expect(calcAdjust('AMOUNT', 0, M, 0)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(calcAdjust('AMOUNT', 10.5, M, 0)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(calcAdjust('AMOUNT', 208001, M, 0)).toMatchObject({ ok: false, code: 'ADJUST_TOO_MUCH', maxMinor: 208000 });
    expect(calcAdjust('PERCENT', 101, M, 0)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(calcAdjust('FREE_DELIVERY', null, { ...M, deliveryChargeMinor: 0 }, 0)).toMatchObject({ ok: false, code: 'NOTHING_TO_ADJUST' });
  });

  it('only what is still due can come off: a paid or wallet-covered part is never taken back', () => {
    const paid = { ...M, paidMinor: 150000, codAmountMinor: 0, cod: false };
    expect(priceDueOf(paid)).toBe(58000);
    expect(calcAdjust('AMOUNT', 60000, paid, 0)).toMatchObject({ ok: false, code: 'ADJUST_TOO_MUCH', maxMinor: 58000 });
  });

  it('the wallet: no more than the balance, and with no value as much as the balance and the order allow', () => {
    expect(calcAdjust('WALLET', 3000, M, 2000)).toMatchObject({ ok: false, code: 'ADJUST_TOO_MUCH', maxMinor: 2000 });
    expect(calcAdjust('WALLET', null, M, 2000)).toEqual({ ok: true, amountMinor: 2000, percent: null });
    expect(calcAdjust('WALLET', null, M, 900000)).toEqual({ ok: true, amountMinor: 208000, percent: null });
    expect(calcAdjust('WALLET', null, M, 0)).toMatchObject({ ok: false, code: 'NOTHING_TO_ADJUST' });
  });
});

describe('PR 664 · the order money after an adjustment', () => {
  it('an amount or percent is a discount: the total and the amount at the door go down by it', () => {
    expect(adjustedMoney('AMOUNT', 5000, M)).toEqual({ discountMinor: 5000, totalMinor: 203000, codAmountMinor: 203000 });
  });
  it('free delivery empties the delivery charge', () => {
    expect(adjustedMoney('FREE_DELIVERY', 8000, M)).toEqual({ deliveryChargeMinor: 0, totalMinor: 200000, codAmountMinor: 200000 });
  });
  it('the wallet leaves the total as it is and lowers what is due at the door', () => {
    expect(adjustedMoney('WALLET', 2000, M)).toEqual({ walletAppliedMinor: 2000, totalMinor: 208000, codAmountMinor: 206000 });
  });
  it('a prepaid order has no amount at the door to lower', () => {
    expect(adjustedMoney('AMOUNT', 5000, { ...M, cod: false, codAmountMinor: 0 }).codAmountMinor).toBe(0);
  });
});

describe('PR 664 · the limit', () => {
  const limits = { 'order-manager': { amountMinor: 50000, percent: 10 }, 'senior-agent': { amountMinor: null, percent: 25 } };
  it('an owner has none; a role not listed has nothing; a person with two roles has the wider', () => {
    expect(limitFor([], limits, true)).toEqual({ amountMinor: null, percent: null });
    expect(limitFor(['packer'], limits, false)).toEqual({ amountMinor: 0, percent: 0 });
    expect(limitFor(['order-manager', 'senior-agent'], limits, false)).toEqual({ amountMinor: null, percent: 25 });
  });
  it('above the limit by taka or by percent of the subtotal, never for the customer\'s own wallet', () => {
    const lim = { amountMinor: 50000, percent: 10 };
    expect(aboveLimit('AMOUNT', { amountMinor: 20000, percent: null }, 200000, lim)).toBe(false);
    // both sides count: 50000 is inside the taka limit but above 10% of a 200000 subtotal
    expect(aboveLimit('AMOUNT', { amountMinor: 50000, percent: null }, 200000, lim)).toBe(true);
    expect(aboveLimit('AMOUNT', { amountMinor: 50001, percent: null }, 2_000_000, lim)).toBe(true);
    expect(aboveLimit('AMOUNT', { amountMinor: 20001, percent: null }, 200000, lim)).toBe(true);
    expect(aboveLimit('PERCENT', { amountMinor: 20000, percent: 10 }, 200000, lim)).toBe(false);
    expect(aboveLimit('PERCENT', { amountMinor: 22000, percent: 11 }, 200000, lim)).toBe(true);
    expect(aboveLimit('WALLET', { amountMinor: 900000, percent: null }, 200000, { amountMinor: 0, percent: 0 })).toBe(false);
    expect(aboveLimit('AMOUNT', { amountMinor: 1, percent: null }, 200000, { amountMinor: 0, percent: 0 })).toBe(true);
    expect(aboveLimit('AMOUNT', { amountMinor: 1_000_000, percent: null }, 200000, { amountMinor: null, percent: null })).toBe(false);
  });
});
