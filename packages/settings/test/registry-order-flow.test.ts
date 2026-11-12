// S28 · PR 664 (registry v300): the Order flow rules — price adjust on orders. Off as shipped, labelled in English and
// Bengali, its default valid, a role not listed has no limit of its own (the service reads that as "everything waits").
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { orderFlowSettings, priceAdjustSchema, PRICE_ADJUST_DEFAULT, PRICE_ADJUST_OTHER_KEY } from '../src/registry-order-flow';

describe('order flow settings (v300)', () => {
  it('every key is in the registry at its version, never owner data, labelled in both languages, its default valid', () => {
    for (const [key, spec] of Object.entries(orderFlowSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(300);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 664: price adjust ships ON (the owner written OK, 13 Nov), with no role limits and the reason that asks for a note', () => {
    expect(PRICE_ADJUST_DEFAULT.enabled).toBe(true);
    expect(PRICE_ADJUST_DEFAULT.roleLimits).toEqual({});
    expect(PRICE_ADJUST_DEFAULT.reasons.map((r) => r.key)).toContain(PRICE_ADJUST_OTHER_KEY);
  });

  it('PR 664: a limit is whole numbers, a percent at most 100, and empty means no limit; a bad role key or reason list is refused', () => {
    const ok = (v: unknown) => priceAdjustSchema.safeParse({ ...PRICE_ADJUST_DEFAULT, ...(v as object) }).success;
    expect(ok({ roleLimits: { 'order-manager': { amountMinor: 50000, percent: 10 } } })).toBe(true);
    expect(ok({ roleLimits: { 'order-manager': { amountMinor: null, percent: null } } })).toBe(true);
    expect(ok({ roleLimits: { 'order-manager': { amountMinor: 1.5, percent: 10 } } })).toBe(false);
    expect(ok({ roleLimits: { 'order-manager': { amountMinor: 100, percent: 101 } } })).toBe(false);
    expect(ok({ roleLimits: { 'Order Manager': { amountMinor: 100, percent: 10 } } })).toBe(false);
    expect(ok({ reasons: [] })).toBe(false);
  });
});
