// S02 · the storefront, third batch — PR 53 (the first-screen budget). Registry version 21 (the checkout took 20). Labels:
// messages/shop-more.<lang>.json. The later PRs of the batch (67–71, 74, 75) add their keys here at the same version.
//
// The defaults reproduce the approved V12.2 demo (docs/demo/src/30-product.js PDP_FIT, Blueprint D2). CN-018: every
// number is a setting with limits; what the demo does not do by default is off.
import { z } from 'zod';
import { setting } from './define';

const V = 21;

// ---- PR 53 · the first-screen budget (Blueprint D2, demo PDP_FIT) ----

/**
 * The one place the compulsory first-screen rule is configured (D2: "a builder changing first-screen fit changes it
 * there and nowhere else"). On a phone the photo is the slack of the first screen: its height is set so the size row
 * and the measurement line end just above the buy bar, between the photo's floor and ceiling. Nothing here knows a
 * category, so a category that does not exist yet obeys it with no new code.
 */
export const pdpFitSchema = z
  .object({
    /** Px of air between the last block of the buy column and the top of the buy bar (when the measurement line ends
     * the first screen it sits in the middle of its room instead: the air under it equals its own top margin). */
    clearPx: z.number().min(0).max(24),
    /** The photo's floor: the smaller of these two, so a short screen may shrink the photo further than a tall one. */
    photoMinPx: z.int().min(60).max(600),
    photoMinVh: z.number().min(0.05).max(0.6),
    /** Below this the photo never goes, however short the screen. */
    photoFloorPx: z.int().min(40).max(300),
    /** The photo's ceiling: the smaller of these two. */
    photoMaxPx: z.int().min(120).max(1200),
    photoMaxVh: z.number().min(0.2).max(0.9),
    /** While the photo stays at least this share of the screen tall, a deeper block (the Find my size card, PR 58) may
     * end the first screen instead of the measurement line. */
    deepVh: z.number().min(0.1).max(0.9),
    /** Last resort for a very tall product on a very short screen: the column's own gaps give up a few pixels. */
    tight: z.boolean(),
  })
  .strict()
  .refine((f) => f.photoMinVh <= f.photoMaxVh, { message: 'the floor is higher than the ceiling' })
  .refine((f) => f.photoMinPx <= f.photoMaxPx, { message: 'the floor is higher than the ceiling' });

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: true, version: V } as const;

export const shopMoreSettings = {
  'pdp.fit': setting({
    ...json,
    group: 'productPage',
    schema: pdpFitSchema,
    default: { clearPx: 4.75, photoMinPx: 150, photoMinVh: 0.2, photoFloorPx: 90, photoMaxPx: 500, photoMaxVh: 0.52, deepVh: 0.345, tight: true }, // hardcode-ok: the demo's PDP_FIT
    labelKey: 'pdp.fit.label',
    helpKey: 'pdp.fit.help',
    sortOrder: 130,
  }),
};

export type PdpFitSettings = z.output<typeof pdpFitSchema>;
