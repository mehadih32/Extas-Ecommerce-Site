// S13 · PR 268 (register "Pause and budget change from the dashboard, with a confirm step"; demo 93-admin-ads.js) — the
// campaign controls on Marketing › Ad platforms (registry version 174, lane B's reserved run).
//
// - `ads.campaignControl`: off as it ships, and the controls are not shown. On, a person with the "control ads"
//   permission can pause a platform campaign or lower its daily budget after a confirm step; starting a campaign again or
//   raising its budget only asks: it waits in the owner's approval list and nothing changes until he approves it
//   (CLAUDE.md rule 6). A request not decided within `approvalHours` runs out and changes nothing. Until a platform's
//   live writer exists every change goes to its practice copy: no real budget or campaign changes.
import { z } from 'zod';
import { setting } from './define';

const V268 = 174;
/** The longest an increase may wait for the owner (30 days). */
export const CONTROL_APPROVAL_HOURS_MAX = 720; // hardcode-ok: thirty days in hours, a technical bound

export const adsCampaignControlSchema = z
  .object({
    /** Off: the controls are hidden and the API refuses a change. */
    on: z.boolean(),
    /** How long a start-again or a budget increase waits for the owner's answer before it runs out. */
    approvalHours: z.number().int().min(1).max(CONTROL_APPROVAL_HOURS_MAX),
  })
  .strict();
export type AdsCampaignControlSettings = z.output<typeof adsCampaignControlSchema>;

export const adsControlSettings = {
  'ads.campaignControl': setting({
    scope: 'store',
    schema: adsCampaignControlSchema,
    // hardcode-ok: off; an increase waits two days for the owner
    default: { on: false, approvalHours: 48 },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.campaignControl.label',
    helpKey: 'ads.campaignControl.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 25,
    version: V268,
  }),
};
