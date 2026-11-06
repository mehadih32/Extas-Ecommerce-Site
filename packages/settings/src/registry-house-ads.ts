// S12 · PR 592 (register "Blog as a complete, standard section of the shop, with our own ad placements"; Blueprint
// C11.5 "House ads and popup rules") — registry version 253, lane C.
//   `blog.houseAds` — the journal's own ads: our banners, products, combos or categories, never an outside ad network.
//   Off as it ships: no house ad shows anywhere and nothing is counted. On: each ad shows in the places the owner picks
//   on Website › Blog & journal › House ads (the journal's top, between its cards, a topic page, inside an article after
//   paragraph N, beside the article on a desktop, at its end, a slim bar, or a popup), within its dates (whole shop
//   days), by its weight, the most relevant first. The numbers here are the rules every page keeps:
//   - `maxPerPage` ads at most on one article page (the bar and the popup count as one: the popup replaces the bar for
//     the visit), `inlineMax` of them inside the words; never before the first paragraph, never the same ad twice.
//   - A popup's own trigger and cap are set per place; a new place starts with `popupScrollPct`, `popupSeconds`,
//     `capTimes` in `capDays`. With `searchGuard` (on) a phone visitor who came from a search engine never gets a popup
//     on the first screen (Google's intrusive-interstitial guidance): only after scrolling past it.
//   - A click is counted per ad and place each shop day; an order placed by that browser within `creditDays` after its
//     last ad click counts for that ad and place (the click cookie: place ids and times only, nothing about the person).
//   Never money: an ad shows what the shop already sells at its own price; nothing here changes a price or an offer.
import { z } from 'zod';
import { setting } from './define';

const V253 = 253;

export const houseAdsSchema = z
  .object({
    /** House ads show in their places (and their clicks are counted). */
    on: z.boolean(),
    /** At most this many house ads on one article page (the bar and the popup count as one). */
    maxPerPage: z.int().min(1).max(6),
    /** At most this many of them inside the article's words. */
    inlineMax: z.int().min(0).max(3),
    /** A new popup opens after this much of the page is read (per cent). */
    popupScrollPct: z.int().min(10).max(95),
    /** … or after this many seconds on the page (0: not by time). */
    popupSeconds: z.int().min(0).max(600),
    /** A new popup shows at most this many times … */
    capTimes: z.int().min(1).max(20),
    /** … in this many days, per browser. */
    capDays: z.int().min(1).max(90),
    /** A phone visitor from a search engine never gets a popup on the first screen. */
    searchGuard: z.boolean(),
    /** An order within this many days after an ad click counts for that ad (the last click). */
    creditDays: z.int().min(1).max(30),
  })
  .strict();
export type HouseAdsSettings = z.output<typeof houseAdsSchema>;

export const HOUSE_ADS_DEFAULT: HouseAdsSettings = { on: false, maxPerPage: 3, inlineMax: 1, popupScrollPct: 50, popupSeconds: 0, capTimes: 1, capDays: 7, searchGuard: true, creditDays: 7 };

export const houseAdSettings = {
  'blog.houseAds': setting({
    scope: 'store',
    schema: houseAdsSchema,
    default: HOUSE_ADS_DEFAULT,
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.houseAds.label',
    helpKey: 'blog.houseAds.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 90,
    version: V253,
  }),
};
