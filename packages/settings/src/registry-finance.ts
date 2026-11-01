// S16 (CN-031 lane B, after launch) — finance, costs & reports settings, registry versions 160–169 (lane B's numbers).
//   v160 · PR 347 `costs.report` — Money → Cost ledger → Costs report: the longest period one report covers and the
//          most rows a "by day" report lists (a longer period is shown by month). Read-only report; nothing moves money.
//   v161 · PR 348 `costs.allocation` — the per-order profit: spread the imported ad spend over the orders delivered in
//          the store's month (or day), on as the blueprint's "More options" says; estimated and labelled so.
//   v162 · PR 350 `vat.system` — the VAT system (B3.10, §59 answer 23: "present and off"): off as shipped. Prices are VAT
//          inclusive only, so switching it on never changes a price; it only shows the VAT already inside Sales.
//   v163 · PR 350 `vat.rates` — the VAT rates (owner data, empty as shipped, never guessed): a default rate, a rate per
//          category (a sub-category without one takes its parent's) and a rate per product; product > category > default.
// Labels: messages/finance.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V347 = 160;
const V348 = 161;
const V350 = 162;
const V350_RATES = 163;

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

/** PR 350 — the VAT system's switch, and whether the delivery charge carries VAT too (the accountant decides). */
export const vatSystemSchema = z.object({ enabled: z.boolean(), onDelivery: z.boolean() }).strict();
export type VatSystemSettings = z.output<typeof vatSystemSchema>;

/** A VAT rate in basis points: 1500 = 15 %; 0 is a real rate (zero-rated), never "not set". */
export const vatBpsSchema = z.int().min(0).max(5_000);

/** PR 350 — the owner's VAT rates: a default (null = none), per category (up to 500) and per product (up to 2,000), each target once. */
export const vatRatesSchema = z
  .object({
    defaultBps: vatBpsSchema.nullable(),
    categories: z.array(z.object({ categoryId: z.uuid(), bps: vatBpsSchema }).strict()).max(500),
    products: z.array(z.object({ productId: z.uuid(), bps: vatBpsSchema }).strict()).max(2_000),
  })
  .strict()
  .refine((v) => new Set(v.categories.map((c) => c.categoryId)).size === v.categories.length, { message: 'each category once', path: ['categories'] })
  .refine((v) => new Set(v.products.map((c) => c.productId)).size === v.products.length, { message: 'each product once', path: ['products'] });
export type VatRates = z.output<typeof vatRatesSchema>;

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
  'vat.system': setting({
    ...base,
    version: V350,
    schema: vatSystemSchema,
    default: { enabled: false, onDelivery: false },
    valueType: 'JSON',
    labelKey: 'vat.system.label',
    helpKey: 'vat.system.help',
    sortOrder: 360,
  }),
  'vat.rates': setting({
    ...base,
    version: V350_RATES,
    isOwnerData: true,
    // null = the owner has entered no rate at all
    schema: vatRatesSchema.nullable(),
    default: null,
    valueType: 'JSON',
    labelKey: 'vat.rates.label',
    helpKey: 'vat.rates.help',
    sortOrder: 370,
  }),
};
