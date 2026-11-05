// S13 · PR 267 (register "Cost per order, cost per delivered order, and alert thresholds the owner sets from the
// dashboard"; demo 93-admin-ads.js) — the ad cost alerts (registry version 173, lane B's reserved run).
//
// - `ads.costAlerts`: the owner's alert rules (AdAlertRule rows on Marketing › Ad platforms: cost per order or per
//   delivered order over his limit, for the whole shop, a platform or one campaign) are checked over the last `days`
//   days (store time) right after each daily spend import, and the crossed ones go to his Telegram in his language.
//   "Check now" on the page works with the switch off and sends nothing. Off as it ships. Read only: an alert never
//   pauses a campaign or changes a budget (rule 6).
import { z } from 'zod';
import { setting } from './define';

const V267 = 173;
/** The longest look-back for the cost figures. */
export const COST_ALERT_DAYS_MAX = 90; // hardcode-ok: a quarter, the longest window the alert reads (technical bound)

export const adsCostAlertsSchema = z
  .object({
    /** Off: nothing is sent; the page still shows each rule against today's figures. */
    on: z.boolean(),
    /** The days the cost figures cover, today included. */
    days: z.number().int().min(1).max(COST_ALERT_DAYS_MAX),
    /** The language of the Telegram message. */
    lang: z.enum(['bn', 'en']),
  })
  .strict();
export type AdsCostAlertsSettings = z.output<typeof adsCostAlertsSchema>;

export const adsAlertSettings = {
  'ads.costAlerts': setting({
    scope: 'store',
    schema: adsCostAlertsSchema,
    // hardcode-ok: off; the last seven days (a week of delivered parcels); the owner's language
    default: { on: false, days: 7, lang: 'bn' },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.costAlerts.label',
    helpKey: 'ads.costAlerts.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 24,
    version: V267,
  }),
};
