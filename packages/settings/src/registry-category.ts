// S02 · the category page — PR 45 (grid, breadcrumb, SEO text block, questions, pagination), 46 (filters built from the
// category's own products, with live counts), 47 (the sort control, a real listbox) and 48 (the sticky filter bar with
// the active filters). Registry version 17. Labels: messages/storefront.<lang>.json (`category.*`).
//
// The defaults reproduce the approved V12.2 demo (docs/demo/src/21-category.js CAT_TOOLBAR, CAT_SORTS, cat_priceStep,
// the colour list's "+ N more"). CN-018: every number and policy here is a setting with options; anything the demo
// does not do by default is off. The owner's own words (SEO text, his own questions) have no default (PR 509).
// The words the page shows are keys of the shop dictionary (apps/web/messages/shop.<lang>.json, `cat.*`).
import { z } from 'zod';
import { setting } from './define';
import { localizedTextSchema } from './schemas';
import { categorySlugSchema, listIdSchema, SHOP_REQUIREMENTS, shopLabelSchema } from './registry-storefront';

const V = 17;

const uniqueIds = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id)).size === list.length;
const UNIQUE = { message: 'every id must be unique' };
const requiresSchema = z.array(z.enum(SHOP_REQUIREMENTS)).max(SHOP_REQUIREMENTS.length);

/** The filter groups, in the demo's order (cat_filtersHTML): the switches on top, then size, colour, fit, price. */
export const CATEGORY_FILTER_GROUPS = ['stock', 'size', 'colour', 'fit', 'price'] as const;
export type CategoryFilterGroup = (typeof CATEGORY_FILTER_GROUPS)[number];

/** The sorts the page can offer (demo CAT_SORTS, plus "newest", which the demo does not offer and so starts off). */
export const CATEGORY_SORTS = ['rec', 'new', 'low', 'high', 'top'] as const;
export type CategorySort = (typeof CATEGORY_SORTS)[number];

/** The phone's top row (demo CAT_TOOLBAR.top). */
export const CATEGORY_TOP_ITEMS = ['filter', 'sort', 'sale'] as const;

/**
 * The quick chips the owner can tick (demo CAT_TOOLBAR.chips.library kinds). `mine` (my size, PR 58) and `setOnly`
 * (set price, S03) draw nothing until those features can tell which products qualify — a chip never promises a filter
 * the shop cannot run.
 */
export const CATEGORY_CHIP_KINDS = [
  'mine', 'setOnly', 'sale', 'stock', 'priceBands', 'priceBand', 'fits', 'fit', 'priceUnder', 'priceOver', 'colour', 'size', 'tag',
] as const;
export const PRICE_BANDS = ['lo', 'mid', 'hi'] as const;

/** Where sold-out styles go: kept in the owner's order, moved after the rest, or left out of the grid. */
export const SOLD_OUT_PLACES = ['show', 'last', 'hide'] as const;

const minorSchema = z.int().min(1).max(100_000_000);

export const categoryPageSchema = z
  .object({
    /** The visible breadcrumb (Home / category) above the title (demo SHOW('category','breadcrumb')). */
    breadcrumb: z.boolean(),
    /** Products per page; "Show more" adds the next page under them. */
    pageSize: z.int().min(4).max(120),
    soldOut: z.enum(SOLD_OUT_PLACES),
    /** Desktop: a category with this many styles or fewer (and no filter on) drops the filter rail (demo D-012). 0 = never. */
    fewStyles: z.int().min(0).max(12),
    /** "Showing 12 of 30" and its progress bar under the grid. */
    progress: z.boolean(),
  })
  .strict();

/** Price band rounding: below `below` (minor units; null = everything above), cut points round to `step`. */
const priceStepSchema = z.object({ below: minorSchema.nullable(), step: minorSchema }).strict();

export const categoryFiltersSchema = z
  .object({
    /** The groups in the order they are drawn; a group switched off is not drawn anywhere. */
    groups: z
      .array(z.object({ id: z.enum(CATEGORY_FILTER_GROUPS), on: z.boolean() }).strict())
      .max(CATEGORY_FILTER_GROUPS.length)
      .refine(uniqueIds, UNIQUE),
    /** Colours shown before "+ N more colours". */
    colourLimit: z.int().min(2).max(60),
    /** The line under the sizes ("Shows styles in stock in at least one colour."). */
    sizeNote: z.boolean(),
    /** An option no product matches with the other filters on: dimmed (sizes crossed out), or left out. */
    zero: z.enum(['dim', 'hide']),
    /** The price bands' rounding steps, smallest first (demo cat_priceStep: ৳50 below ৳500, ৳100 below ৳2,000 …). */
    priceSteps: z
      .array(priceStepSchema)
      .min(1)
      .max(8)
      .refine((l) => l.every((s, i) => i === l.length - 1 ? s.below === null : s.below !== null && (i === 0 || s.below > l[i - 1]!.below!)), {
        message: 'the steps go from the smallest limit up, and the last one has no limit',
      }),
    /** Hand-set cut points for a category (two, in minor units), or none (no price filter there). Empty = computed. */
    priceCuts: z
      .record(categorySlugSchema, z.array(minorSchema).max(2).refine((c) => c.length !== 1 && (c.length < 2 || c[0]! < c[1]!), { message: 'two cut points, the lower first, or none' }))
      .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' }),
  })
  .strict();

const chipSchema = z
  .object({
    id: listIdSchema,
    kind: z.enum(CATEGORY_CHIP_KINDS),
    label: shopLabelSchema.optional(),
    /** colour key, size key, tag slug or fit words */
    value: z.string().trim().min(1).max(80).optional(),
    band: z.enum(PRICE_BANDS).optional(),
    min: minorSchema.optional(),
    max: minorSchema.optional(),
  })
  .strict()
  .refine((c) => !['colour', 'size', 'tag', 'fit'].includes(c.kind) || !!c.value, { message: 'this chip needs its value' })
  .refine((c) => c.kind !== 'priceBand' || !!c.band, { message: 'a price band chip names its band' })
  .refine((c) => c.kind !== 'priceUnder' || c.max != null, { message: '"price under" needs its amount' })
  .refine((c) => c.kind !== 'priceOver' || c.min != null, { message: '"price over" needs its amount' });

const chipIdsSchema = z.array(listIdSchema).max(20);

export const categoryToolbarSchema = z
  .object({
    top: z
      .object({
        on: z.boolean(),
        items: z
          .array(z.object({ id: z.enum(CATEGORY_TOP_ITEMS), on: z.boolean(), label: shopLabelSchema.optional() }).strict())
          .max(CATEGORY_TOP_ITEMS.length)
          .refine(uniqueIds, UNIQUE),
      })
      .strict(),
    chips: z
      .object({
        on: z.boolean(),
        /** The ticked chips, in the order they are drawn. */
        chosen: chipIdsSchema,
        library: z.array(chipSchema).max(40).refine(uniqueIds, UNIQUE),
      })
      .strict(),
    /** One category's own top row and chips switch (and its own ticked chips). */
    perCategory: z
      .record(
        categorySlugSchema,
        z.object({ top: z.object({ on: z.boolean() }).strict().optional(), chips: z.object({ on: z.boolean().optional(), chosen: chipIdsSchema.optional() }).strict().optional() }).strict(),
      )
      .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' }),
  })
  .strict()
  .refine((t) => {
    const ids = new Set(t.chips.library.map((c) => c.id));
    return [t.chips.chosen, ...Object.values(t.perCategory).map((p) => p.chips?.chosen ?? [])].every((l) => l.every((id) => ids.has(id)));
  }, { message: 'a ticked chip must be in the chip library' });

export const categorySortSchema = z
  .object({
    /** The sorts offered, in the owner's order; the first is the page's own order. */
    options: z.array(z.enum(CATEGORY_SORTS)).min(1).max(CATEGORY_SORTS.length).refine((l) => new Set(l).size === l.length, { message: 'each sort once' }),
    /** A sort's own words instead of the dictionary's. */
    labels: z.partialRecord(z.enum(CATEGORY_SORTS), shopLabelSchema),
  })
  .strict();

export const categoryNewInSchema = z
  .object({
    /** The "New in" page's own order: by publish date, or the owner's order of the products. */
    order: z.enum(['newest', 'rank']),
    /** Only styles published in the last so many days; 0 = every published style. */
    days: z.int().min(0).max(365),
  })
  .strict();

/** The longest each of a category's own SEO fields may be (the admin's Collection pages screen shows the same, PR 227). */
export const CATEGORY_SEO_MAX = { title: 70, meta: 170, heading: 120, text: 4000 } as const;

export const categorySeoSchema = z
  .record(
    categorySlugSchema,
    z
      .object({
        /** The browser tab and search result title (else the category's name). */
        title: localizedTextSchema(CATEGORY_SEO_MAX.title).optional(),
        /** The search result's line. */
        meta: localizedTextSchema(CATEGORY_SEO_MAX.meta).optional(),
        /** The heading over the text block (else "{name} for men in Bangladesh" from the dictionary). */
        heading: localizedTextSchema(CATEGORY_SEO_MAX.heading).optional(),
        /** The text block under the grid; a blank line starts a new paragraph. No text, no block. */
        text: localizedTextSchema(CATEGORY_SEO_MAX.text).optional(),
      })
      .strict(),
  )
  .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' });

const generalQuestionSchema = z
  .object({ id: listIdSchema, on: z.boolean(), q: shopLabelSchema, a: shopLabelSchema, requires: requiresSchema.optional() })
  .strict();

export const categoryFaqSchema = z
  .object({
    /** The first question starts open (demo u.faq = 0). */
    openFirst: z.boolean(),
    /** The shop-wide questions under a category's own; each waits for what it promises (COD, exchange …). */
    general: z.array(generalQuestionSchema).max(12).refine(uniqueIds, UNIQUE),
  })
  .strict();

export const categoryFaqOwnSchema = z
  .record(
    categorySlugSchema,
    z
      .array(z.object({ id: listIdSchema, on: z.boolean(), q: localizedTextSchema(200), a: localizedTextSchema(2000) }).strict())
      .max(12)
      .refine(uniqueIds, UNIQUE),
  )
  .refine((r) => Object.keys(r).length <= 500, { message: 'at most 500 categories' });

const k = (key: string) => ({ key });

export const categorySettings = {
  'category.page': setting({
    schema: categoryPageSchema,
    default: { breadcrumb: true, pageSize: 24, soldOut: 'show', fewStyles: 4, progress: true },
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.page.label',
    helpKey: 'category.page.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: V,
  }),
  'category.filters': setting({
    schema: categoryFiltersSchema,
    default: {
      groups: CATEGORY_FILTER_GROUPS.map((id) => ({ id, on: true })),
      colourLimit: 6, // hardcode-ok: the demo shows six colours before "+ N more"; the owner changes it here
      sizeNote: true,
      zero: 'dim',
      priceSteps: [
        { below: 50_000, step: 5_000 },
        { below: 200_000, step: 10_000 },
        { below: 1_000_000, step: 25_000 },
        { below: null, step: 50_000 },
      ],
      priceCuts: {},
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.filters.label',
    helpKey: 'category.filters.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: V,
  }),
  'category.toolbar': setting({
    schema: categoryToolbarSchema,
    default: {
      top: {
        on: true,
        items: [
          { id: 'filter', on: true },
          { id: 'sort', on: true },
          { id: 'sale', on: true },
        ],
      },
      // the demo's default: "My size only" (joins with Find My Size, PR 58) and one chip per fit; the price and set
      // chips are in the library, un-ticked, as in the demo
      chips: {
        on: true,
        chosen: ['mine', 'fits'],
        library: [
          { id: 'mine', kind: 'mine' },
          { id: 'set', kind: 'setOnly' },
          { id: 'price', kind: 'priceBands' },
          { id: 'fits', kind: 'fits' },
          { id: 'sale', kind: 'sale' },
          { id: 'stock', kind: 'stock' },
        ],
      },
      perCategory: {},
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.toolbar.label',
    helpKey: 'category.toolbar.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: V,
  }),
  'category.sort': setting({
    schema: categorySortSchema,
    default: { options: ['rec', 'low', 'high', 'top'], labels: {} },
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.sort.label',
    helpKey: 'category.sort.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 40,
    version: V,
  }),
  'category.newIn': setting({
    schema: categoryNewInSchema,
    default: { order: 'newest', days: 0 },
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.newIn.label',
    helpKey: 'category.newIn.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 50,
    version: V,
  }),
  'category.faq': setting({
    schema: categoryFaqSchema,
    default: {
      openFirst: true,
      general: [
        { id: 'cod', on: true, q: k('cat.faq.cod.q'), a: k('cat.faq.cod.a'), requires: ['cod'] },
        { id: 'delivery', on: true, q: k('cat.faq.delivery.q'), a: k('cat.faq.delivery.a'), requires: ['freeDelivery'] },
        { id: 'exchange', on: true, q: k('cat.faq.exchange.q'), a: k('cat.faq.exchange.a'), requires: ['exchange'] },
        // the size answer points at the size chart and Find My Size (PR 49 / 58): off until they are on the site
        { id: 'size', on: false, q: k('cat.faq.size.q'), a: k('cat.faq.size.a') },
      ],
    },
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.faq.label',
    helpKey: 'category.faq.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 60,
    version: V,
  }),
  // ---- the owner's own words (PR 509: no default) ----
  'category.seo': setting({
    schema: categorySeoSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.seo.label',
    helpKey: 'category.seo.help',
    isOwnerData: true,
    isPublic: true,
    sortOrder: 70,
    version: V,
  }),
  'category.faqOwn': setting({
    schema: categoryFaqOwnSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'categoryPage',
    labelKey: 'category.faqOwn.label',
    helpKey: 'category.faqOwn.help',
    isOwnerData: true,
    isPublic: true,
    sortOrder: 80,
    version: V,
  }),
};

export type CategoryPageSettings = z.output<typeof categoryPageSchema>;
export type CategoryFilters = z.output<typeof categoryFiltersSchema>;
export type CategoryToolbar = z.output<typeof categoryToolbarSchema>;
export type CategoryChip = z.output<typeof chipSchema>;
export type CategorySortSettings = z.output<typeof categorySortSchema>;
export type CategoryFaq = z.output<typeof categoryFaqSchema>;
export type CategoryFaqOwn = z.output<typeof categoryFaqOwnSchema>;
export type CategorySeo = z.output<typeof categorySeoSchema>;
