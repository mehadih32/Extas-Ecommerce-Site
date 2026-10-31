// CN-018 (4) · PR 89 follow-up (registry v98, SIM-F-051): sets Fixed or Flexible — at version 98, never owner data,
// labelled in both languages, off as shipped (today's pro-rata split), and a set's own choice wins over the store's.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { comboSplitSchema, comboSplitSettings, setSplitOf } from '../src/registry-combo-split';

const spec = comboSplitSettings['combos.split'];
const on = { enabled: true, defaultMode: 'FLEXIBLE', priceRule: 'PRO_RATA', chargeUnderFreeLimit: false } as const;

describe('combos.split setting (v98)', () => {
  it('is in the registry at version 98, store-level, labelled in English and Bengali', () => {
    expect(registry['combos.split']).toBe(spec);
    expect(spec.version).toBe(98);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off, flexible and pro rata, with no delivery charge on a split', () => {
    expect(spec.default).toEqual({ enabled: false, defaultMode: 'FLEXIBLE', priceRule: 'PRO_RATA', chargeUnderFreeLimit: false });
    expect(comboSplitSchema.safeParse({ ...on, defaultMode: 'HALF' }).success).toBe(false);
    expect(comboSplitSchema.safeParse({ ...on, extra: 1 }).success).toBe(false);
  });

  it('reads nothing while off, the store default for a set without its own, and the set’s own choice first', () => {
    expect(setSplitOf({ splitMode: 'FIXED', splitPriceRule: null }, spec.default)).toBeNull();
    expect(setSplitOf({ splitMode: null, splitPriceRule: null }, on)).toEqual({ mode: 'FLEXIBLE', priceRule: 'PRO_RATA', chargeUnderFreeLimit: false });
    expect(setSplitOf({ splitMode: 'FIXED', splitPriceRule: 'OWN_PRICE' }, { ...on, chargeUnderFreeLimit: true })).toEqual({ mode: 'FIXED', priceRule: 'OWN_PRICE', chargeUnderFreeLimit: true });
    expect(setSplitOf({ splitMode: 'bogus', splitPriceRule: 'bogus' }, { ...on, defaultMode: 'FIXED' })).toEqual({ mode: 'FIXED', priceRule: 'PRO_RATA', chargeUnderFreeLimit: false });
  });
});
