// S24 · PR 469/470 — pure tests for the general category/recipe catalogue and its owner-editable override: no
// database needed (the override-reading `effectiveCategoryRecipe` is exercised here with a tiny fake
// `SettingsReader`, never a real one).
import { PHOTOSHOOT_RECIPE_KEYS } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import type { SettingsReader } from './context';
import { DETAIL_FINDER_GARMENT_TYPES } from './detailRegions';
import { applyCategoryRecipeOverride, CATEGORY_RECIPES, categoryRecipe, effectiveCategoryRecipe, isCategoryRecipeKey, isRecipeEngine, isRecipeModelLibrary, RECIPE_ENGINES, RECIPE_MODEL_LIBRARIES } from './recipes';

describe('CATEGORY_RECIPES', () => {
  it("is C7.12's own 13 recipes, verbatim and in its own order", () => {
    expect(CATEGORY_RECIPES.map((r) => r.key)).toEqual([
      'polo_tee_shirt_panjabi',
      'trouser_denim_chino',
      'ladies_garments',
      'kidswear',
      'footwear',
      'bags',
      'wallets',
      'belts',
      'caps',
      'sunglasses',
      'watches',
      'perfume',
      'socks_ties_small_goods',
    ]);
    expect(CATEGORY_RECIPES.length).toBe(13);
  });

  it('every key is unique', () => {
    const keys = CATEGORY_RECIPES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry is bilingual, lists at least one real engine, a non-empty angle count and detail points', () => {
    for (const r of CATEGORY_RECIPES) {
      expect(r.nameEn.length, r.key).toBeGreaterThan(0);
      expect(r.nameBn.length, r.key).toBeGreaterThan(0);
      expect(r.engines.length, r.key).toBeGreaterThan(0);
      for (const e of r.engines) expect(isRecipeEngine(e), `${r.key} engine ${e}`).toBe(true);
      expect(r.angleCount.length, r.key).toBeGreaterThan(0);
      expect(r.detailPoints.length, r.key).toBeGreaterThan(0);
      if (r.modelLibrary !== null) expect(isRecipeModelLibrary(r.modelLibrary), r.key).toBe(true);
    }
  });

  it("every detailFinderGarmentTypes pointer names a real Detail Finder type — never invented, never stale", () => {
    for (const r of CATEGORY_RECIPES) {
      for (const t of r.detailFinderGarmentTypes) {
        expect((DETAIL_FINDER_GARMENT_TYPES as readonly string[]).includes(t), `${r.key} -> ${t}`).toBe(true);
      }
    }
  });

  it('footwear is the one family already fully wired to a real Detail Finder checklist (PR 465)', () => {
    expect(categoryRecipe('footwear').detailFinderGarmentTypes).toEqual(['footwear']);
  });

  it('caps, sunglasses, watches and bags are now wired to their own real Detail Finder checklist (PR 471)', () => {
    expect(categoryRecipe('caps').detailFinderGarmentTypes).toEqual(['cap']);
    expect(categoryRecipe('sunglasses').detailFinderGarmentTypes).toEqual(['sunglasses']);
    expect(categoryRecipe('watches').detailFinderGarmentTypes).toEqual(['watch']);
    expect(categoryRecipe('bags').detailFinderGarmentTypes).toEqual(['bag']);
    // the two vocabularies stay deliberately separate (singular Detail Finder key vs this table's plural key)
    expect(categoryRecipe('bags').detailFinderGarmentTypes).not.toContain('bags');
  });

  it('kidswear names no model library by default — C7.12\'s "not a child model… can be enabled later"', () => {
    expect(categoryRecipe('kidswear').modelLibrary).toBeNull();
  });
});

describe('RECIPE_ENGINES / RECIPE_MODEL_LIBRARIES', () => {
  it("names C7.12's own three engines plus the honest real_flat case, nothing else", () => {
    expect(RECIPE_ENGINES).toEqual(['ghost_mannequin', 'on_model', 'product_only', 'real_flat']);
  });

  it('names the four model libraries C7.12 itself names', () => {
    expect(RECIPE_MODEL_LIBRARIES).toEqual(['men', 'ladies', 'kids', 'hand_wrist_face']);
  });
});

describe('isCategoryRecipeKey / categoryRecipe', () => {
  it('recognises every real key and nothing else', () => {
    expect(isCategoryRecipeKey('footwear')).toBe(true);
    expect(isCategoryRecipeKey('watches')).toBe(true);
    expect(isCategoryRecipeKey('not_a_real_recipe')).toBe(false);
    expect(isCategoryRecipeKey(7)).toBe(false);
  });

  it('looks a real one up by key; throws on an unknown one', () => {
    expect(categoryRecipe('watches').nameEn).toBe('Watches');
    expect(() => categoryRecipe('nope' as never)).toThrow(/unknown category recipe key/);
  });
});

describe('@extas/settings keeps the same 13 keys — the two lists can never drift apart silently', () => {
  it('names exactly the same 13 keys, in the same order, as CATEGORY_RECIPES', () => {
    expect(PHOTOSHOOT_RECIPE_KEYS).toEqual(CATEGORY_RECIPES.map((r) => r.key));
  });
});

describe('applyCategoryRecipeOverride', () => {
  it('returns the base recipe untouched when there is no override', () => {
    const base = categoryRecipe('footwear');
    expect(applyCategoryRecipeOverride(base)).toBe(base);
  });

  it('overrides only the fields the owner actually set, keeping every other default', () => {
    const base = categoryRecipe('footwear');
    const result = applyCategoryRecipeOverride(base, { angleCount: '8 (adds a strap close-up)' });
    expect(result.angleCount).toBe('8 (adds a strap close-up)');
    expect(result.engines).toBe(base.engines);
    expect(result.detailPoints).toBe(base.detailPoints);
    expect(result.modelLibrary).toBe(base.modelLibrary);
  });

  it('a `modelLibrary: null` override is itself a real choice — turning the model off — never confused with "not set"', () => {
    const base = categoryRecipe('caps');
    expect(base.modelLibrary).toBe('men');
    expect(applyCategoryRecipeOverride(base, { modelLibrary: null }).modelLibrary).toBeNull();
    expect(applyCategoryRecipeOverride(base, {}).modelLibrary).toBe('men');
  });

  it('overrides engines and detail points together', () => {
    const base = categoryRecipe('watches');
    const result = applyCategoryRecipeOverride(base, { engines: ['product_only'], detailPoints: ['dial', 'crown'] });
    expect(result.engines).toEqual(['product_only']);
    expect(result.detailPoints).toEqual(['dial', 'crown']);
  });
});

describe('effectiveCategoryRecipe', () => {
  function fakeSettings(overrides: Record<string, unknown>): SettingsReader {
    return {
      value: async (key: string) => (key === 'studio.photoshoot.recipeOverrides' ? overrides : undefined) as never,
    };
  }

  it('is the plain default when the store has overridden nothing', async () => {
    const result = await effectiveCategoryRecipe({ settings: fakeSettings({}) }, 1, 'footwear');
    expect(result).toEqual(categoryRecipe('footwear'));
  });

  it('applies only this family\'s own override, leaving every other family alone', async () => {
    const overrides = { footwear: { angleCount: '8' }, watches: { modelLibrary: null } };
    const footwear = await effectiveCategoryRecipe({ settings: fakeSettings(overrides) }, 1, 'footwear');
    expect(footwear.angleCount).toBe('8');
    const bags = await effectiveCategoryRecipe({ settings: fakeSettings(overrides) }, 1, 'bags');
    expect(bags).toEqual(categoryRecipe('bags'));
  });
});
