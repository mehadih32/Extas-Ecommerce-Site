// S24 · PR 470 (Blueprint C7.12 "Category recipes (defaults, all editable)", C7.22 item 27; registry version 293)
// — the owner's own edit of PR 469's own 13 defaults (`@extas/photoshoot`'s `recipes.ts`, `CATEGORY_RECIPES`).
// `@extas/settings` cannot import `@extas/photoshoot` (the dependency runs the other way — `@extas/photoshoot`
// already depends on `@extas/settings` for every other studio setting, e.g. `registry-photoshoot-queue.ts`), so
// this file names the same 13 keys as its own literal list rather than importing them; `@extas/photoshoot`'s own
// `recipes.test.ts` cross-checks the two lists stay identical, so they can never drift apart silently. CN-018:
// ships with nothing overridden — every family uses PR 469's own defaults until the owner changes one.
import { z } from 'zod';
import { setting } from './define';

const V = 293;

/** The same 13 keys `@extas/photoshoot`'s own `CATEGORY_RECIPES` names, verbatim and in the same order. */
export const PHOTOSHOOT_RECIPE_KEYS = [
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
] as const;

const recipeEngineSchema = z.enum(['ghost_mannequin', 'on_model', 'product_only', 'real_flat']);
const recipeModelLibrarySchema = z.enum(['men', 'ladies', 'kids', 'hand_wrist_face']);

/** One family's own override — every field optional, so the owner changes only what they mean to; an untouched
 * field keeps PR 469's own default. */
const recipeOverrideSchema = z
  .object({
    engines: z.array(recipeEngineSchema).min(1).max(4).optional(),
    angleCount: z.string().trim().min(1).max(80).optional(),
    detailPoints: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    modelLibrary: z.union([recipeModelLibrarySchema, z.null()]).optional(),
  })
  .strict();
export type PhotoshootRecipeOverride = z.infer<typeof recipeOverrideSchema>;

export const photoshootRecipeOverridesSchema = z
  .object(Object.fromEntries(PHOTOSHOOT_RECIPE_KEYS.map((k) => [k, recipeOverrideSchema.optional()])) as unknown as Record<(typeof PHOTOSHOOT_RECIPE_KEYS)[number], z.ZodOptional<typeof recipeOverrideSchema>>)
  .strict();
export type PhotoshootRecipeOverrides = z.infer<typeof photoshootRecipeOverridesSchema>;
export const PHOTOSHOOT_RECIPE_OVERRIDES_DEFAULT: PhotoshootRecipeOverrides = {}; // hardcode-ok: the setting's own ship-off default (CN-018) — nothing overridden

export const photoshootRecipeSettings = {
  'studio.photoshoot.recipeOverrides': setting({
    schema: photoshootRecipeOverridesSchema,
    default: PHOTOSHOOT_RECIPE_OVERRIDES_DEFAULT,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.recipeOverrides.label',
    helpKey: 'studio.photoshoot.recipeOverrides.help',
    sortOrder: 15,
    version: V,
  }),
};
