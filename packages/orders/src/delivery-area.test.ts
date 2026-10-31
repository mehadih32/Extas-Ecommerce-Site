// Review R2 (M2) — "Set delivery area" prices the band with the Smart Rules' `payment.method` the checkout saw: the
// method stored on the order maps back to exactly the value checkout's `rulesPaymentMethod` gave the rules.
import { describe, expect, it } from 'vitest';
import { paymentMethodOf, rulesPaymentMethod, type PaymentChoice } from '@extas/checkout';
import { rulesMethodOf } from './delivery-area';

describe('review R2 (M2) · the order’s payment method as the Smart Rules saw it', () => {
  it('every checkout choice maps back to the value the rules read', () => {
    const choices: PaymentChoice[] = [
      { method: 'cod', option: null },
      ...['bkash', 'nagad', 'rocket', 'upay'].map((option) => ({ method: 'mobile' as const, option })),
      ...['visa', 'mastercard', 'amex', 'bank'].map((option) => ({ method: 'card' as const, option })),
      { method: 'online', option: null },
    ];
    for (const c of choices) expect(rulesMethodOf(paymentMethodOf(c, 1)), JSON.stringify(c)).toBe(rulesPaymentMethod(c));
  });
  it('a method the checkout never stores for a choice reads as no method', () => {
    for (const m of ['WALLET', 'CASH', null]) expect(rulesMethodOf(m)).toBeNull();
  });
});
