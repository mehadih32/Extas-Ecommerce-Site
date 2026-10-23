// The combo storefront (S03 · PR 91–95, 102, 103, registry v30): every key at version 30, public, with both labels;
// the demo's own defaults, the owner's promise ("exchange one item or the whole set") off, and nothing else accepted.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { comboLandingSchema, comboPageSettings, comboPagePartsSchema, comboPopularPairsSchema } from '../src/registry-combo-pages';

describe('combo storefront settings (v30)', () => {
  it('every key is in the registry at version 30, public, not owner data, with both labels', () => {
    for (const [key, spec] of Object.entries(comboPageSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(30);
      expect(spec.isPublic, key).toBe(true);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.group, key).toBe('combos');
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${lang} ${key}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it('the demo`s defaults: C1, six popular pairs learned from picks, the exchange promise off', () => {
    expect(comboPageSettings['combos.page.layout'].default).toBe('C1');
    expect(comboPageSettings['combos.page.popularPairs'].default).toEqual({ on: true, max: 6, learn: true, minPicks: 3 });
    expect(comboPageSettings['combos.page.parts'].default.exchangeLine).toBe(false);
    expect(comboPageSettings['combos.landing'].default).toEqual({ on: true, seasonTabs: true, perRail: 8 });
  });

  it('refuses what is not a setting of these pages', () => {
    expect(comboPopularPairsSchema.safeParse({ on: true, max: 7, learn: true, minPicks: 3 }).success).toBe(false);
    expect(comboPagePartsSchema.safeParse({ summary: true, whatsapp: true, rules: true, exchangeLine: false, itemPrices: true, discount: 10 }).success).toBe(false);
    expect(comboLandingSchema.safeParse({ on: true, seasonTabs: true, perRail: 0 }).success).toBe(false);
  });
});
