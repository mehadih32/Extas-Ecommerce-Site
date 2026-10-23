// S04 · the rest of the customer-side checkout (registry v34): every key at version 34, never owner data, labelled in
// both languages, its default valid; each switch as the register asks.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { addressCheckSchema, ADDRESS_DETAIL_WORDS, checkoutMoreSettings } from '../src/registry-checkout-more';

describe('checkout-more settings (v34)', () => {
  it('every key is in the registry at version 34, never owner data, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(checkoutMoreSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(34);
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
});
