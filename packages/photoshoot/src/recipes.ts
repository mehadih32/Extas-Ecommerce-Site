// S24 · PR 469 (Blueprint C7.12 "All product families — three engines cover everything … Category recipes
// (defaults, all editable)", C7.22 item 26) — the general category/recipe framework `detailRegions.ts`'s own
// comment already promised ("a narrow, Detail-Finder-only vocabulary, never the general category/recipe framework
// PR 469–470 build later for shot planning"): C7.12's own 13-row table, verbatim and in its own order, as real
// data rather than only blueprint prose — which of the three engines (on-model, ghost mannequin, product-only) a
// product family uses, how many angles, which detail points, and which model library.
//
// Every family already built as its own engine (ghost mannequin PR 446, footwear PR 465/466) keeps its own, more
// specific vocabulary: `detailRegions.ts`'s own `DETAIL_FINDER_GARMENT_TYPES` is finer-grained than this table's
// own family groupings ("Polo / tee / shirt / panjabi" is ONE recipe row here but FOUR separate Detail Finder
// types there) — this module is the coarser, descriptive catalogue C7.12 itself states, never a replacement for
// what already works, the same "don't rebuild, point at the real thing" discipline `costBook.ts` (PR 468) already
// set for the seven AI 360 sub-jobs. `detailFinderGarmentTypes` below is that pointer, empty for every family
// nobody has wired a real checklist for yet.
//
// Part 2 (PR 470) adds the owner's own "(defaults, all editable)" override on top of this pure catalogue.
export const RECIPE_ENGINES = ['ghost_mannequin', 'on_model', 'product_only', 'real_flat'] as const;
export type RecipeEngine = (typeof RECIPE_ENGINES)[number];
export const isRecipeEngine = (v: unknown): v is RecipeEngine => typeof v === 'string' && (RECIPE_ENGINES as readonly string[]).includes(v);

/** C7.12's own named model libraries (men, ladies, kids, hand/wrist/face part-models) — `null` when the recipe
 * names no model at all (a still life), or names one but off by default (kidswear: "the default … is ghost
 * mannequin or flat-lay, not a child model … can be enabled later if the owner wants it"). */
export const RECIPE_MODEL_LIBRARIES = ['men', 'ladies', 'kids', 'hand_wrist_face'] as const;
export type RecipeModelLibrary = (typeof RECIPE_MODEL_LIBRARIES)[number];
export const isRecipeModelLibrary = (v: unknown): v is RecipeModelLibrary => typeof v === 'string' && (RECIPE_MODEL_LIBRARIES as readonly string[]).includes(v);

export interface CategoryRecipeDef {
  /** Stable, never reused once shipped — the same discipline as `ASSET_ROLES`/`PHOTOSHOOT_SUB_JOBS`. */
  key: string;
  nameEn: string;
  nameBn: string;
  /** C7.12 lists more than one engine for most rows (e.g. "ghost + on-model"): every row mixes shots, never a
   * single rigid choice. */
  engines: readonly RecipeEngine[];
  /** C7.12's own angle count, kept as its own descriptive text rather than forced into one shape — the table
   * itself mixes a plain count ("3"), a range ("3–4") and a named list ("6 (three-quarter, side, top, back, sole,
   * detail)"). */
  angleCount: string;
  /** C7.12's own detail points for this family, as stable snake_case keys (never shown to the owner as-is; a
   * later admin screen's own label text is not this PR's scope, the same "no screen reads it yet" gap
   * `costBook.ts` already left). */
  detailPoints: readonly string[];
  modelLibrary: RecipeModelLibrary | null;
  /** `detailRegions.ts`'s own `DetailFinderGarmentType` keys that already implement this family's real detail
   * checklist, when any have been built — empty until a later PR wires this family's own Detail Finder type. */
  detailFinderGarmentTypes: readonly string[];
}

/** C7.12's own 13 recipes, verbatim and in its own order. */
export const CATEGORY_RECIPES: readonly CategoryRecipeDef[] = [
  { key: 'polo_tee_shirt_panjabi', nameEn: 'Polo / tee / shirt / panjabi', nameBn: 'পোলো / টি-শার্ট / শার্ট / পাঞ্জাবি', engines: ['ghost_mannequin', 'on_model'], angleCount: '3–4', detailPoints: ['side_tape', 'side_vent', 'collar_tape', 'placket', 'cuff', 'chest_logo'], modelLibrary: 'men', detailFinderGarmentTypes: ['polo', 'shirt', 'panjabi'] },
  { key: 'trouser_denim_chino', nameEn: 'Trouser / denim / chino', nameBn: 'ট্রাউজার / ডেনিম / চিনো', engines: ['ghost_mannequin', 'on_model'], angleCount: '3', detailPoints: ['rivets', 'pocket_stitch', 'label', 'zip_and_hardware'], modelLibrary: 'men', detailFinderGarmentTypes: ['denim_chino'] },
  { key: 'ladies_garments', nameEn: 'Ladies garments', nameBn: 'লেডিস পোশাক', engines: ['ghost_mannequin', 'on_model'], angleCount: '3–4', detailPoints: ['neckline', 'sleeve', 'print', 'trim'], modelLibrary: 'ladies', detailFinderGarmentTypes: [] },
  { key: 'kidswear', nameEn: 'Kidswear', nameBn: 'শিশুদের পোশাক', engines: ['ghost_mannequin', 'real_flat'], angleCount: '2–3', detailPoints: ['print', 'trim', 'button'], modelLibrary: null, detailFinderGarmentTypes: [] },
  { key: 'footwear', nameEn: 'Footwear', nameBn: 'জুতা', engines: ['product_only'], angleCount: '6 (three-quarter, side, top, back, sole, detail)', detailPoints: ['sole_pattern', 'stitching', 'logo', 'eyelets'], modelLibrary: null, detailFinderGarmentTypes: ['footwear'] },
  { key: 'bags', nameEn: 'Bags', nameBn: 'ব্যাগ', engines: ['product_only', 'on_model'], angleCount: '5', detailPoints: ['handle', 'zip_pull', 'lining', 'logo_plate', 'feet'], modelLibrary: 'men', detailFinderGarmentTypes: [] },
  { key: 'wallets', nameEn: 'Wallets', nameBn: 'ওয়ালেট', engines: ['product_only'], angleCount: '4', detailPoints: ['open', 'card_slots', 'stitching', 'logo'], modelLibrary: 'hand_wrist_face', detailFinderGarmentTypes: [] },
  { key: 'belts', nameEn: 'Belts', nameBn: 'বেল্ট', engines: ['product_only', 'on_model'], angleCount: '4', detailPoints: ['buckle_macro', 'keeper', 'leather_grain', 'tip'], modelLibrary: 'men', detailFinderGarmentTypes: [] },
  { key: 'caps', nameEn: 'Caps', nameBn: 'ক্যাপ', engines: ['on_model', 'product_only'], angleCount: '4', detailPoints: ['front_logo', 'back_closure', 'under_visor', 'eyelets'], modelLibrary: 'men', detailFinderGarmentTypes: [] },
  { key: 'sunglasses', nameEn: 'Sunglasses', nameBn: 'সানগ্লাস', engines: ['on_model', 'product_only'], angleCount: '4', detailPoints: ['hinge', 'temple_logo', 'lens', 'nose_pad'], modelLibrary: 'hand_wrist_face', detailFinderGarmentTypes: [] },
  { key: 'watches', nameEn: 'Watches', nameBn: 'ঘড়ি', engines: ['on_model', 'product_only'], angleCount: '5', detailPoints: ['dial', 'crown', 'bracelet_links', 'clasp', 'caseback'], modelLibrary: 'hand_wrist_face', detailFinderGarmentTypes: [] },
  { key: 'perfume', nameEn: 'Perfume', nameBn: 'পারফিউম', engines: ['product_only'], angleCount: '3–4', detailPoints: ['cap', 'label', 'liquid_level', 'embossing'], modelLibrary: null, detailFinderGarmentTypes: [] },
  { key: 'socks_ties_small_goods', nameEn: 'Socks / ties / small goods', nameBn: 'মোজা / টাই / ছোট জিনিস', engines: ['real_flat', 'product_only'], angleCount: '2–3', detailPoints: ['weave', 'tip', 'label'], modelLibrary: null, detailFinderGarmentTypes: [] },
] as const;

export type CategoryRecipeKey = (typeof CATEGORY_RECIPES)[number]['key'];

export const isCategoryRecipeKey = (v: unknown): v is CategoryRecipeKey => typeof v === 'string' && CATEGORY_RECIPES.some((r) => r.key === v);

export function categoryRecipe(key: CategoryRecipeKey): CategoryRecipeDef {
  const found = CATEGORY_RECIPES.find((r) => r.key === key);
  if (!found) throw new Error(`unknown category recipe key: ${key}`);
  return found;
}
