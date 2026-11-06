// S13 · PR 283 (register "Marketing report: spend, revenue, by channel, by campaign"; Blueprint C6.1 item 5 "per-campaign
// spend vs delivered revenue", C3.1 row 8 "delivered ROAS by campaign"; demo 93-admin-ads.js) — registry version 218,
// lane B.
//
// - `marketing.report`: Marketing › Report. Off as it ships. On, one page sets what marketing cost (ad spend imported per
//   day, message sends' cost) against Ordered value (orders placed) and Sales (orders delivered — the only sale), for
//   the whole shop, by channel, by campaign and per message send, with delivered ROAS. `maxDays` is the longest period
//   one report covers; `resultDays` is how many days after a message its receiver's orders count as that send's
//   result. The report only reads: it never changes a budget, a campaign, a price or an order.
import { z } from 'zod';
import { setting } from './define';

const V283 = 218;

/** Guards for the report's longest period and a send's result window (guards, not business numbers). */
export const REPORT_MAX_DAYS_MIN = 7; // hardcode-ok: a period-length guard
export const REPORT_MAX_DAYS_MAX = 1096; // hardcode-ok: a period-length guard (three years)
export const REPORT_RESULT_DAYS_MIN = 1; // hardcode-ok: a window guard
export const REPORT_RESULT_DAYS_MAX = 60; // hardcode-ok: a window guard (as the e-mail and win-back sends)

export const marketingReportSettingsSchema = z
  .object({
    enabled: z.boolean(),
    maxDays: z.number().int().min(REPORT_MAX_DAYS_MIN).max(REPORT_MAX_DAYS_MAX),
    resultDays: z.number().int().min(REPORT_RESULT_DAYS_MIN).max(REPORT_RESULT_DAYS_MAX),
  })
  .strict();
export type MarketingReportSettings = z.output<typeof marketingReportSettingsSchema>;

export const marketingReportSettings = {
  'marketing.report': setting({
    scope: 'store',
    schema: marketingReportSettingsSchema,
    // hardcode-ok: the shipped default (off; a year at most per report; a send's result over a week, as e-mail sends)
    default: { enabled: false, maxDays: 366, resultDays: 7 },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.report.label',
    helpKey: 'marketing.report.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 37,
    version: V283,
  }),
};
