// S24 · PR 479 (registry v297): the unisex/couple composition engine's own feature switch, off by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PHOTOSHOOT_COUPLE_COMPOSITION_ENABLED_DEFAULT, photoshootCoupleCompositionSettings } from '../src/registry-photoshoot-couple-composition';

describe('photoshoot unisex/couple composition settings (v297)', () => {
  it('are in the registry at version 307, store-scoped, labelled in English and Bengali, their default valid', () => {
    for (const [key, s] of Object.entries(photoshootCoupleCompositionSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(307);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the couple-composition studio is off as it ships (CN-018), never owner data', () => {
    expect(photoshootCoupleCompositionSettings['studio.photoshoot.coupleCompositionEnabled'].isOwnerData).toBe(false);
    expect(photoshootCoupleCompositionSettings['studio.photoshoot.coupleCompositionEnabled'].default).toBe(false);
    expect(PHOTOSHOOT_COUPLE_COMPOSITION_ENABLED_DEFAULT).toBe(false);
  });
});
