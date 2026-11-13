// S28 · admin prototype v5, wave 4 (PR 680-685) — the settings of the product screens, registry version 321.
//
// - `media.quality` (PR 680): the plain photo checks on Products › a product's photos (too small, blurry, too dark,
//   wrong shape, cut off). Off as it ships. No AI is called: the checks read the picture's own pixels with sharp.
//   Every number is the owner's to change; the one-click fix only reframes to the shop's 4:5 or lifts the light.
// - `catalogue.video` (PR 681): the product video — whether it may be added, which links are taken, whether the clip
//   is lazy (the player loads only when a customer taps play). Off as it ships.
// - `catalogue.faq` (PR 682): the questions and answers block on the product page. Off as it ships.
// - `catalogue.demo` (PR 684): demo (sample) products. Off as it ships.
import { z } from 'zod';
import { setting } from './define';

const V = 321;

export const mediaQualitySchema = z
  .object({
    on: z.boolean(),
    /** The shorter side of a photo, in pixels, below which it is "too small". */
    minSide: z.int().min(100).max(6000),
    /** The strongest edge in the picture (0-127): below this the photo is "blurry". */
    sharpnessMin: z.int().min(1).max(127),
    /** The average brightness (0-255): below this the photo is "too dark". */
    darkBelow: z.int().min(1).max(200),
    /** How far from the shop's shape (4:5) a photo may be before it is "wrong shape", in percent. */
    ratioTolerancePct: z.int().min(0).max(50),
    /** How busy the picture's outer edge may be (0-128) before a garment is "cut off". */
    edgeBusy: z.int().min(1).max(128),
  })
  .strict();
export type MediaQualitySettings = z.output<typeof mediaQualitySchema>;

export const catalogueVideoSchema = z
  .object({
    /** The switch: while off no video can be added and none shows on the product page. */
    on: z.boolean(),
    /** Which links are taken. */
    providers: z.array(z.enum(['YOUTUBE', 'VIMEO', 'FACEBOOK'])).max(3),
    /** An uploaded clip may be added (stored as it is; making it lighter stays a mock until a transcoder is connected). */
    allowUpload: z.boolean(),
    /** The largest uploaded clip, in megabytes. */
    maxUploadMb: z.int().min(1).max(500),
    /** The player loads only when a customer taps play (the page stays fast). */
    playOnTap: z.boolean(),
  })
  .strict();
export type CatalogueVideoSettings = z.output<typeof catalogueVideoSchema>;

export const catalogueFaqSchema = z
  .object({
    /** The switch: while off no FAQ shows on a product page. */
    on: z.boolean(),
    /** Show the shop-wide questions on every product page too. */
    includeShop: z.boolean(),
    /** Most questions on one product page (product first, then category, then shop-wide). */
    max: z.int().min(1).max(50),
    /** The questions are written as FAQ markup for search engines (also needs the shop's FAQ markup switch). */
    markup: z.boolean(),
  })
  .strict();
export type CatalogueFaqSettings = z.output<typeof catalogueFaqSchema>;

export const catalogueErpSizeChartSchema = z
  .object({
    /** The switch: while off the product screens do not offer the ERP's size chart. */
    on: z.boolean(),
    /** Where the chart comes from: a sample chart (MOCK) until the ERP ships it, then the ERP. */
    source: z.enum(['MOCK', 'ERP']),
  })
  .strict();
export type CatalogueErpSizeChartSettings = z.output<typeof catalogueErpSizeChartSchema>;

export const catalogueDemoSchema = z
  .object({
    /** The master switch: while off no demo product shows anywhere in the shop. */
    on: z.boolean(),
    /** Categories where demo products are turned off (a category's whole branch goes with it). */
    off: z.array(z.uuid()).max(500),
    /** Hide the demo products of a category by themselves once it has enough real products. */
    auto: z.boolean(),
    /** How many real products a category needs before its demo products hide. */
    autoN: z.int().min(1).max(500),
    /** The price a demo product shows, in minor units (paisa). */
    samplePriceMinor: z.int().min(100).max(100_000_000),
    /** The pop-up a customer sees on Add to bag of a demo product, in English and Bengali. */
    popupEn: z.string().trim().min(1).max(300),
    popupBn: z.string().trim().min(1).max(300),
  })
  .strict();
export type CatalogueDemoSettings = z.output<typeof catalogueDemoSchema>;

export const productsV5Settings = {
  'media.quality': setting({
    schema: mediaQualitySchema,
    // hardcode-ok: shipped defaults (off); every number is edited on Products › photos › Media settings
    default: {
      on: false,
      minSide: 800,
      sharpnessMin: 24,
      darkBelow: 70,
      ratioTolerancePct: 2,
      edgeBusy: 30,
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'media',
    labelKey: 'media.quality.label',
    helpKey: 'media.quality.help',
    isOwnerData: false,
    sortOrder: 270,
    version: V,
  }),
  'catalogue.video': setting({
    schema: catalogueVideoSchema,
    // hardcode-ok: shipped defaults (off); edited on Products › a product › Video › More options
    default: { on: false, providers: ['YOUTUBE', 'VIMEO', 'FACEBOOK'], allowUpload: true, maxUploadMb: 50, playOnTap: true },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.video.label',
    helpKey: 'catalogue.video.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 270,
    version: V,
  }),
  'catalogue.faq': setting({
    schema: catalogueFaqSchema,
    // hardcode-ok: shipped defaults (off); edited on Products › FAQs › More options
    default: { on: false, includeShop: true, max: 12, markup: true },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.faq.label',
    helpKey: 'catalogue.faq.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 271,
    version: V,
  }),
  'catalogue.erpSizeChart': setting({
    schema: catalogueErpSizeChartSchema,
    // hardcode-ok: shipped defaults (off, sample chart); edited on Products › a product › Size chart › More options
    default: { on: false, source: 'MOCK' },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.erpSizeChart.label',
    helpKey: 'catalogue.erpSizeChart.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 272,
    version: V,
  }),
  'catalogue.demo': setting({
    schema: catalogueDemoSchema,
    // hardcode-ok: shipped defaults (off); every value is edited on Products › Demo products
    default: {
      on: false,
      off: [],
      auto: true,
      autoN: 5,
      samplePriceMinor: 99900, // hardcode-ok: the demo sample price as shipped, a setting default the owner edits
      popupEn: 'This product is coming soon. See what is available now.',
      popupBn: 'এই প্রোডাক্টটা শিগগিরই আসছে। এখন যা আছে সেগুলো দেখুন।',
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.demo.label',
    helpKey: 'catalogue.demo.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 273,
    version: V,
  }),
};
