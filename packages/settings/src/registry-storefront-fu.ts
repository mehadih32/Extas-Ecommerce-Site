// S02 / S04 · the storefront follow-ups (PROGRESS.md "Follow-ups" 21, 24, 35, 36, 57, 58, 61, 62, 75): scope added to
// storefront PRs already merged. Registry version 25 (the parallel back-office follow-ups took 24). Labels:
// messages/storefront-fu.<lang>.json. No admin screen (CN-019): the keys live with their sections and are set through
// the settings store until the owner's admin architecture is approved.
//
// CN-018: what the approved demo does by default keeps the demo's default; everything else is off.
import { z } from 'zod';
import { setting } from './define';

const V = 25;

// ---- PR 41 · follow-up 21 (demo 97-desk-a.js D-013, DESK_A) ----

/**
 * A product card on a computer with a mouse (≥ 1024 px, a real mouse): the back view on hover, and "Quick add" — the
 * sizes in stock in the card's colour, one click puts that size in the bag (the bag's own Add button and panel). Never
 * on a phone or a touch screen. The demo has both on.
 */
export const cardDeskSchema = z
  .object({
    /** The back photo of the card's colour (or the garment drawing's back) fades in under the mouse. */
    altView: z.boolean(),
    /** The "Quick add" row of sizes over the bottom of the picture. */
    quickAdd: z.boolean(),
  })
  .strict();

// ---- PR 45 / 222 · follow-ups 35, 61 (Blueprint C12.1, C12.4; Appendix "category.breadcrumb") ----

/**
 * The data for search engines (JSON-LD) the shop's pages carry, each from what the page itself shows: the breadcrumb
 * trail (sent even when the visible trail is off), the category page's list of products, and the product page's
 * product with its price and stock. Never a rating until real reviews exist (PR 223). On: it says only what is true.
 */
export const structuredDataSchema = z
  .object({
    /** BreadcrumbList on the category and product pages. */
    breadcrumbs: z.boolean(),
    /** ItemList of the products the category page shows. */
    itemList: z.boolean(),
    /** Product with its Offer (or AggregateOffer when the sizes or colours cost differently) on the product page. */
    product: z.boolean(),
  })
  .strict();

// ---- PR 56 · follow-up 62 (SIM-F-047; demo 30-product.js pdp_pills "Your size", pdp_mySizeOut) ----

const sizeKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/);
const sizeWord = z.string().trim().max(16);

/**
 * The owner's words under the size boxes (S → "ছোট", M → "মাঝারি", L → "বড়"), by size key, for buyers who read a
 * word better than a letter. Owner data: empty (null) = no words. `show`: on the Bengali pages only, or on both.
 */
export const pdpSizeWordsSchema = z
  .object({
    show: z.enum(['bn', 'both']),
    words: z.record(sizeKey, z.object({ en: sizeWord, bn: sizeWord }).strict()),
  })
  .strict()
  .nullable();

/**
 * "My usual size": the size this browser last put in the bag (tops and bottoms apart) gets a "Your size" tag on the
 * product page, and when it is sold out in the colour shown, the colours that have it are named. `preselect` also
 * chooses it when it is in stock. Remembered for `days`. Off: the demo draws it from the account's size (PR 58).
 */
export const pdpUsualSizeSchema = z
  .object({
    on: z.boolean(),
    preselect: z.boolean(),
    days: z.int().min(1).max(730),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: true, version: V } as const;

export const storefrontFuSettings = {
  'card.desk': setting({
    ...json,
    group: 'home',
    schema: cardDeskSchema,
    default: { altView: true, quickAdd: true },
    labelKey: 'card.desk.label',
    helpKey: 'card.desk.help',
    sortOrder: 300,
  }),
  'pdp.sizeWords': setting({
    ...json,
    isOwnerData: true,
    group: 'productPage',
    schema: pdpSizeWordsSchema,
    default: null,
    labelKey: 'pdp.sizeWords.label',
    helpKey: 'pdp.sizeWords.help',
    sortOrder: 910,
  }),
  'pdp.usualSize': setting({
    ...json,
    group: 'productPage',
    schema: pdpUsualSizeSchema,
    default: { on: false, preselect: false, days: 180 },
    labelKey: 'pdp.usualSize.label',
    helpKey: 'pdp.usualSize.help',
    sortOrder: 920,
  }),
  'seo.structuredData': setting({
    ...json,
    group: 'naming',
    schema: structuredDataSchema,
    default: { breadcrumbs: true, itemList: true, product: true },
    labelKey: 'seo.structuredData.label',
    helpKey: 'seo.structuredData.help',
    sortOrder: 900,
  }),
};

export type CardDeskSettings = z.output<typeof cardDeskSchema>;
export type StructuredDataSettings = z.output<typeof structuredDataSchema>;
export type PdpSizeWordsSettings = z.output<typeof pdpSizeWordsSchema>;
export type PdpUsualSizeSettings = z.output<typeof pdpUsualSizeSchema>;
