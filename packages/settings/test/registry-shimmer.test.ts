// S02 · PR 598 — the shimmers' speed and strength ship as designed (nothing changes until the owner changes it), never
// brighter than designed, and the bag tier box's rules/words hold no price and refuse a malformed key.
import { describe, expect, it } from 'vitest';
import { bagTierRulesSchema, registry, SHIMMERS, SHOP_SWEEPS, shopShimmerSchema } from '../src';

describe('shop.shimmer (PR 598, registry v246)', () => {
  it('ships as designed: no shimmer tuned, the demo factors', () => {
    expect(registry['shop.shimmer'].version).toBe(246);
    expect(registry['shop.shimmer'].default).toEqual({ items: {}, slow: 1.5, fast: 0.65, medium: 0.75, soft: 0.5 });
    expect(SHIMMERS).toHaveLength(SHOP_SWEEPS.length + 2);
  });

  it('takes a tune and refuses stronger than designed, unknown shimmers and soft above medium', () => {
    const base = registry['shop.shimmer'].default;
    const ok = (v: unknown) => shopShimmerSchema.safeParse(v).success;
    expect(ok({ ...base, items: { logo: { speed: 'slow', strength: 'soft' }, pdpPills: { speed: 'fast', strength: 'full' } } })).toBe(true);
    expect(ok({ ...base, items: { nope: { speed: 'slow', strength: 'soft' } } })).toBe(false);
    expect(ok({ ...base, medium: 1.2 })).toBe(false);
    expect(ok({ ...base, soft: 0.8, medium: 0.6 })).toBe(false);
    expect(ok({ ...base, items: { logo: { speed: 'turbo', strength: 'full' } } })).toBe(false);
  });
});

describe('bag.tiers.rules (PR 598, registry v247)', () => {
  it('ships showing every rule with the shop words', () => {
    expect(registry['bag.tiers.rules'].version).toBe(247);
    expect(registry['bag.tiers.rules'].default).toEqual({ hidden: [], labels: {} });
  });

  it('takes rule keys and per-tier words, refuses bad keys and duplicates', () => {
    const ok = (v: unknown) => bagTierRulesSchema.safeParse(v).success;
    expect(ok({ hidden: ['polo-set'], labels: { 'polo-set:2': { en: 'Pair up', bn: 'জোড়া নিন' } } })).toBe(true);
    expect(ok({ hidden: ['polo-set', 'polo-set'], labels: {} })).toBe(false);
    expect(ok({ hidden: [], labels: { 'polo-set': { en: 'x', bn: '' } } })).toBe(false);
    expect(ok({ hidden: ['<b>'], labels: {} })).toBe(false);
    expect(ok({ hidden: [], labels: { 'polo-set:2': { en: 'x', bn: '', priceMinor: 1 } } })).toBe(false);
  });
});
