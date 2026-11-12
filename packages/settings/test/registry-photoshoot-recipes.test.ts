// S24 · PR 470 (registry v293): the category recipe framework's own owner-editable overrides — empty/off by
// default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PHOTOSHOOT_RECIPE_KEYS, PHOTOSHOOT_RECIPE_OVERRIDES_DEFAULT, photoshootRecipeOverridesSchema, photoshootRecipeSettings } from '../src/registry-photoshoot-recipes';

describe('photoshoot category recipe override setting (v293)', () => {
  it('is in the registry at version 293, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(photoshootRecipeSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(293);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships with nothing overridden', () => {
    expect(photoshootRecipeSettings['studio.photoshoot.recipeOverrides'].default).toEqual({});
    expect(PHOTOSHOOT_RECIPE_OVERRIDES_DEFAULT).toEqual({});
  });

  it('names exactly 13 keys, the same 13 PR 469 built', () => {
    expect(PHOTOSHOOT_RECIPE_KEYS.length).toBe(13);
    expect(new Set(PHOTOSHOOT_RECIPE_KEYS).size).toBe(13);
  });

  it('accepts a partial override of a real family, refuses an unknown family and an unknown field', () => {
    expect(photoshootRecipeOverridesSchema.safeParse({}).success).toBe(true);
    expect(photoshootRecipeOverridesSchema.safeParse({ footwear: { angleCount: '8' } }).success).toBe(true);
    expect(photoshootRecipeOverridesSchema.safeParse({ watches: { modelLibrary: null } }).success).toBe(true);
    expect(photoshootRecipeOverridesSchema.safeParse({ watches: { engines: ['on_model'], detailPoints: ['dial'] } }).success).toBe(true);
    expect(photoshootRecipeOverridesSchema.safeParse({ not_a_real_family: {} }).success).toBe(false);
    expect(photoshootRecipeOverridesSchema.safeParse({ footwear: { engines: ['not_a_real_engine'] } }).success).toBe(false);
    expect(photoshootRecipeOverridesSchema.safeParse({ footwear: { madeUpField: 1 } }).success).toBe(false);
  });

  it('refuses an empty engines list and more than 4 engines', () => {
    expect(photoshootRecipeOverridesSchema.safeParse({ footwear: { engines: [] } }).success).toBe(false);
    expect(photoshootRecipeOverridesSchema.safeParse({ footwear: { engines: ['ghost_mannequin', 'on_model', 'product_only', 'real_flat', 'on_model'] } }).success).toBe(false);
  });
});
