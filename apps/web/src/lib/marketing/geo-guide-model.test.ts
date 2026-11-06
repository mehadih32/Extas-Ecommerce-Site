// S13 · PR 569 — a district's word from its delivered and returned orders: too few, less, more, hold.
import { describe, expect, it } from 'vitest';
import { GEO_GUIDE_DEFAULT } from '@extas/settings';
import { copyLine, returnPct, wordOf } from './geo-guide-model';

const S = GEO_GUIDE_DEFAULT; // 10 orders, more ≤ 10 %, less ≥ 30 %

describe('geo guide words', () => {
  it('counts the return rate over settled orders', () => {
    expect(returnPct({ delivered: 9, returned: 1 })).toBe(10);
    expect(returnPct({ delivered: 0, returned: 0 })).toBeNull();
  });
  it('says too few under the least orders, whatever the rate', () => {
    expect(wordOf({ delivered: 5, returned: 4 }, S)).toBe('few');
    expect(wordOf({ delivered: 0, returned: 0 }, S)).toBe('few');
  });
  it('says less from the bad rate, more up to the good rate, hold between', () => {
    expect(wordOf({ delivered: 7, returned: 3 }, S)).toBe('less');
    expect(wordOf({ delivered: 18, returned: 2 }, S)).toBe('more');
    expect(wordOf({ delivered: 16, returned: 4 }, S)).toBe('hold');
    // a good rate but under the least delivered stays on hold
    expect(wordOf({ delivered: 9, returned: 1 }, { ...S, minOrders: 10 })).toBe('hold');
  });
  it('makes one line to copy', () => {
    expect(copyLine(['Dhaka', 'Gazipur'])).toBe('Dhaka, Gazipur');
  });
});
