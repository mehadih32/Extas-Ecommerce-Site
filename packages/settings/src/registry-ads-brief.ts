// S13 · PR 270 (register "Ad creative briefs generated from the product and the campaign"; demo 93-admin-ads.js
// `zd-brief`) — the creative brief on Marketing › Ad platforms › Creative briefs (registry version 176, lane B's free run).
//
// - `ads.creativeBrief`: off as it ships (no brief can be written; the page still lists the kept ones). On, a person with
//   "edit campaigns" writes a brief from a product (and, if he picks one, a platform campaign or an approved "refresh the
//   creative" proposal of the growth agent, PR 269): the offer, the formats below, a hook in Bengali and in English, what
//   the picture shows, the landing address and what the ads optimise for. He corrects the words and sends it to the
//   studio (a kept record the studio of S24/S25 works from). Nothing is bought, priced or published by a brief.
import { z } from 'zod';
import { setting } from './define';

const V270 = 176;
/** The most cards a carousel brief asks for (the platforms' own limit). */
export const BRIEF_CAROUSEL_MAX = 10; // hardcode-ok: technical bound (Meta's carousel limit)
/** The longest video a brief asks for, in seconds. */
export const BRIEF_VIDEO_MAX_SECONDS = 60; // hardcode-ok: technical bound on a feed/story cut

export const BRIEF_OPTIMISE = ['deliveredPurchase', 'purchase'] as const;

export const adsCreativeBriefSchema = z
  .object({
    /** On: briefs can be written and sent. Off: the page only lists the kept ones. */
    on: z.boolean(),
    /** A 4:5 feed photo. */
    photo: z.boolean(),
    /** A 1:1 carousel of the product's colours. */
    carousel: z.boolean(),
    /** A 9:16 video for stories and reels. */
    video: z.boolean(),
    /** Cards in the carousel. */
    carouselCards: z.number().int().min(2).max(BRIEF_CAROUSEL_MAX),
    /** The video's shortest and longest cut, in seconds. */
    videoMinSeconds: z.number().int().min(1).max(BRIEF_VIDEO_MAX_SECONDS),
    videoMaxSeconds: z.number().int().min(1).max(BRIEF_VIDEO_MAX_SECONDS),
    /** The brief asks for no words baked into the picture (the platform adds the text, PR 575). */
    noTextOnPicture: z.boolean(),
    /** What the ads are told to optimise for: a delivered purchase (the shop's delivered event, PR 258) or any purchase. */
    optimiseFor: z.enum(BRIEF_OPTIMISE),
  })
  .strict()
  .refine((v) => v.videoMinSeconds <= v.videoMaxSeconds, { path: ['videoMaxSeconds'], message: 'shorter than the shortest cut' });
export type AdsCreativeBriefSettings = z.output<typeof adsCreativeBriefSchema>;

export const adsBriefSettings = {
  'ads.creativeBrief': setting({
    scope: 'store',
    schema: adsCreativeBriefSchema,
    // off; the demo's three formats (4:5 photo, 1:1 carousel of 4, 9:16 video of 8–12 s); no words on the picture; delivered purchase
    default: { on: false, photo: true, carousel: true, video: true, carouselCards: 4, videoMinSeconds: 8, videoMaxSeconds: 12, noTextOnPicture: true, optimiseFor: 'deliveredPurchase' }, // hardcode-ok: the shipped defaults (off)
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.creativeBrief.label',
    helpKey: 'ads.creativeBrief.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 27,
    version: V270,
  }),
};
