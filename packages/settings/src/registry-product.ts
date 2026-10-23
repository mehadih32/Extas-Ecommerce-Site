// S02 · the product page — PR 49 (template T1: gallery left, buy column right, the phone's buy bar, the desktop's bar),
// 54 (gallery: arrows, thumbnails, swipe, zoom), 55 (colours and "All N colours"), 56 (size pills), 57 (size chart
// popup), 60 (stock line), 61 (price block), 62 (trust row), 63 (Delivery · Exchange · Returns), 64 (Fabric & care and
// the detail accordions). Registry version 19. Labels: messages/storefront.<lang>.json (`pdp.*`).
//
// The defaults reproduce the approved V12.2 demo (docs/demo/src/30-product.js: SHOWN.pdp, SHOWN.pdpSweep,
// SHOWN.pdpPrice, PDP_ALLC_UP_FROM) and Blueprint D3.5–D3.8. CN-018: every number and policy is a setting with
// options; what the demo does not do by default is off, and a line that makes a promise ("ships today", "100%
// original", "try it on in front of the rider", "call to order") is off until the owner switches it on with his own
// facts. The words are keys of the shop dictionary (apps/web/messages/shop.<lang>.json, `pdp.*`), so every block name
// is the owner's to change through `language.labels`.
import { z } from 'zod';
import { setting } from './define';
import { localizedTextSchema } from './schemas';
import { categorySlugSchema } from './registry-storefront';

const V = 19;
/** PR 66 (the questions block) and PR 86 (the sweeps of the rest of the shop). */
const V31 = 31;

const uniqueIds = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id)).size === list.length;
const UNIQUE = { message: 'every id must be unique' };

/** The drawing views a product shows until its photos are uploaded (demo PDP_VIEWS). */
export const PDP_DRAWING_VIEWS = ['front', 'back', 'detail', 'model', 'flat'] as const;

/** Where a colour's own address points search engines (Blueprint D3.7: default the main product). */
export const PDP_CANONICAL = ['main', 'colour'] as const;

export const pdpPageSchema = z
  .object({
    /** The breadcrumb (Home / category / product) above the page on a computer; the phone never shows it (demo). */
    breadcrumb: z.boolean(),
    /** Each colour has its own address, `/p/<product>/<colour>`, opening the page on that colour (D3.7). */
    colourPaths: z.boolean(),
    /** Where a colour's address sends search engines: the main product, or the colour page itself. */
    canonical: z.enum(PDP_CANONICAL),
    /** The same choice for one category (D3.7 "configurable per category"). */
    canonicalByCategory: z
      .record(categorySlugSchema, z.enum(PDP_CANONICAL))
      .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' }),
  })
  .strict();

export const pdpGallerySchema = z
  .object({
    /** The ‹ › buttons over the main photo. */
    arrows: z.boolean(),
    /** The thumbnail strip. */
    thumbs: z.boolean(),
    /** Computer: the thumbnails down the side of the photo, or under it (D3.5 "per-store option"). */
    thumbsDesktop: z.enum(['side', 'below']),
    /** A tap, double tap or pinch opens the photo full screen (demo 31-zoom.js). */
    zoom: z.boolean(),
    /** The drawing's views while a product has no photo of that colour yet. */
    drawingViews: z.array(z.enum(PDP_DRAWING_VIEWS)).min(1).max(PDP_DRAWING_VIEWS.length),
    /** The product's first tag ("New", "Bestseller") or its discount on the first photo. */
    badge: z.boolean(),
    /** The full-screen viewer's largest zoom on a phone (pinch, double tap goes to the first step). */
    zoomMax: z.number().min(1.5).max(8),
    /** A computer's click steps in the full-screen viewer, smallest first (demo `pdp.zoomSteps`). */
    zoomSteps: z
      .array(z.number().min(1.1).max(8))
      .min(1)
      .max(6)
      .refine((l) => l.every((v, i) => i === 0 || v > l[i - 1]!), { message: 'each step larger than the one before' }),
    /** Computer: how many px shorter than 4:5 the main photo is, so the whole picture sits in the first screen (demo
     * owner B P1, `pdp.galleryTrim`; 0 = the full 4:5 photo). */
    desktopTrimPx: z.int().min(0).max(200),
    /** Computer, thumbnails down the side: at most this many; the last one says "+N" when there are more (demo P8). */
    thumbsMax: z.int().min(2).max(12),
  })
  .strict();

export const pdpColourSchema = z
  .object({
    /** From this many colours, "All N colours" moves up to the "Colour – Navy" line; fewer: after the last swatch. */
    allColoursFrom: z.int().min(2).max(30),
    /** "All N colours" and its sheet with every colour's photo. */
    allColours: z.boolean(),
    /** The colour's own note under the swatches (D3.5: off, it pushed the first screen down). */
    note: z.boolean(),
    /** "See true-colour photo" under the swatches, when the colour has one (D3.5: off). */
    trueColourLink: z.boolean(),
  })
  .strict();

export const pdpSizeSchema = z
  .object({
    /** The measurement line under the sizes ("M fits chest up to 40 in · length 28 in"). */
    measureLine: z.boolean(),
    /** The inches / cm switch on the page (D3.5: off, cm lives inside the size chart). */
    unitToggle: z.boolean(),
    /** The "Runs small · True to size · Runs large" bar (D3.5: off). */
    fitBar: z.boolean(),
    /** A size sold out in every colour: crossed out (SIM-F-035), or left out. */
    soldOutEverywhere: z.enum(['cross', 'hide']),
    /** SIM-F-035: a crossed-out size (or a product off sale) asks "tell me when it is back" and keeps the shopper's
     * number in the back-in-stock list (PR 36). Off until the alert that answers it is sent (PR 71). */
    notifyBack: z.boolean(),
  })
  .strict();

export const pdpChartSchema = z
  .object({
    /** The "Size chart" button and its popup (shown only when the product has a chart). */
    on: z.boolean(),
    /** The unit the popup opens in. */
    unit: z.enum(['inch', 'cm']),
    /** "How to measure" under the table. */
    howTo: z.boolean(),
    /** The "Still unsure? Ask on WhatsApp" card (needs the shop's WhatsApp number). */
    askWhatsapp: z.boolean(),
  })
  .strict();

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'a time like 17:00' });

export const pdpStockSchema = z
  .object({
    /** The stock line above the buttons. */
    line: z.boolean(),
    /** "Only N left" from this many pieces down (0 = never). */
    lowAt: z.int().min(0).max(50),
    /** The same short line on the first photo (D3.5 "a better place": the eye lands there first). */
    lowChip: z.boolean(),
    /** "Ships today if you order before …": the owner's dispatch time, in the store's time zone. Empty: not said. */
    dispatchCutoff: clockSchema.nullable(),
  })
  .strict();

export const pdpPriceSchema = z
  .object({
    /** A discounted product puts the struck price, the percentage and the saving after the bar (demo default). */
    discountAfterBar: z.boolean(),
    /** The payment line after the bar when the product has no free delivery. */
    payLine: z
      .object({
        on: z.boolean(),
        /** The owner's own words ("COD | bKash | Nagad"); empty: the methods that are switched on (Cash on Delivery). */
        text: localizedTextSchema(80).nullable(),
      })
      .strict(),
  })
  .strict();

export const PDP_TRUST_ITEMS = ['exchange', 'freeDelivery', 'original'] as const;
export const pdpTrustSchema = z
  .object({
    on: z.boolean(),
    /** In the order drawn. Each shows only while its fact is true (exchange on, a free-delivery limit set). */
    items: z
      .array(z.object({ id: z.enum(PDP_TRUST_ITEMS), on: z.boolean() }).strict())
      .max(PDP_TRUST_ITEMS.length)
      .refine(uniqueIds, UNIQUE),
  })
  .strict();

export const PDP_RULE_CELLS = ['delivery', 'exchange', 'returns'] as const;
export const pdpRulesSchema = z
  .object({
    on: z.boolean(),
    /** The cells, in order; each takes its words from the live Smart Rules for the product page (PR 208–216). */
    cells: z
      .array(z.object({ id: z.enum(PDP_RULE_CELLS), on: z.boolean() }).strict())
      .max(PDP_RULE_CELLS.length)
      .refine(uniqueIds, UNIQUE),
    /** "Try it on in front of the rider" under the cells (a delivery promise: the owner's). */
    trialLine: z.boolean(),
  })
  .strict();

export const PDP_DETAIL_BLOCKS = ['fabric', 'fit', 'desc'] as const;
export const pdpDetailsSchema = z
  .object({
    /** The accordions, in order: closed, open, or open to their first line with "Read more" (D3.6). */
    blocks: z
      .array(z.object({ id: z.enum(PDP_DETAIL_BLOCKS), on: z.boolean(), open: z.enum(['closed', 'peek', 'open']) }).strict())
      .max(PDP_DETAIL_BLOCKS.length)
      .refine(uniqueIds, UNIQUE),
  })
  .strict();

export const pdpBuySchema = z
  .object({
    /** "Order Now" beside "Add to Bag" (it adds the piece and goes straight to checkout). */
    orderNow: z.boolean(),
    /** The phone's buy bar held at the bottom of the screen (the bottom menu hides on this page). */
    phoneBar: z.boolean(),
    /** The computer's bar that slides in under the header once the buttons have scrolled away. */
    desktopBar: z.boolean(),
    /** "Call to order" with the shop's phone number and hours (SIM-F-046), for buyers who will not type. */
    callToOrder: z.boolean(),
  })
  .strict();

/** The light sweeps of the demo (SHOWN.pdpSweep), each on its own switch. */
export const pdpSweepSchema = z
  .object({
    freeDelivery: z.boolean(),
    stock: z.boolean(),
    allColours: z.boolean(),
    colourLabel: z.boolean(),
    sizeLabel: z.boolean(),
    sizePills: z.boolean(),
  })
  .strict();

/** PR 66 — "Questions & answers" under the product page (demo pdp_qaSection, R14 14.14). Only questions the shop has
 * answered and approved are shown; none is ever made up. */
export const pdpQaSchema = z
  .object({
    on: z.boolean(),
    /** The latest answered question in its own box, open, with who answered it; the rest are folded under it. */
    featured: z.boolean(),
    /** Folded questions shown before "See all questions". */
    shown: z.int().min(1).max(20),
    /** The most questions read for one product. */
    max: z.int().min(1).max(50),
    /** "Answered by the <shop> team · <date>" under the open answer. */
    answeredBy: z.boolean(),
    /** "Not answered here?" with the WhatsApp button (only while the shop has a WhatsApp number). */
    askWhatsapp: z.boolean(),
  })
  .strict()
  .refine((v) => v.shown <= v.max, { message: 'shown must not be more than max' });

const json = { scope: 'store', valueType: 'JSON', group: 'productPage', isOwnerData: false, isPublic: true, version: V } as const;

export const productSettings = {
  'pdp.page': setting({
    ...json,
    schema: pdpPageSchema,
    default: { breadcrumb: true, colourPaths: true, canonical: 'main', canonicalByCategory: {} },
    labelKey: 'pdp.page.label',
    helpKey: 'pdp.page.help',
    sortOrder: 10,
  }),
  'pdp.gallery': setting({
    ...json,
    schema: pdpGallerySchema,
    default: { arrows: true, thumbs: true, thumbsDesktop: 'side', zoom: true, drawingViews: [...PDP_DRAWING_VIEWS], badge: true, zoomMax: 4, zoomSteps: [1.8, 2.6, 3.6], desktopTrimPx: 78, thumbsMax: 5 }, // hardcode-ok: the demo's ZOOM.max, zoom steps, pdp.galleryTrim and pdp.thumbMax
    labelKey: 'pdp.gallery.label',
    helpKey: 'pdp.gallery.help',
    sortOrder: 20,
  }),
  'pdp.colour': setting({
    ...json,
    schema: pdpColourSchema,
    default: { allColoursFrom: 6, allColours: true, note: false, trueColourLink: false }, // hardcode-ok: the demo's PDP_ALLC_UP_FROM
    labelKey: 'pdp.colour.label',
    helpKey: 'pdp.colour.help',
    sortOrder: 30,
  }),
  'pdp.size': setting({
    ...json,
    schema: pdpSizeSchema,
    default: { measureLine: true, unitToggle: false, fitBar: false, soldOutEverywhere: 'cross', notifyBack: false },
    labelKey: 'pdp.size.label',
    helpKey: 'pdp.size.help',
    sortOrder: 40,
  }),
  'pdp.chart': setting({
    ...json,
    schema: pdpChartSchema,
    default: { on: true, unit: 'inch', howTo: true, askWhatsapp: true },
    labelKey: 'pdp.chart.label',
    helpKey: 'pdp.chart.help',
    sortOrder: 50,
  }),
  'pdp.stock': setting({
    ...json,
    schema: pdpStockSchema,
    default: { line: true, lowAt: 3, lowChip: true, dispatchCutoff: null }, // hardcode-ok: the demo's "only 3 left" line
    labelKey: 'pdp.stock.label',
    helpKey: 'pdp.stock.help',
    sortOrder: 60,
  }),
  'pdp.price': setting({
    ...json,
    schema: pdpPriceSchema,
    default: { discountAfterBar: true, payLine: { on: true, text: null } },
    labelKey: 'pdp.price.label',
    helpKey: 'pdp.price.help',
    sortOrder: 70,
  }),
  'pdp.trust': setting({
    ...json,
    schema: pdpTrustSchema,
    default: {
      on: true,
      items: [
        { id: 'exchange', on: true },
        { id: 'freeDelivery', on: true },
        // CN-009: "100% original" is the owner's to switch on
        { id: 'original', on: false },
      ],
    },
    labelKey: 'pdp.trust.label',
    helpKey: 'pdp.trust.help',
    sortOrder: 80,
  }),
  'pdp.rules': setting({
    ...json,
    schema: pdpRulesSchema,
    default: {
      on: true,
      cells: PDP_RULE_CELLS.map((id) => ({ id, on: true })),
      trialLine: false,
    },
    labelKey: 'pdp.rules.label',
    helpKey: 'pdp.rules.help',
    sortOrder: 90,
  }),
  'pdp.details': setting({
    ...json,
    schema: pdpDetailsSchema,
    default: {
      blocks: [
        { id: 'fabric', on: true, open: 'peek' },
        { id: 'fit', on: true, open: 'closed' },
        { id: 'desc', on: true, open: 'closed' },
      ],
    },
    labelKey: 'pdp.details.label',
    helpKey: 'pdp.details.help',
    sortOrder: 100,
  }),
  'pdp.buy': setting({
    ...json,
    schema: pdpBuySchema,
    default: { orderNow: true, phoneBar: true, desktopBar: true, callToOrder: false },
    labelKey: 'pdp.buy.label',
    helpKey: 'pdp.buy.help',
    sortOrder: 110,
  }),
  'pdp.sweep': setting({
    ...json,
    schema: pdpSweepSchema,
    default: { freeDelivery: true, stock: true, allColours: true, colourLabel: true, sizeLabel: true, sizePills: true },
    labelKey: 'pdp.sweep.label',
    helpKey: 'pdp.sweep.help',
    sortOrder: 120,
  }),
  'pdp.qa': setting({
    ...json,
    version: V31,
    schema: pdpQaSchema,
    default: { on: true, featured: true, shown: 3, max: 12, answeredBy: true, askWhatsapp: true }, // hardcode-ok: the demo's SHOWN_QA (R14 14.14)
    labelKey: 'pdp.qa.label',
    helpKey: 'pdp.qa.help',
    sortOrder: 130,
  }),
};

export type PdpPageSettings = z.output<typeof pdpPageSchema>;
export type PdpGallerySettings = z.output<typeof pdpGallerySchema>;
export type PdpColourSettings = z.output<typeof pdpColourSchema>;
export type PdpSizeSettings = z.output<typeof pdpSizeSchema>;
export type PdpChartSettings = z.output<typeof pdpChartSchema>;
export type PdpStockSettings = z.output<typeof pdpStockSchema>;
export type PdpPriceSettings = z.output<typeof pdpPriceSchema>;
export type PdpTrustSettings = z.output<typeof pdpTrustSchema>;
export type PdpRulesSettings = z.output<typeof pdpRulesSchema>;
export type PdpDetailsSettings = z.output<typeof pdpDetailsSchema>;
export type PdpBuySettings = z.output<typeof pdpBuySchema>;
export type PdpSweepSettings = z.output<typeof pdpSweepSchema>;
export type PdpQaSettings = z.output<typeof pdpQaSchema>;
