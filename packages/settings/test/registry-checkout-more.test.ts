// S04 · the rest of the customer-side checkout (registry v34): every key at version 34, never owner data, labelled in
// both languages, its default valid; each switch as the register asks.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { addOnSchema, addressBackfillSchema, addressCheckSchema, ADDRESS_DETAIL_WORDS, checkoutMoreSettings, giftSchema, thanksLookSchema } from '../src/registry-checkout-more';

describe('checkout-more settings (v34)', () => {
  it('every key is in the registry at version 34, never owner data, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(checkoutMoreSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      // review R1 (M5): the percent-cut rounding came later (registry version 120)
      expect(spec.version, key).toBe(key === 'checkout.money.roundingStepMinor' ? 120 : 34);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 563: the address-detail check is on with words in both scripts; it only ever flags (no hold setting exists)', () => {
    const d = checkoutMoreSettings['checkout.address.check'].default;
    expect(d.enabled).toBe(true);
    expect(d.words).toEqual([...ADDRESS_DETAIL_WORDS]);
    expect(d.words.some((w) => /[ঀ-৿]/.test(w))).toBe(true);
    expect(addressCheckSchema.safeParse({ ...d, hold: true }).success).toBe(false);
    expect(addressCheckSchema.safeParse({ ...d, words: [''] }).success).toBe(false);
  });

  it('PR 561: the silent backfill is off until the owner turns it on; its order source is one of three', () => {
    expect(checkoutMoreSettings['checkout.address.backfill'].default).toEqual({ enabled: false, orders: 'delivered' });
    expect(addressBackfillSchema.safeParse({ enabled: true, orders: 'placed' }).success).toBe(true);
    expect(addressBackfillSchema.safeParse({ enabled: true, orders: 'all' }).success).toBe(false);
  });

  it('PR 127: "Add to this parcel" is off until the owner turns it on; every limit is a number he sets', () => {
    expect(checkoutMoreSettings['orders.addOn'].default).toEqual({ enabled: false, until: 'confirmed', windowMinutes: 0, maxLines: 3, maxUnits: 1 });
    expect(addOnSchema.safeParse({ enabled: true, until: 'packed', windowMinutes: 0, maxLines: 3, maxUnits: 1 }).success).toBe(false);
    expect(addOnSchema.safeParse({ enabled: true, until: 'placed', windowMinutes: 30, maxLines: 0, maxUnits: 1 }).success).toBe(false);
  });

  it('PR 128: "Complete your look" is off until the owner turns it on; how many is his number', () => {
    expect(checkoutMoreSettings['thanks.look'].default).toEqual({ enabled: false, max: 3 });
    expect(thanksLookSchema.safeParse({ enabled: true, max: 0 }).success).toBe(false);
    expect(thanksLookSchema.safeParse({ enabled: true, max: 7 }).success).toBe(false);
  });

  it('PR 605: gift mode is off until the owner turns it on; the advance, the note and the date are his settings', () => {
    const d = checkoutMoreSettings['checkout.gift'].default;
    expect(d.enabled).toBe(false);
    expect(d.advance).toEqual({ required: true, type: 'full', amountMinor: null, percent: null });
    expect(giftSchema.safeParse({ ...d, advance: { ...d.advance, type: 'half' } }).success).toBe(false);
    expect(giftSchema.safeParse({ ...d, advance: { ...d.advance, percent: 101 } }).success).toBe(false);
    expect(giftSchema.safeParse({ ...d, noteMaxChars: 0, deliverAfterMaxDays: 0 }).success).toBe(true);
  });

  it('review R1 (M5): percentage cuts round to whole taka by default; the owner picks one of the fixed steps', () => {
    const r = registry['checkout.money.roundingStepMinor'];
    expect(r.default).toBe(100);
    for (const ok of [1, 100, 500, 1000]) expect(r.schema.safeParse(ok).success).toBe(true);
    for (const bad of [0, 50, 99, 101, 1.5]) expect(r.schema.safeParse(bad).success).toBe(false);
  });
});
