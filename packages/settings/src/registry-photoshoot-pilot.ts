// S24 · PR 462 (Blueprint C7.19 "run 20–30 real EXTAS products through two providers … A/B test on-model vs
// flat-lay on the live site, measuring add-to-bag, conversion and return rate"; registry version 292) — the
// pilot's own cohort: which products are actually in the live on-model-vs-flat-lay test, and what share of their
// visitors see the on-model style. CN-018: a pilot run on zero products, as it ships — the owner must actually
// pick the 20–30 real products C7.19 names before anything is ever bucketed; `@extas/photoshoot`'s
// `styleAbTest.ts` treats an empty `productIds` list exactly like "this product is not in the pilot" (see
// `isPilotProduct`) and assigns nothing. `splitPercent` mirrors the generic Experiments module's own `shareB`
// convention (S02, PR 83): the share of a pilot product's visitors shown the ON_MODEL style, the rest seeing the
// shop's own default (FLAT_LAY) — never the other way round, so turning the pilot off always returns every
// visitor to today's plain behaviour.
import { z } from 'zod';
import { setting } from './define';

const V = 292;

export const photoshootStyleAbTestSchema = z
  .object({
    /** The pilot's own 20–30 real products (C7.19) — empty, as it ships, means the pilot runs on nothing yet. */
    productIds: z.array(z.string().uuid()).max(50),
    /** Share of a pilot product's visitors shown ON_MODEL, 1–99%; the rest see FLAT_LAY. */
    splitPercent: z.number().int().min(1).max(99),
  })
  .strict();
export type PhotoshootStyleAbTestSettings = z.infer<typeof photoshootStyleAbTestSchema>;
export const PHOTOSHOOT_STYLE_AB_TEST_DEFAULT: PhotoshootStyleAbTestSettings = { productIds: [], splitPercent: 50 }; // hardcode-ok: the setting's own ship-off default (CN-018), not an invented business number

export const photoshootPilotSettings = {
  'studio.photoshoot.styleAbTest': setting({
    schema: photoshootStyleAbTestSchema,
    default: PHOTOSHOOT_STYLE_AB_TEST_DEFAULT,
    scope: 'store',
    valueType: 'JSON',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.styleAbTest.label',
    helpKey: 'studio.photoshoot.styleAbTest.help',
    sortOrder: 14,
    version: V,
  }),
};
