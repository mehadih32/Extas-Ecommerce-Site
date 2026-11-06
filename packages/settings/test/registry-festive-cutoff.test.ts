// S13 · PR 281 (registry v216): festive cut-off words on the shop — at version 216, off as it ships, never owner data,
// labelled in both languages; a tick for each place, words in both languages or none, a link only on the shop and only
// with its words.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { festiveCutoffSettings, festiveCutoffSettingsSchema } from '../src/registry-festive-cutoff';

const base = { enabled: true, places: { home: true, product: false, checkout: false }, title: null, linkHref: null, linkLabel: null };

describe('marketing.festiveCutoff (v216)', () => {
  it('is in the registry at version 216, store-level, off with no words, labelled in English and Bengali', () => {
    const spec = festiveCutoffSettings['marketing.festiveCutoff'];
    expect(registry['marketing.festiveCutoff']).toBe(spec);
    expect(spec.version).toBe(216);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false, places: { home: true, product: true, checkout: true }, title: null, linkHref: null, linkLabel: null });
    expect(festiveCutoffSettingsSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('takes a heading and a shop link with its words in both languages', () => {
    const ok = { ...base, title: { en: 'Eid delivery', bn: 'ঈদের ডেলিভারি' }, linkHref: '/collections/eid', linkLabel: { en: 'Shop the Eid edit', bn: 'ঈদের কালেকশন' } };
    expect(festiveCutoffSettingsSchema.safeParse(ok).success).toBe(true);
  });

  it('refuses a missing place, an unknown place, one language, a link without words, words without a link and a link off the shop', () => {
    const bad = [
      { ...base, places: { home: true } },
      { ...base, places: { home: true, product: true, checkout: true, footer: true } },
      { ...base, title: { en: 'Eid delivery', bn: '' } },
      { ...base, linkHref: '/collections/eid' },
      { ...base, linkLabel: { en: 'Shop', bn: 'কিনুন' } },
      { ...base, linkHref: 'https://example.com/x', linkLabel: { en: 'Shop', bn: 'কিনুন' } },
      { ...base, linkHref: '//example.com/x', linkLabel: { en: 'Shop', bn: 'কিনুন' } },
      { ...base, linkHref: 'javascript:alert(1)', linkLabel: { en: 'Shop', bn: 'কিনুন' } },
      { ...base, extra: 1 },
    ];
    for (const b of bad) expect(festiveCutoffSettingsSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
});
