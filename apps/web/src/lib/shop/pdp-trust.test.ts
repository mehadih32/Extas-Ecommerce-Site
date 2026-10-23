// PR 62 — the promise row: only what is true, in the owner's order.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { trustFacts, trustItems } from './pdp-trust';

const set = productSettings['pdp.trust'].default;

describe('PR 62 · the promise row', () => {
  it('exchange and free delivery while they hold; "100% original" waits for the owner (CN-009)', () => {
    expect(trustItems(set, { exchange: true, freeDelivery: true })).toEqual(['exchange', 'freeDelivery']);
    expect(trustItems(set, { exchange: false, freeDelivery: true })).toEqual(['freeDelivery']);
    expect(trustItems(set, { exchange: false, freeDelivery: false })).toEqual([]);
  });

  it("the owner's order and switches", () => {
    const own = { on: true, items: [{ id: 'original' as const, on: true }, { id: 'exchange' as const, on: true }] };
    expect(trustItems(own, { exchange: true, freeDelivery: true })).toEqual(['original', 'exchange']);
    expect(trustItems({ ...own, on: false }, { exchange: true, freeDelivery: true })).toEqual([]);
  });
});

describe('PR 62 · read live from Smart Rules', () => {
  const policy = { exchangeOn: true, windowHours: 48 };
  it('the live exchange rule wins over the policy settings, and only where it covers the product', () => {
    expect(trustFacts({ exchange: { covered: true, windowHours: 72 }, freeOverMinor: null }, policy)).toEqual({ exchangeHours: 72, freeOverMinor: null });
    expect(trustFacts({ exchange: { covered: false, windowHours: 72 }, freeOverMinor: null }, policy).exchangeHours).toBeNull();
  });
  it('no live exchange rule: the policy settings stand in; switched off says nothing', () => {
    expect(trustFacts({ exchange: null, freeOverMinor: null }, policy).exchangeHours).toBe(48);
    expect(trustFacts({ exchange: null, freeOverMinor: null }, { ...policy, exchangeOn: false }).exchangeHours).toBeNull();
  });
  it('free delivery only with a live rule behind it (as the bag, PR 113)', () => {
    expect(trustFacts({ exchange: null, freeOverMinor: 150000 }, policy).freeOverMinor).toBe(150000);
    expect(trustFacts({ exchange: null, freeOverMinor: 0 }, policy).freeOverMinor).toBeNull();
  });
});
