// S22 · PR 430 (registry v158): orders from a support chat — at version 158, never owner data, labelled in both
// languages, off as shipped (CN-018), nothing but the switch.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportCartSchema, supportCartSettings } from '../src/registry-support-cart';

const spec = supportCartSettings['support.cart'];

describe('support.cart setting (v158)', () => {
  it('is in the registry at version 158, store-level, labelled in English and Bengali', () => {
    expect(registry['support.cart']).toBe(spec);
    expect(spec.version).toBe(158);
    expect(spec.scope).toBe('store');
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [spec.labelKey, spec.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships off; the pay link words use only their tokens, carry {link} and no typed amount', () => {
    expect(spec.default.enabled).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(spec.default.payLinkWords[lang]).toContain('{link}');
      expect(/\d/.test(spec.default.payLinkWords[lang].replace(/\{\w+\}/g, '')), lang).toBe(false);
    }
    const words = spec.default.payLinkWords;
    for (const bad of [{ enabled: 'yes' }, { extra: 1 }, { payLinkWords: { ...words, en: 'Pay {amount} {total}: {link}' } }, { payLinkWords: { ...words, bn: 'অগ্রিম দিন' } }, { payLinkWords: { en: '', bn: words.bn } }])
      expect(supportCartSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
    expect(supportCartSchema.safeParse({ enabled: true, payLinkWords: { en: 'Pay here: {link}', bn: 'এখানে দিন: {link}' } }).success).toBe(true);
  });
});
