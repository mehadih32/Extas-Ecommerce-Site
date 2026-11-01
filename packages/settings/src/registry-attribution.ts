// S13 · PR 257 follow-up (go-live gate customer 360°, 1 Nov; registry version 230, a number no lane holds) — where an
// order came from. A visit that arrives with campaign tags (utm_source, utm_medium, utm_campaign) or an ad platform's
// click id (fbclid, gclid, ttclid) is remembered in one first-party cookie for `keepDays`; the order placed in that time
// keeps the source, medium, campaign, platform and the site it came from (Order.utmSource / utmMedium / utmCampaign /
// adPlatform / referrer), so Profit & loss by channel (PR 355, B3.10 Locked: "sales attributed to ads") and the order
// export can count ad sales. A Facebook click id also becomes the `fbc` the Conversions API matches on when no pixel
// cookie is there (PR 257). On as it ships, because B3.10 locks the attribution in; it keeps no name, number or
// address — only the tags in the link — and nothing leaves the shop because of it.
import { z } from 'zod';
import { setting } from './define';

const V = 230;

/** Which visit an order is credited to when there were several: the latest tagged one, or the first. */
export const ATTRIBUTION_TOUCHES = ['last', 'first'] as const;
export type AttributionTouch = (typeof ATTRIBUTION_TOUCHES)[number];

export const attributionSchema = z
  .object({
    /** Remember the tags of an ad or campaign visit and keep them on the order. */
    on: z.boolean(),
    /** How many days after the visit an order still counts as coming from it. */
    keepDays: z.number().int().min(1).max(90),
    /** The latest tagged visit wins, or the first one stays until its days are over. */
    touch: z.enum(ATTRIBUTION_TOUCHES),
  })
  .strict();
export type AttributionSettings = z.output<typeof attributionSchema>;

export const attributionSettings = {
  'ads.attribution': setting({
    scope: 'store',
    schema: attributionSchema,
    default: { on: true, keepDays: 30, touch: 'last' },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.attribution.label',
    helpKey: 'ads.attribution.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V,
  }),
};
