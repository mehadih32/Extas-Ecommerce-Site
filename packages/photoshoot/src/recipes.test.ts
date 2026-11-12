// S24 · PR 469 — pure tests for the general category/recipe catalogue: no database needed.
import { describe, expect, it } from 'vitest';
import { DETAIL_FINDER_GARMENT_TYPES } from './detailRegions';
import { CATEGORY_RECIPES, RECIPE_ENGINES, RECIPE_MODEL_LIBRARIES, categoryRecipe, isCategoryRecipeKey, isRecipeEngine, isRecipeModelLibrary } from './recipes';

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
