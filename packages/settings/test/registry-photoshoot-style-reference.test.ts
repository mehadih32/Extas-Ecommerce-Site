// S24 · PR 539 (registry v299): the style/pose reference's own feature switch, off by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PHOTOSHOOT_STYLE_REFERENCE_ENABLED_DEFAULT, photoshootStyleReferenceSettings } from '../src/registry-photoshoot-style-reference';

describe('photoshoot style/pose reference settings (v299)', () => {
  it('are in the registry at version 309, store-scoped, labelled in English and Bengali, their default valid', () => {
    for (const [key, s] of Object.entries(photoshootStyleReferenceSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(309);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the style/pose reference feature is off as it ships (CN-018), never owner data', () => {
    expect(photoshootStyleReferenceSettings['studio.photoshoot.styleReferenceEnabled'].isOwnerData).toBe(false);
    expect(photoshootStyleReferenceSettings['studio.photoshoot.styleReferenceEnabled'].default).toBe(false);
    expect(PHOTOSHOOT_STYLE_REFERENCE_ENABLED_DEFAULT).toBe(false);
  });
});
