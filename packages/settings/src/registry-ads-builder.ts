// S13 · PR 531 (register "Full campaign control from the dashboard — create, run, duplicate, schedule and re-budget a
// campaign, not only pause it"; Blueprint C6 V2 block, §59 answer 18; demo 93-admin-ads.js) — registry version 219,
// lane B.
//
// - `ads.campaignBuilder`: off as it ships. On, Marketing › Ad platforms › New campaigns lets a person with "Control ads"
//   write a new platform campaign as a draft (or duplicate one), schedule a campaign's start and end, and ask to launch
//   it. A launch and every schedule change always wait for the owner's approval (CLAUDE.md rule 6: a campaign start is
//   more spend), through the campaign controls of PR 268 (`ads.campaignControl` must be on too; its `approvalHours` is
//   how long a request waits). Until a platform is connected for changes everything goes to its practice copy.
import { z } from 'zod';
import { setting } from './define';

const V531 = 219;

export const adsCampaignBuilderSchema = z
  .object({
    /** Off: no drafts, duplicates, schedules or launches; the page says so. */
    enabled: z.boolean(),
  })
  .strict();
export type AdsCampaignBuilderSettings = z.output<typeof adsCampaignBuilderSchema>;

export const adsBuilderSettings = {
  'ads.campaignBuilder': setting({
    scope: 'store',
    schema: adsCampaignBuilderSchema,
    // hardcode-ok: off as it ships
    default: { enabled: false },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.campaignBuilder.label',
    helpKey: 'ads.campaignBuilder.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 26,
    version: V531,
  }),
};
