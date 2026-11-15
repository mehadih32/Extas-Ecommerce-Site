// PR 858 — Checkout simulator: the typed cart is checked, split into lines and priced by the checkout's own engine.
import { describe, expect, it } from 'vitest';
import { quote } from '../src/engine';
import { checkSimInput, simLines } from '../src/hub-sim';

const ok = { bandKey: 'inside', cartMinor: 240_000, pieces: 2, paymentMethod: 'COD', newCustomer: true };

describe('checkSimInput', () => {
  it('takes a whole cart', () => {
    expect(checkSimInput({ ...ok, couponCode: ' eid10 ' })).toMatchObject({ bandKey: 'inside', cartMinor: 240_000, pieces: 2, couponCode: 'EID10', newCustomer: true, categoryId: null });
  });
  it('names every field that is wrong', () => {
    expect.assertions(1);
    try {
      checkSimInput({ bandKey: '', cartMinor: 1.5, pieces: 0, paymentMethod: 'cod' });
    } catch (e) {
      expect((e as { details?: string[] }).details).toEqual(['bandKey', 'cartMinor', 'pieces', 'paymentMethod']);
    }
  });
  it('refuses a cart that is too big to be a what-if', () => {
    expect(() => checkSimInput({ ...ok, pieces: 999 })).toThrow();
    expect(() => checkSimInput({ ...ok, cartMinor: 10_000_000_000 })).toThrow();
  });
});

describe('simLines', () => {
  it('the lines add up to the cart exactly, the odd paisa on its own line', () => {
    const lines = simLines({ cartMinor: 100_001, pieces: 3 }, ['c1']);
    expect(lines.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0)).toBe(100_001);
    expect(lines.every((l) => l.categoryIds.includes('c1'))).toBe(true);
  });
  it('with no live rule the customer pays the cart and the band charge', () => {
    const q = quote([], { now: new Date('2026-11-16T10:00:00Z'), lines: simLines({ cartMinor: 240_000, pieces: 2 }, []), bandKey: 'inside', bandChargeMinor: 8_000, paymentMethod: 'COD', couponCode: null, couponRuleIds: [], customer: { loggedIn: true, deliveredOrders: 0 }, source: null, weekday: 1, hour: 10 }, { maxPercentOff: 90 });
    expect(q.itemsMinor).toBe(240_000);
    expect(q.totalMinor).toBe(248_000);
  });
});
