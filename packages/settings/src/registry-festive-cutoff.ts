// S13 · PR 281 (register "Festive cut-off banners and the delivery promise"; Blueprint D3.5 "the stock and cut-off
// message", B1.16 the promise in hours, SIM-F-019 never the usual promise past a cut-off) — registry version 216, lane B.
//
// - `marketing.festiveCutoff`: Marketing › Festive cut-off. Off as it ships. On, the live festive Smart Rules (PR 214:
//   a last order time per delivery band) speak on the shop: before the time their short words ("Order by … for
//   delivery before the festival"), after it their "after" words — on the home page's festive section (demo
//   20-home.js hm_festive), under the product page's stock line, and at checkout and on the thank-you page in place of
//   the usual hours promise once the customer's band is past its time. `places` picks where; `title` is the festive
//   section's heading (empty: the rule's own name); `linkHref` + `linkLabel` the section's link (a shop path; both or
//   neither). Every date and word is the owner's, in the rule; nothing here invents a date or an hour.
import { z } from 'zod';
import { setting } from './define';
import { shopPathSchema } from './registry-storefront';

const V281 = 216;

/** Where the festive cut-off words may show. */
export const FESTIVE_CUTOFF_PLACES = ['home', 'product', 'checkout'] as const;
export type FestiveCutoffPlace = (typeof FESTIVE_CUTOFF_PLACES)[number];

/** The longest heading and link words (a guard, not a business number). */
export const FESTIVE_TITLE_MAX = 60; // hardcode-ok: a text-length guard

const words = (max: number) => z.object({ en: z.string().trim().min(1).max(max), bn: z.string().trim().min(1).max(max) }).strict().nullable();

export const festiveCutoffSettingsSchema = z
  .object({
    enabled: z.boolean(),
    // one tick per place (the settings card's tick boxes)
    places: z.object({ home: z.boolean(), product: z.boolean(), checkout: z.boolean() }).strict(),
    title: words(FESTIVE_TITLE_MAX),
    // a path on the shop itself ("/collections/eid"), never another site
    linkHref: shopPathSchema.nullable(),
    linkLabel: words(FESTIVE_TITLE_MAX),
  })
  .strict()
  .refine((v) => (v.linkHref === null) === (v.linkLabel === null), { message: 'a link needs its words, and words need a link', path: ['linkLabel'] });
export type FestiveCutoffSettings = z.output<typeof festiveCutoffSettingsSchema>;

export const festiveCutoffSettings = {
  'marketing.festiveCutoff': setting({
    scope: 'store',
    schema: festiveCutoffSettingsSchema,
    // hardcode-ok: the shipped default (off; every place ticked for when it is switched on; no words, no link)
    default: { enabled: false, places: { home: true, product: true, checkout: true }, title: null, linkHref: null, linkLabel: null },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.festiveCutoff.label',
    helpKey: 'marketing.festiveCutoff.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 35,
    version: V281,
  }),
};
