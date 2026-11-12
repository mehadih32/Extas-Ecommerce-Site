// S24 · PR 475 (registry v295): the combo/gift-set composition studio's own feature switch (off by default,
// CN-018) and its default layout, and that its own layout list stays identical to @extas/photoshoot's own.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PHOTOSHOOT_COMBO_GIFT_SET_ENABLED_DEFAULT, PHOTOSHOOT_COMBO_GIFT_SET_LAYOUTS, photoshootComboGiftSetSettings } from '../src/registry-photoshoot-combo-gift-set';

describe('photoshoot combo/gift-set composition settings (v295)', () => {
  it('are in the registry at version 295, store-scoped, labelled in English and Bengali, their default valid', () => {
    for (const [key, s] of Object.entries(photoshootComboGiftSetSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(295);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the composition studio is off as it ships (CN-018), never owner data', () => {
    expect(photoshootComboGiftSetSettings['studio.photoshoot.comboGiftSetEnabled'].isOwnerData).toBe(false);
    expect(photoshootComboGiftSetSettings['studio.photoshoot.comboGiftSetEnabled'].default).toBe(false);
    expect(PHOTOSHOOT_COMBO_GIFT_SET_ENABLED_DEFAULT).toBe(false);
  });

  it('the default layout ships flat_lay_grouped and accepts only the three named layouts', () => {
    const spec = photoshootComboGiftSetSettings['studio.photoshoot.comboGiftSetDefaultLayout'];
    expect(spec.default).toBe('flat_lay_grouped');
    expect(spec.isOwnerData).toBe(false);
    expect(spec.schema.safeParse('boxed_gift').success).toBe(true);
    expect(spec.schema.safeParse('side_by_side').success).toBe(false);
    expect(spec.schema.safeParse('').success).toBe(false);
  });

  it("names the same three layout keys @extas/photoshoot's own comboGiftSetStudio.ts names, verbatim and in order", () => {
    expect(PHOTOSHOOT_COMBO_GIFT_SET_LAYOUTS).toEqual(['flat_lay_grouped', 'standing_grouped', 'boxed_gift']);
  });
});
