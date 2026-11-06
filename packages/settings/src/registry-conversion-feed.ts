// S13 · PR 532 (Blueprint C6 "deep conversion feed with courier outcomes", §59.2) — the deep conversion feed (registry
// version 232; lane B's run above main's v231, CN-031). It rides on server-side tracking (`ads.tracking`: its switch,
// platforms, customer matching and attempts) and on delivered-purchase optimisation (`ads.deliveredPurchase`: its order
// sources, look-back and how often the order timeline is read), and adds:
// - the courier's side of an order as events of their own: handed to the courier ("shipped") and came back
//   ("returned": refused at the door or returned), each with the value of its pieces;
// - the "qualified sale" of §59.2 for the platforms ticked under `generous` (Facebook as it ships): an order delivered,
//   or gone to the courier untouched for the owner's hours, goes under that platform's purchase name; held back only
//   when it was cancelled or marked bad (an order flag the owner ticks, or a number on the blocklist);
// - the courier outcome and the visitor's intent on every order event sent (outcome, courier, days, payment kind; the
//   visit's channel and campaign, an ad click, a returning customer, how many products seen, bag adds and checkouts
//   before the order). Never a name, an address, a phone or an e-mail: contact data leaves only as PR 257's hashes,
//   only while customer matching is on.
// Off as it ships; every number editable. No money moves, no budget, price, order or COD changes.
// PR 532 follow-up 661 (registry v261) — `withdrawOnReturn`: a parcel that came back withdraws the purchase a platform
//   already took for its order, where the platform can (GA4's own `refund`, the same transaction id); Meta and TikTok
//   cannot take a purchase back, so there it stays the "returned" event. Off as it ships (the return goes as its own
//   event everywhere, as before); a value saved before reads as off. It changes only what the ad platforms are told.
// PR 532 follow-up 664 (registry v262) — `shareIds`: the thank-you page carries the order's server event ids (one inert
//   data block per order: each ticked platform's event names and ids), so a browser pixel the owner adds can fire the
//   same event under the same id and the platform counts it once. Off as it ships; a value saved before reads as off.
import { z } from 'zod';
import { setting } from './define';
import { dictionaryKeySchema } from './schemas';

// const V = 232; — replaced by V661 below (PR 532 follow-up 661)
// const V661 = 261; — replaced by V664 below (PR 532 follow-up 664)
const V664 = 262;

export const conversionFeedSchema = z
  .object({
    /** Off: no courier step, no qualified sale and no enrichment; everything stays as PR 257/258 send it. */
    on: z.boolean(),
    /** The feed's events recorded while on, one tick each. */
    steps: z.object({ shipped: z.boolean(), returned: z.boolean(), qualified: z.boolean() }).strict(),
    /** The platforms whose purchase is the qualified sale (§59.2: the Facebook feed is generous). */
    generous: z.object({ meta: z.boolean(), google: z.boolean(), tiktok: z.boolean() }).strict(),
    /** How long an order must be with the courier, untouched, before it counts as a qualified sale (0 = at once). */
    holdHours: z.number().int().min(0).max(72),
    /** The order flags (keys of `orders.flags.list`) that mark an order bad: it is never a qualified sale. */
    holdFlags: z.record(dictionaryKeySchema, z.boolean()).refine((r) => Object.keys(r).length <= 100, { message: 'at most 100 flags' }),
    /** A number on the blocklist (an active block) marks the order bad. */
    holdBlocked: z.boolean(),
    /** What each order event carries besides its value: the courier outcome, the visitor's intent. */
    enrich: z.object({ courier: z.boolean(), intent: z.boolean() }).strict(),
    /** How many days before the order the visitor's product views, bag adds and checkouts are counted. */
    intentDays: z.number().int().min(1).max(30),
    /** PR 532 follow-up 661: a parcel that came back withdraws the purchase already sent, where the platform can. */
    withdrawOnReturn: z.boolean().default(false),
    /** PR 532 follow-up 664: the thank-you page shares the order's server event ids with a browser pixel. */
    shareIds: z.boolean().default(false),
  })
  .strict();
export type ConversionFeedSettings = z.output<typeof conversionFeedSchema>;

/** The flag keys ticked as "marked bad". */
export const heldFlags = (s: Pick<ConversionFeedSettings, 'holdFlags'>): string[] => Object.keys(s.holdFlags).filter((k) => s.holdFlags[k]);

export const conversionFeedSettings = {
  'ads.conversionFeed': setting({
    scope: 'store',
    schema: conversionFeedSchema,
    default: {
      on: false,
      steps: { shipped: true, returned: true, qualified: true },
      generous: { meta: true, google: false, tiktok: false },
      holdHours: 2,
      holdFlags: {},
      holdBlocked: true,
      enrich: { courier: true, intent: true },
      intentDays: 7,
      withdrawOnReturn: false,
      shareIds: false,
    },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.conversionFeed.label',
    helpKey: 'ads.conversionFeed.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 12,
    version: V664,
  }),
};
