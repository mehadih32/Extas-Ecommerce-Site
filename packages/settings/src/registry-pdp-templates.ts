// S02 · the product page templates and Find My Size — PR 50 (T2, the stacked gallery), PR 51 (T3, fit-first: the
// sizes, the finder and the measurements in one card), PR 52 (which template a page uses: the product's own choice at
// upload, else its category's, else the shop's default) and PR 58 (Find My Size: height and weight to a size from the
// owner's size chart, with the reasoning shown). Registry version 28. Labels: messages/pdp-templates.<lang>.json.
//
// The defaults reproduce the approved V12.2 demo (docs/demo/src/30-product.js pdp_galleryT2, pdp_t3Card, pdp_finderHTML,
// pdp_reasons; 02-core.js pdpTemplateFor, recommendSize; Blueprint D3.7 / D3.8 / D4.2). CN-018: every number is a
// setting with limits; the finder's arithmetic (the body estimate per measure, the tolerance, the length check) is the
// owner's to tune, and its ease is each size chart's own (S01, `catalogue.sizeCharts.defaultEaseInch` when a chart has
// none). Without a chart the finder is never offered.
import { z } from 'zod';
import { setting } from './define';
import { categorySlugSchema } from './registry-storefront';

const V = 28;

/** The product page templates the shop knows (T4 video-first and T5 combo-push come later, D3.7). */
export const PDP_TEMPLATES = ['T1', 'T2', 'T3'] as const;
export type PdpTemplate = (typeof PDP_TEMPLATES)[number];

export const pdpTemplatesSchema = z
  .object({
    /** The shop's template: every product whose own choice and category say nothing. */
    default: z.enum(PDP_TEMPLATES),
    /** A category's template (by its link name); a product in a sub-category takes the nearest one up the tree. It
     * wins over the template stored on the category itself. */
    byCategory: z
      .record(categorySlugSchema, z.enum(PDP_TEMPLATES))
      .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' }),
    /** The template chosen for a product at upload (D4.2) wins over its category's. */
    perProduct: z.boolean(),
    /** `?template=T2` on a product address shows that template (the admin's preview, PR 52); search engines are sent
     * to the plain address and never index it. */
    preview: z.boolean(),
    /** T2 · the stacked gallery (PR 50). */
    t2: z
      .object({
        /** Phone: each photo's share of the strip's width, so the next one peeks in (demo 88 %). */
        peekPct: z.int().min(60).max(100),
        /** Computer: the photos stacked in this many columns beside the buy column. */
        deskColumns: z.int().min(1).max(3),
        /** Computer: the buy column's width, px (demo 410). */
        deskBuyPx: z.int().min(320).max(560),
        /** Phone: the thumbnail strip under the photos. */
        thumbs: z.boolean(),
        /** The editorial title: the display face, a size larger. */
        editorialTitle: z.boolean(),
        /** The page on the plain surface colour instead of the shop's background. */
        surface: z.boolean(),
      })
      .strict(),
    /** T3 · fit-first (PR 51): the sizes, the finder and the measurements in one card. */
    t3: z
      .object({
        /** The finder's height and weight steppers inside the card (else only the sizes and measurements). */
        inlineFinder: z.boolean(),
        /** The chosen size's measurements as tiles under the finder. */
        measures: z.boolean(),
        /** The reasons open straight after "Show my size" (else behind "Why L?"). */
        whyOpen: z.boolean(),
        /** Computer: the thumbnails under the photo (demo) or down its side. */
        deskThumbs: z.enum(['below', 'side']),
      })
      .strict(),
  })
  .strict();

/** How a body measure is estimated from height and weight (cm): base + perKgCm × kg + perHeightCm × height in cm. */
export const finderBodySchema = z
  .object({
    /** The size chart's measurement key (`chest`, `waist`). */
    field: z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(40),
    kind: z.enum(['top', 'bottom']),
    baseCm: z.number().min(0).max(200),
    perKgCm: z.number().min(0).max(5),
    perHeightCm: z.number().min(0).max(2),
  })
  .strict();

const garmentKeySchema = z.string().regex(/^[a-z][a-z0-9-]*$/).max(40);

export const pdpFinderSchema = z
  .object({
    /** Find My Size on the product page (only where the product has a size chart the finder can read). */
    on: z.boolean(),
    /** The "Find my size" card under the sizes (T1, T2; T3 has it inside its size card). */
    card: z.boolean(),
    /** Where the height and weight steppers start for a first-time shopper. */
    startHeightIn: z.int().min(48).max(90),
    startWeightKg: z.int().min(30).max(200),
    /** The steppers' range. */
    heightMinIn: z.int().min(48).max(90),
    heightMaxIn: z.int().min(48).max(90),
    weightMinKg: z.int().min(30).max(200),
    weightMaxKg: z.int().min(30).max(200),
    /** The body estimate per measure, in order: the first measure the product's chart has decides. */
    body: z
      .array(finderBodySchema)
      .min(1)
      .max(8)
      .refine((l) => new Set(l.map((b) => b.field)).size === l.length, { message: 'one model per measure' }),
    /** A size still covers the need when it is short of it by at most this many inches. */
    toleranceInch: z.number().min(0).max(3),
    /** The length line: the size's length against a share of the height. */
    length: z
      .object({
        on: z.boolean(),
        field: z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(40),
        toleranceInch: z.number().min(0).max(6),
        topRatio: z.number().min(0.2).max(0.9),
        bottomRatio: z.number().min(0.2).max(0.9),
        byGarment: z
          .record(garmentKeySchema, z.number().min(0.2).max(0.9))
          .refine((r) => Object.keys(r).length <= 100, { message: 'at most 100 garment types' }),
      })
      .strict(),
    /** The shopper's height and weight kept on this phone (a small cookie, nothing else) for next time, so many days. */
    remember: z.boolean(),
    rememberDays: z.int().min(1).max(730),
    /** Each answer kept (height, weight, the size and its reasons; no name, no phone) for the size reports (PR 59). */
    record: z.boolean(),
    /** Press and hold a stepper: it starts repeating after `holdMs`, one step every `repeatMs`. */
    holdMs: z.int().min(150).max(2000),
    repeatMs: z.int().min(40).max(500),
  })
  .strict()
  .refine((f) => f.heightMinIn < f.heightMaxIn && f.weightMinKg < f.weightMaxKg, { message: 'the lowest is not below the highest' })
  .refine((f) => f.startHeightIn >= f.heightMinIn && f.startHeightIn <= f.heightMaxIn && f.startWeightKg >= f.weightMinKg && f.startWeightKg <= f.weightMaxKg, {
    message: 'the start is outside the range',
  });

const json = { scope: 'store', valueType: 'JSON', group: 'productPage', isOwnerData: false, isPublic: true, version: V } as const;

export const pdpTemplateSettings = {
  'pdp.templates': setting({
    ...json,
    schema: pdpTemplatesSchema,
    default: {
      default: 'T1',
      byCategory: {},
      perProduct: true,
      preview: true,
      t2: { peekPct: 88, deskColumns: 2, deskBuyPx: 410, thumbs: true, editorialTitle: true, surface: true }, // hardcode-ok: the demo's T2 strip (88 %) and its 410 px buy column
      t3: { inlineFinder: true, measures: true, whyOpen: true, deskThumbs: 'below' },
    },
    labelKey: 'pdp.templates.label',
    helpKey: 'pdp.templates.help',
    sortOrder: 130,
  }),
  'pdp.finder': setting({
    ...json,
    schema: pdpFinderSchema,
    default: {
      on: true,
      card: true,
      // hardcode-ok: the demo's first answer (5 ft 7 in, 66 kg) and stepper range (54–84 in, 35–150 kg)
      startHeightIn: 67, startWeightKg: 66, heightMinIn: 54, heightMaxIn: 84, weightMinKg: 35, weightMaxKg: 150,
      body: [
        { field: 'chest', kind: 'top', baseCm: 52, perKgCm: 0.55, perHeightCm: 0.035 }, // hardcode-ok: the demo's recommendSize (top)
        { field: 'waist', kind: 'bottom', baseCm: 26, perKgCm: 0.7, perHeightCm: 0.02 }, // hardcode-ok: the demo's recommendSize (bottom)
      ],
      toleranceInch: 0.5,
      length: {
        on: true,
        field: 'length',
        toleranceInch: 1,
        topRatio: 0.42,
        bottomRatio: 0.59,
        byGarment: { polo: 0.42, tee: 0.42, shirt: 0.44, hoodie: 0.415, panjabi: 0.6, trouser: 0.59 }, // hardcode-ok: the demo's PDP_LEN
      },
      remember: true,
      rememberDays: 365,
      record: true,
      holdMs: 450,
      repeatMs: 90,
    },
    labelKey: 'pdp.finder.label',
    helpKey: 'pdp.finder.help',
    sortOrder: 140,
  }),
};

export type PdpTemplatesSettings = z.output<typeof pdpTemplatesSchema>;
export type PdpFinderSettings = z.output<typeof pdpFinderSchema>;
export type FinderBodyModel = z.output<typeof finderBodySchema>;
