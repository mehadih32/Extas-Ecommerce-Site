import { describe, expect, it } from 'vitest';
import { choosePayment, isPrepaid, rewardOf, rulesPaymentMethod, type PaySettings } from './payment';

const open: Pick<PaySettings, 'mobile' | 'card' | 'online'> = { mobile: ['bkash', 'nagad'], card: ['visa', 'bank'], online: true };
const reward = (r: Partial<PaySettings['reward']>): PaySettings['reward'] => ({ enabled: true, type: 'amount', fallback: null, amountMinor: null, percent: null, maxMinor: null, ...r });

describe('payment choice (PR 120)', () => {
  it('keeps an open choice and falls back to the first open method otherwise', () => {
    expect(choosePayment(null, open, true)).toEqual({ method: 'cod', option: null });
    expect(choosePayment(null, open, false)).toEqual({ method: 'mobile', option: 'bkash' });
    expect(choosePayment({ method: 'mobile', option: 'nagad' }, open, true)).toEqual({ method: 'mobile', option: 'nagad' });
    expect(choosePayment({ method: 'card', option: 'amex' }, open, true)).toEqual({ method: 'card', option: 'visa' });
    expect(choosePayment({ method: 'cod' }, open, false)).toEqual({ method: 'mobile', option: 'bkash' });
    expect(choosePayment({ method: 'online' }, { mobile: [], card: [], online: false }, false)).toBeNull();
  });

  it('names the method for the Smart Rules and tells prepaid from Cash on Delivery', () => {
    expect(rulesPaymentMethod({ method: 'mobile', option: 'nagad' })).toBe('nagad');
    expect(rulesPaymentMethod({ method: 'card', option: 'visa' })).toBe('card');
    expect(rulesPaymentMethod(null)).toBeNull();
    expect(isPrepaid({ method: 'cod', option: null })).toBe(false);
    expect(isPrepaid({ method: 'online', option: null })).toBe(true);
  });
});

describe('prepaid reward (CN-018 (1), SIM-F-042)', () => {
  const order = { itemsMinor: 200_000, deliveryFree: false, chargeMinor: 8_000 };
  it('review R1 (M5): a percent reward is rounded up to the store’s step, so the total stays collectable', () => {
    expect(rewardOf(reward({ type: 'percent', percent: 3 }), { itemsMinor: 149_900, deliveryFree: false, chargeMinor: 8_000 })).toEqual({ kind: 'percent', amountMinor: 4_497 });
    expect(rewardOf(reward({ type: 'percent', percent: 3, roundingStepMinor: 100 }), { itemsMinor: 149_900, deliveryFree: false, chargeMinor: 8_000 })).toEqual({ kind: 'percent', amountMinor: 4_500 });
  });
  it('is nothing while off or unset', () => {
    expect(rewardOf(reward({ enabled: false, amountMinor: 5_000 }), order)).toBeNull();
    expect(rewardOf(reward({ type: null }), order)).toBeNull();
    expect(rewardOf(reward({ type: 'amount' }), order)).toBeNull();
    expect(rewardOf(reward({ type: 'percent' }), order)).toBeNull();
  });
  it('free delivery, an amount (never more than the items) or a capped percentage', () => {
    expect(rewardOf(reward({ type: 'freeDelivery' }), order)).toEqual({ kind: 'freeDelivery', amountMinor: 8_000 });
    expect(rewardOf(reward({ type: 'freeDelivery' }), { ...order, chargeMinor: null })).toEqual({ kind: 'freeDelivery', amountMinor: null });
    expect(rewardOf(reward({ amountMinor: 5_000 }), order)).toEqual({ kind: 'amount', amountMinor: 5_000 });
    expect(rewardOf(reward({ amountMinor: 500_000 }), order)).toEqual({ kind: 'amount', amountMinor: 200_000 });
    expect(rewardOf(reward({ type: 'percent', percent: 5 }), order)).toEqual({ kind: 'percent', amountMinor: 10_000 });
    expect(rewardOf(reward({ type: 'percent', percent: 5, maxMinor: 3_000 }), order)).toEqual({ kind: 'percent', amountMinor: 3_000 });
  });
  it('falls back when delivery is already free', () => {
    const free = { ...order, deliveryFree: true, chargeMinor: null };
    expect(rewardOf(reward({ type: 'freeDelivery', amountMinor: 5_000 }), free)).toBeNull();
    expect(rewardOf(reward({ type: 'freeDelivery', fallback: 'amount', amountMinor: 5_000 }), free)).toEqual({ kind: 'amount', amountMinor: 5_000 });
    expect(rewardOf(reward({ type: 'freeDelivery', fallback: 'percent', percent: 10 }), free)).toEqual({ kind: 'percent', amountMinor: 20_000 });
  });
});
