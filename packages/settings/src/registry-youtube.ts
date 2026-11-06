// S13 · PR 278 (register "YouTube module — channel, videos, and the attribution back to orders"; Blueprint C4.4) —
// registry version 213, lane B.
//
// - `marketing.youtube`: Marketing › YouTube. Off as it ships. The owner adds his channel and his videos (by their
//   links) and ties each video to the products it shows; the page gives each product's tracked link for the video's
//   description, and counts the orders that came through those links (placed, delivered, delivered value, and how many
//   carried the video's products).
//   - `enabled`: the switch; while it is off nothing can be added and the page only says so.
//   - `utmSource` / `utmMedium`: the campaign tags the tracked link carries (the shop's own attribution keeps them on
//     the order: Order.utmSource / utmMedium / utmCampaign).
//   - `campaignPrefix`: the tag before the video's YouTube id in `utm_campaign` (e.g. `yt-` + the 11-character id), so
//     an order is credited to exactly one video.
// Reading the channel's views and new uploads needs the YouTube key in Keys & connections (a later adapter); nothing
// here posts to YouTube or spends money.
import { z } from 'zod';
import { setting } from './define';

const V278 = 213;

/** A campaign tag: letters, digits, dot, dash or underscore (it travels in a link). */
const TAG = /^[A-Za-z0-9._-]+$/;

export const youtubeSettingsSchema = z
  .object({
    enabled: z.boolean(),
    utmSource: z.string().trim().min(1).max(40).regex(TAG),
    utmMedium: z.string().trim().min(1).max(40).regex(TAG),
    campaignPrefix: z.string().trim().max(20).regex(/^[A-Za-z0-9._-]*$/),
  })
  .strict();
export type YoutubeSettings = z.output<typeof youtubeSettingsSchema>;

export const youtubeSettings = {
  'marketing.youtube': setting({
    scope: 'store',
    schema: youtubeSettingsSchema,
    // hardcode-ok: the shipped default (off) and the link's campaign tags, editable on Marketing › YouTube
    default: { enabled: false, utmSource: 'youtube', utmMedium: 'video', campaignPrefix: 'yt-' },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.youtube.label',
    helpKey: 'marketing.youtube.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 32,
    version: V278,
  }),
};
