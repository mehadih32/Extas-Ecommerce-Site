// S13 · PR 569 (register "Geography-led ad guidance: the shop knows where parcels are actually delivered and paid for,
// district by district") — registry version 255, lane C.
//   `ads.geoGuide` — advice only, off as it ships: Marketing › Where to advertise shows each district's delivered and
//   returned orders over the last `days` shop days (the Sales by area figure, PR 568), for the whole shop or one
//   category. On: each district also gets a word — "more" (at least `minOrders` delivered and a return rate at most
//   `goodReturnPct` %), "less" (at least `minOrders` settled and a return rate from `badReturnPct` %), "hold" in
//   between, "too few" under `minOrders` — and the page lists the "more" and "less" districts ready to copy into an ad
//   platform's location targeting. It never changes a budget, a campaign or a target by itself: the owner decides.
import { z } from 'zod';
import { setting } from './define';

const V255 = 255;

export const geoGuideSchema = z
  .object({
    /** Give each district its word (more · hold · less · too few) and the lists to copy. */
    on: z.boolean(),
    /** Look back this many shop days. */
    days: z.int().min(7).max(365),
    /** A district needs at least this many settled orders (delivered + returned) for a word. */
    minOrders: z.int().min(1).max(1000),
    /** "More" at a return rate up to this (per cent). */
    goodReturnPct: z.int().min(0).max(100),
    /** "Less" at a return rate from this (per cent). */
    badReturnPct: z.int().min(0).max(100),
  })
  .strict()
  .refine((v) => v.goodReturnPct < v.badReturnPct, { path: ['badReturnPct'] });
export type GeoGuideSettings = z.output<typeof geoGuideSchema>;

/** The shipped defaults (off); the owner changes every number on the page's card. */
export const GEO_GUIDE_DEFAULT: GeoGuideSettings = { on: false, days: 90, minOrders: 10, goodReturnPct: 10, badReturnPct: 30 }; // hardcode-ok: the setting's shipped default

export const geoGuideSettings = {
  'ads.geoGuide': setting({
    scope: 'store',
    schema: geoGuideSchema,
    default: GEO_GUIDE_DEFAULT,
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.geoGuide.label',
    helpKey: 'ads.geoGuide.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 95,
    version: V255,
  }),
};
