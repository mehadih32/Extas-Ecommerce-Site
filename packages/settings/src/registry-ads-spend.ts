// S13 · PR 265 (Blueprint C6.2, demo 93-admin-ads.js) — the ad spend import (registry version 172, lane B's reserved run).
//
// - `ads.spendImport`: once a day, at or after the owner's hour (store time), the background worker reads what each ad
//   platform spent per campaign and per day over the last `days` days (the platforms correct recent days for a while,
//   so the window is read again and each day's row replaced) and keeps it as AdSpendDaily rows: the profit, channel
//   and per-order figures read them. "Import now" on Marketing › Ad platforms works with the switch off too.
//   Off as it ships. Read only: no budget, bid or campaign is touched (rule 6).
import { z } from 'zod';
import { setting } from './define';

const V265 = 172;
/** The longest look-back: TikTok's daily report takes at most 30 days per ask. */
export const SPEND_DAYS_MAX = 30; // hardcode-ok: TikTok's own limit for a daily report, a technical bound
/** The last hour of a day. */
export const SPEND_HOUR_MAX = 23; // hardcode-ok: the last hour of a day

export const adsSpendImportSchema = z
  .object({
    /** Off: spend is read only when a person presses "Import now". */
    on: z.boolean(),
    /** The days read again each time, today included (the platforms correct recent days). */
    days: z.number().int().min(1).max(SPEND_DAYS_MAX),
    /** The hour of the store's day from which the daily import runs. */
    hour: z.number().int().min(0).max(SPEND_HOUR_MAX),
  })
  .strict();
export type AdsSpendImportSettings = z.output<typeof adsSpendImportSchema>;

export const adsSpendSettings = {
  'ads.spendImport': setting({
    scope: 'store',
    schema: adsSpendImportSchema,
    // hardcode-ok: off; three days read again (yesterday's numbers still move), from midnight store time
    default: { on: false, days: 3, hour: 0 },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.spendImport.label',
    helpKey: 'ads.spendImport.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 23,
    version: V265,
  }),
};
