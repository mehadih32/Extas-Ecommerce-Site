// S02 · the storefront, third batch — PR 53 (the first-screen budget), 67 (rows), 68 (rail), 69 (share), 70 (the floating
// WhatsApp button), 71 (the wishlist). Registry version 21 (the checkout took 20). Labels:
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

// ---- PR 68 · the floating action rail (demo 30-product.js pdp_headTitle "pdp-acts", PDP_RAIL; 02-core.js
// SHOWN.pdpIcons) ----

/**
 * The column of round buttons that floats at the right of the product page and drifts a little with the scroll, never
 * above the title's line and never onto the buy bar. Off by default, as in the demo (SHOWN.pdpIcons.panel = false):
 * the heart rides after the title instead.
 */
export const pdpIconsSchema = z
  .object({
    /** The floating column at all. */
    panel: z.boolean(),
    /** The wishlist heart: after the title, in the column, or nowhere. */
    wish: z.enum(['title', 'rail', 'off']),
    /** "Ask about this item on WhatsApp" in the column (only with the store's WhatsApp number). */
    whatsapp: z.boolean(),
    /** PR 69: "Share this product" in the column, opening the share row. */
    share: z.boolean(),
    /** The drift: at most this many px from its place, following this share of the scroll, easing back after a pause. */
    driftMaxPx: z.int().min(0).max(120),
    follow: z.number().min(0).max(1),
    ease: z.number().min(0.02).max(1),
    settleMs: z.int().min(0).max(2000),
    /** Px under the title's line the column may climb to, and px it keeps above the buy bar. */
    ceilGapPx: z.int().min(0).max(40),
    barGapPx: z.int().min(0).max(60),
  })
  .strict();

// ---- PR 69 · the share row (demo 30-product.js pdp_shareRow, styles.css 7+8) ----

export const SHARE_TILE_IDS = ['facebook', 'messenger', 'whatsapp', 'instagram', 'copy'] as const;

/** The floating share tiles beside the rail: which networks, in which order, and when the row tidies itself away. */
export const pdpShareSchema = z
  .object({
    tiles: z
      .array(z.object({ id: z.enum(SHARE_TILE_IDS), on: z.boolean() }).strict())
      .min(1)
      .max(SHARE_TILE_IDS.length)
      .refine((l) => new Set(l.map((x) => x.id)).size === l.length, { message: 'every tile once' }),
    closeMs: z.int().min(2000).max(60000),
  })
  .strict();

// ---- PR 70 · the site-wide floating WhatsApp button (Blueprint D3.3 / D4.1 `fab.whatsapp`, Note 3.1; demo 02-core.js
// SHOWN.fab.whatsapp = false) ----

export const FAB_PAGES = ['home', 'category', 'product', 'bag', 'help', 'wishlist', 'account', 'other'] as const;

/**
 * The round WhatsApp button that floats over every page. Replaced on 19 Oct by the header's WhatsApp icon and kept as a
 * switch, off (Note 3.1). When on: which kinds of page show it, which side, and where it sits — low, above the phone's
 * bars (the recommended place, F #62), or in the middle of the side as first asked. It never shows without the store's
 * WhatsApp number.
 */
export const shellFabSchema = z
  .object({
    on: z.boolean(),
    pages: z.object(Object.fromEntries(FAB_PAGES.map((k) => [k, z.boolean()])) as Record<(typeof FAB_PAGES)[number], z.ZodBoolean>).strict(),
    side: z.enum(['right', 'left']),
    place: z.enum(['low', 'middle']),
  })
  .strict();

// ---- PR 71 · the wishlist (demo 60-account.js acc_guestWishlist / acc_wishGrid, 50-bag.js R16 "Move to wishlist") ----

/**
 * The wishlist: the hearts a visitor taps, kept for this browser on the server (the bag's visitor id), so the list
 * page is drawn at once and survives a cleared browser store. How long it is, what an empty list shows on a computer,
 * and what the bag's heart button does.
 */
export const wishListSchema = z
  .object({
    /** The most products one list keeps; a heart past it is refused with a message (nothing is dropped). */
    max: z.int().min(10).max(500),
    /** A computer's empty list shows this many of the newest products to start from (demo D-050); 0 = none. */
    emptyPicks: z.int().min(0).max(12),
    /** The bag's line button: on = "Move to wishlist" (the item leaves the bag for the list, with Undo; demo R16),
     * off = "Save for later" keeps it in the bag (PR 107). A set always stays whole in the bag's saved list. */
    fromBag: z.boolean(),
  })
  .strict();

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
  'pdp.icons': setting({
    ...json,
    group: 'productPage',
    schema: pdpIconsSchema,
    default: { panel: false, wish: 'title', whatsapp: false, share: false, driftMaxPx: 38, follow: 0.5, ease: 0.14, settleMs: 170, ceilGapPx: 2, barGapPx: 10 }, // hardcode-ok: the demo's PDP_DRIFT_MAX and rail loop
    labelKey: 'pdp.icons.label',
    helpKey: 'pdp.icons.help',
    sortOrder: 150,
  }),
  'pdp.share': setting({
    ...json,
    group: 'productPage',
    schema: pdpShareSchema,
    default: { tiles: SHARE_TILE_IDS.map((id) => ({ id, on: true })), closeMs: 8000 },
    labelKey: 'pdp.share.label',
    helpKey: 'pdp.share.help',
    sortOrder: 160,
  }),
  'shell.fab': setting({
    ...json,
    group: 'shell',
    schema: shellFabSchema,
    // C3 / PR 107 / §49.4: never on the home page or the bag; the demo's FAB_PAGES (03-layout.js) keeps it off the
    // product page too (the page has its own rail and buy bar); every other kind of page when switched on
    default: {
      on: false,
      pages: { home: false, category: true, product: false, bag: false, help: true, wishlist: true, account: true, other: true },
      side: 'right',
      place: 'low',
    },
    labelKey: 'shell.fab.label',
    helpKey: 'shell.fab.help',
    sortOrder: 170,
  }),
  'wish.list': setting({
    ...json,
    group: 'wishlist',
    schema: wishListSchema,
    default: { max: 100, emptyPicks: 4, fromBag: true },
    labelKey: 'wish.list.label',
    helpKey: 'wish.list.help',
    sortOrder: 180,
  }),
};

export type PdpFitSettings = z.output<typeof pdpFitSchema>;
export type PdpRowsSettings = z.output<typeof pdpRowsSchema>;
export type PdpIconsSettings = z.output<typeof pdpIconsSchema>;
export type PdpShareSettings = z.output<typeof pdpShareSchema>;
export type ShellFabSettings = z.output<typeof shellFabSchema>;
export type WishListSettings = z.output<typeof wishListSchema>;
