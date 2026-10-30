// CN-028 · PR 617, 618 (CN-029 Phase 1, Hisabi's lane) — what Retail sends the ERP: the daily summary, the fixed costs
// and the Books status card. Registry version 69. Labels: messages/books-summary.<lang>.json. The send time, the waits
// between tries, the fixed-cost spread and how long a day stays open are Phase 0's (registry-erp-v6.ts, v62); these are
// only how often the shop's own jobs look, how far back the ERP's stored copy is checked, which cost lines the store
// never has, and when old unchecked returns are flagged. None of them moves money, and none is the owner's data.
//
// - `erp.summary.tickSeconds` (installation): how often the shop looks for a summary or a month's fixed costs to send
//   (yesterday's at `erp.summary.sendAt`, a try that is due, a day the ERP asked for with `summary.missing`).
// - `erp.summary.checkMinutes` (installation): how often the open days are built again (a late fact makes a new
//   version) and the ERP's stored copy is compared (`GET /daily-summaries`, `GET /fixed-costs`): a day the ERP lacks or
//   holds in another version is sent again. This is also the catch-up for a lost `summary.missing` (follow-up 490).
// - `erp.summary.gapDays`: how many days back the stored-copy check looks for days the ERP does not have.
// - `erp.summary.noCostLines`: cost lines the store never has (for example accessories); they are sent as 0 and never
//   listed as incomplete. Empty by default: every cost line needs a figure each day (an entry, or "none today"),
//   otherwise the day lists it in `incomplete` — a missing figure is never sent as 0.
// - `books.status.waitingCheckWarnDays`: returned pieces waiting for the owner's check longer than this show in "Needs
//   you now" on the Books status card (the ERP keeps its own 7, 10 or 15 days; default 7, owner answer Q4).
// - `books.costs.maxLineMinor`, `books.costs.maxMonthMinor` (PR 618, qa-gate): the most one cost (a fixed-cost line or
//   one day's cost entry) and one month's fixed costs in all may be, in minor units. A typing slip (an extra zero or
//   ten) is refused instead of being kept and sent; the caps also keep every sum exact. Defaults ৳10 crore a line and
//   ৳40 crore a month — far above a shop's real costs, so they only catch mistakes.
// - `books.costs.listLimit` (PR 618, qa-gate): how many cost entries Money → Costs lists at once (the newest first); the
//   page says when there are more.
import { z } from 'zod';
import { COST_SUMMARY_LINES } from '@extas/erp-types';
import { setting } from './define';

const V = 69;

const erp = { scope: 'store', isOwnerData: false, isPublic: false, group: 'erp', version: V } as const;
const books = { scope: 'store', isOwnerData: false, isPublic: false, group: 'books', version: V } as const;

/** `erp.summary.noCostLines`: each cost line at most once. */
export const noCostLinesSchema = z
  .array(z.enum(COST_SUMMARY_LINES))
  .max(COST_SUMMARY_LINES.length)
  .refine((a) => new Set(a).size === a.length, { message: 'each cost line once' });

export const booksSummarySettings = {
  'erp.summary.tickSeconds': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(15).max(3600),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.summary.tickSeconds.label',
    helpKey: 'erp.summary.tickSeconds.help',
    sortOrder: 17,
  }),
  'erp.summary.checkMinutes': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(5).max(1440),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.summary.checkMinutes.label',
    helpKey: 'erp.summary.checkMinutes.help',
    sortOrder: 18,
  }),
  'erp.summary.gapDays': setting({
    ...erp,
    schema: z.int().min(1).max(400),
    default: 31,
    valueType: 'INT',
    labelKey: 'erp.summary.gapDays.label',
    helpKey: 'erp.summary.gapDays.help',
    sortOrder: 19,
  }),
  'erp.summary.noCostLines': setting({
    ...erp,
    schema: noCostLinesSchema,
    default: [] as (typeof COST_SUMMARY_LINES)[number][],
    valueType: 'JSON',
    labelKey: 'erp.summary.noCostLines.label',
    helpKey: 'erp.summary.noCostLines.help',
    sortOrder: 20,
  }),
  'books.status.waitingCheckWarnDays': setting({
    ...books,
    schema: z.int().min(1).max(90),
    default: 7,
    valueType: 'INT',
    labelKey: 'books.status.waitingCheckWarnDays.label',
    helpKey: 'books.status.waitingCheckWarnDays.help',
    sortOrder: 7,
  }),
  'books.costs.maxLineMinor': setting({
    ...books,
    schema: z.int().min(1).max(10_000_000_000_000),
    default: 10_000_000_000,
    valueType: 'INT',
    labelKey: 'books.costs.maxLineMinor.label',
    helpKey: 'books.costs.maxLineMinor.help',
    sortOrder: 8,
  }),
  'books.costs.maxMonthMinor': setting({
    ...books,
    schema: z.int().min(1).max(40_000_000_000_000),
    default: 40_000_000_000,
    valueType: 'INT',
    labelKey: 'books.costs.maxMonthMinor.label',
    helpKey: 'books.costs.maxMonthMinor.help',
    sortOrder: 9,
  }),
  'books.costs.listLimit': setting({
    ...books,
    schema: z.int().min(50).max(5000),
    default: 500,
    valueType: 'INT',
    labelKey: 'books.costs.listLimit.label',
    helpKey: 'books.costs.listLimit.help',
    sortOrder: 10,
  }),
};
