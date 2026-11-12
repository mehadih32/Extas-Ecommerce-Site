// S15 · PR 325 — `maskSupportPii`'s own pure rule: strips an e-mail address and a Bangladeshi mobile number, in any
// of their common forms, out of the customer's own words before they ever reach a live provider (A5.1-A5.4). No
// database, no network — the full dispatch wiring is `support-dispatch.db.test.ts`.
import { describe, expect, it } from 'vitest';
import { maskSupportPii } from './support-dispatch';

describe('maskSupportPii (PR 325)', () => {
  it('masks an e-mail address and a Bangladeshi mobile number in any of their common forms', () => {
    expect(maskSupportPii('call me at 01812345678 or mail rahim@example.com')).toBe('call me at [PHONE] or mail [EMAIL]');
    expect(maskSupportPii('+8801812345678, 8801812345678, 008801812345678')).toBe('[PHONE], [PHONE], [PHONE]');
  });

  it('leaves an order number, a price, or any other digit string alone — a 9-digit floor never half-masks a longer number', () => {
    expect(maskSupportPii('order EX4320, total 10000 taka')).toBe('order EX4320, total 10000 taka');
    expect(maskSupportPii('tracking 0123456789012')).toBe('tracking 0123456789012'); // longer than a real mobile number, left whole
  });

  it('masks more than one occurrence, and leaves plain text with neither untouched', () => {
    expect(maskSupportPii('প্রাইস ঠিক আছে, ধন্যবাদ')).toBe('প্রাইস ঠিক আছে, ধন্যবাদ');
    expect(maskSupportPii('01712345678 and 01898765432 are both mine')).toBe('[PHONE] and [PHONE] are both mine');
  });
});
