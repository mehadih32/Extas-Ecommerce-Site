// S13 · PR 264 (Blueprint C6.2 points 3–4, demo 97x-adm2-marketing.js "Ads › Audiences" key `ads.refusedExclude`) —
// the refused-parcel exclusion list and the daily audience refresh (registry version 171, lane B's reserved run).
//
// - `ads.refusedExclude`: the switch (off as it ships: the list is never sent). On, the shop's own exclusion audience
//   holds the numbers a person put on the refused-parcel list (Orders › Returns › Refused, PR 191) and is sent to Meta,
//   TikTok and Google as hashed phone numbers whenever audiences are sent (`ads.audiences.push`). `everyRefusal` also
//   adds every number with a parcel refused at the door that was not the shop's fault (the Audiences "Refused a parcel"
//   condition), in the last `days` days (0 = any time). Never a block: those people can still buy.
// - `ads.audienceRefresh`: once a day, at or after the owner's hour (store time), the background worker counts every
//   live audience again and sends again the ones already sent to a real ad account, plus the exclusion list. Off as it
//   ships. No budget, bid or campaign is touched by any of it (rule 6).
import { z } from 'zod';
import { setting } from './define';

const V264 = 171;
/** Typing guards, not business numbers: the longest look-back and the hours of a day. */
export const REFUSED_DAYS_MAX = 3650; // hardcode-ok: a typing guard (ten years)
export const HOUR_MAX = 23; // hardcode-ok: the last hour of a day

export const adsRefusedExcludeSchema = z
  .object({
    /** Off: the exclusion list is never sent. */
    on: z.boolean(),
    /** Also every number with a refused parcel that was not the shop's fault, not only the numbers a person listed. */
    everyRefusal: z.boolean(),
    /** With `everyRefusal`: refusals in the last N days (0 = any time). */
    days: z.number().int().min(0).max(REFUSED_DAYS_MAX),
  })
  .strict();
export type AdsRefusedExcludeSettings = z.output<typeof adsRefusedExcludeSchema>;

export const adsAudienceRefreshSchema = z
  .object({
    /** Off: audiences are counted and sent only when a person presses the button. */
    on: z.boolean(),
    /** The hour of the store's day from which the refresh runs (once a day). */
    hour: z.number().int().min(0).max(HOUR_MAX),
  })
  .strict();
export type AdsAudienceRefreshSettings = z.output<typeof adsAudienceRefreshSchema>;

export const adsRefusedSettings = {
  'ads.refusedExclude': setting({
    scope: 'store',
    schema: adsRefusedExcludeSchema,
    default: { on: false, everyRefusal: false, days: 0 },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.refusedExclude.label',
    helpKey: 'ads.refusedExclude.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 21,
    version: V264,
  }),
  'ads.audienceRefresh': setting({
    scope: 'store',
    schema: adsAudienceRefreshSchema,
    default: { on: false, hour: 0 }, // hardcode-ok: off; the hour is the owner's (0 = from midnight, store time)
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.audienceRefresh.label',
    helpKey: 'ads.audienceRefresh.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 22,
    version: V264,
  }),
};
