// S02 · the storefront, third batch — PR 53 (the first-screen budget). Registry version 21 (the checkout took 20). Labels:
// messages/shop-more.<lang>.json. The later PRs of the batch (67–71, 74, 75) add their keys here at the same version.
//
// The defaults reproduce the approved V12.2 demo (docs/demo/src/30-product.js PDP_FIT, Blueprint D2). CN-018: every
// number is a setting with limits; what the demo does not do by default is off.
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema, localizedTextSchema } from './schemas';
import { categorySlugSchema } from './registry-storefront';

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

// ---- PR 67 · "Wear it with" and "Recently viewed" (demo 30-product.js pdp_rowCats / pdp_pairsSection /
// pdp_recentSection, owner review P5 in 89x-owner-b.js) ----

const slugList = z.array(categorySlugSchema).max(12);

/**
 * The rows at the foot of the product page. The pairing rows pick their categories by the product's kind: a bottom
 * garment (the size-chart diagram setting) gets tops first, a top gets bottoms first, anything without a garment type
 * the third list; a category of the owner's own pairing (`byCategory`) comes before all of them. Categories that do
 * not exist or are empty are skipped, so the lists name the default pack's categories without needing them.
 */
export const pdpRowsSchema = z
  .object({
    pairs: z.boolean(),
    /** Phone: how many category rows (the first "Wear it with · …", the rest "You may also like · …"). */
    pairRows: z.int().min(1).max(3),
    perRow: z.int().min(2).max(12),
    /** Desktop: 'one' = one slider of the rows' products together (P5); 'rows' = the phone's rows. */
    deskStyle: z.enum(['one', 'rows']),
    deskMax: z.int().min(4).max(16),
    inStockOnly: z.boolean(),
    order: z.object({ top: slugList, bottom: slugList, other: slugList }).strict(),
    /** A garment type's kind when it is not the size-chart diagram's (bottom there = bottom; any other garment = top). */
    groupOf: z.record(dictionaryKeySchema, z.enum(['top', 'bottom', 'other'])),
    byCategory: z.record(categorySlugSchema, slugList),
    /** The owner's own words for "Wear it with" (null: the shop's words). */
    pairTitle: localizedTextSchema(40).nullable(),
    pairSpeed: z.number().min(4).max(80),
    recent: z.boolean(),
    recentMax: z.int().min(2).max(12),
    /** How many products this phone remembers (a cookie of product ids, nothing else). */
    recentKeep: z.int().min(4).max(30),
    /** Days the phone keeps the list. */
    recentDays: z.int().min(1).max(365),
    recentSpeed: z.number().min(4).max(80),
    /** Desktop: a grid of 4 that is never empty (recent first, then similar styles), changing every N seconds (0 = never). */
    deskGrid: z.boolean(),
    swapSec: z.int().min(0).max(600),
  })
  .strict()
  .refine((r) => r.recentMax <= r.recentKeep, { message: 'shows more than it remembers' });

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
  'pdp.rows': setting({
    ...json,
    group: 'productPage',
    schema: pdpRowsSchema,
    default: {
      pairs: true,
      pairRows: 2,
      perRow: 6,
      deskStyle: 'one',
      deskMax: 10,
      inStockOnly: true,
      order: {
        top: ['trousers', 'shirts', 'polos', 'tshirts', 'hoodies'],
        bottom: ['polos', 'shirts', 'tshirts', 'hoodies', 'panjabi'],
        other: ['polos', 'trousers', 'tshirts', 'shirts'],
      },
      groupOf: { accessory: 'other' },
      byCategory: {},
      pairTitle: null,
      pairSpeed: 24, // hardcode-ok: the demo's data-speed, px per second
      recent: true,
      recentMax: 6,
      recentKeep: 12,
      recentDays: 90,
      recentSpeed: 22, // hardcode-ok: the demo's data-speed, px per second
      deskGrid: true,
      swapSec: 35,
    },
    labelKey: 'pdp.rows.label',
    helpKey: 'pdp.rows.help',
    sortOrder: 140,
  }),
};

export type PdpFitSettings = z.output<typeof pdpFitSchema>;
export type PdpRowsSettings = z.output<typeof pdpRowsSchema>;
