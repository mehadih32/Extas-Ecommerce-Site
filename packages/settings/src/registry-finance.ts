// S16 (CN-031 lane B, after launch) — finance, costs & reports settings, registry versions 160–169 (lane B's numbers).
//   v160 · PR 347 `costs.report` — Money → Cost ledger → Costs report: the longest period one report covers and the
//          most rows a "by day" report lists (a longer period is shown by month). Read-only report; nothing moves money.
//   v161 · PR 348 `costs.allocation` — the per-order profit: spread the imported ad spend over the orders delivered in
//          the store's month (or day), on as the blueprint's "More options" says; estimated and labelled so.
// Labels: messages/finance.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V347 = 160;
const V348 = 161;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'books' } as const;

/** PR 347 — how long a costs report may run and how many day rows it lists before it switches to months. */
export const costReportSchema = z
  .object({
    maxDays: z.int().min(31).max(3_660),
    maxDayRows: z.int().min(7).max(1_000),
  })
  .strict()
  .refine((v) => v.maxDayRows <= v.maxDays, { message: 'maxDayRows must not be more than maxDays' });
export type CostReportSettings = z.output<typeof costReportSchema>;

/** PR 348 — whether each delivered order carries a share of the ad spend, and over which period it is spread. */
export const costAllocationSchema = z.object({ adSpend: z.boolean(), adBasis: z.enum(['month', 'day']) }).strict();
export type CostAllocationSettings = z.output<typeof costAllocationSchema>;

export const financeSettings = {
  'costs.report': setting({
    ...base,
    version: V347,
    schema: costReportSchema,
    default: { maxDays: 1_830, maxDayRows: 92 },
    valueType: 'JSON',
    labelKey: 'costs.report.label',
    helpKey: 'costs.report.help',
    sortOrder: 340,
  }),
  'costs.allocation': setting({
    ...base,
    version: V348,
    schema: costAllocationSchema,
    default: { adSpend: true, adBasis: 'month' },
    valueType: 'JSON',
    labelKey: 'costs.allocation.label',
    helpKey: 'costs.allocation.help',
    sortOrder: 350,
  }),
};
