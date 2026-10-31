// S16 · PR 343 (B3.9; BACKEND-ARCHITECTURE §5 MNY-06) — the cost ledger's own settings. Registry version 77 (lane C's
// numbers; PR 345 adds the costs & fees inputs). Every paid call writes a cost row (packages/messages/src/costs.ts
// for messages); Money → Cost ledger (`/admin/money/cost-ledger`) shows them by today, this month and this year, by service, with the latest rows, the
// prepaid balances and the export. The ledger shows; nothing here pays or moves money. Labels: messages/costs.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V343 = 77;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'books', version: V343 } as const;

/** How many of the latest cost rows the page lists, and the most rows one export file holds (a longer period is cut). */
export const costLedgerSchema = z
  .object({
    recentRows: z.int().min(10).max(500),
    exportMaxRows: z.int().min(100).max(200_000),
  })
  .strict();
export type CostLedgerSettings = z.output<typeof costLedgerSchema>;

/**
 * PR 345 (MNY-06) — what each payment gateway keeps of a payment: a share in basis points (100 = 1 %) and a fixed amount
 * in minor units, per provider key (bkash, nagad, sslcommerz …). The owner's own figures: empty as shipped; a provider
 * not listed has no known fee (never guessed).
 */
export const gatewayFeeSchema = z
  .object({
    provider: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    percentBps: z.int().min(0).max(2_000),
    fixedMinor: z.int().min(0).max(100_000),
  })
  .strict();
export const gatewayFeesSchema = z
  .array(gatewayFeeSchema)
  .max(20)
  .refine((a) => new Set(a.map((f) => f.provider)).size === a.length, { message: 'each provider once' });
export type GatewayFee = z.output<typeof gatewayFeeSchema>;

/** PR 345 (MNY-06) — what packing one order costs the shop (box, bag, tape, tag); the setting is null while not known. Owner data. */
export const packagingCostSchema = z.object({ perOrderMinor: z.int().min(0).max(1_000_000) }).strict();

/**
 * PR 344 follow-up (MNY-04; registry version 90, lane C's new range) — a photo or PDF of the receipt on an expense
 * (Money → Expenses): off as shipped; the largest file in MB when on. The file is checked by its contents (a picture or
 * a PDF only) and kept in the media library's "expense-receipts" folder.
 */
export const expenseReceiptsSchema = z.object({ enabled: z.boolean(), maxMb: z.int().min(1).max(20) }).strict();
export type ExpenseReceiptSettings = z.output<typeof expenseReceiptsSchema>;

export const costsSettings = {
  'costs.ledger': setting({
    ...base,
    schema: costLedgerSchema,
    default: { recentRows: 50, exportMaxRows: 20_000 },
    valueType: 'JSON',
    labelKey: 'costs.ledger.label',
    helpKey: 'costs.ledger.help',
    sortOrder: 300,
  }),
  // ---- PR 345 · costs & fees inputs (Money → Costs & fees) ----
  'costs.gatewayFees': setting({
    ...base,
    isOwnerData: true,
    // null = the owner has entered none: no fee is known
    schema: gatewayFeesSchema.nullable(),
    default: null,
    valueType: 'JSON',
    labelKey: 'costs.gatewayFees.label',
    helpKey: 'costs.gatewayFees.help',
    sortOrder: 310,
  }),
  'costs.packaging': setting({
    ...base,
    isOwnerData: true,
    schema: packagingCostSchema.nullable(),
    default: null,
    valueType: 'JSON',
    labelKey: 'costs.packaging.label',
    helpKey: 'costs.packaging.help',
    sortOrder: 320,
  }),
  // ---- PR 344 follow-up · the receipt photo on an expense (Money → Expenses), version 90 ----
  'costs.receipts': setting({
    ...base,
    version: 90,
    schema: expenseReceiptsSchema,
    default: { enabled: false, maxMb: 5 },
    valueType: 'JSON',
    labelKey: 'costs.receipts.label',
    helpKey: 'costs.receipts.help',
    sortOrder: 330,
  }),
};

/**
 * PR 345 — what a gateway keeps of one payment by the owner's figures (rounded to the nearest minor unit), or null when
 * the provider has no figure (unknown is never 0).
 */
export function gatewayFeeMinor(amountMinor: number, provider: string | null, fees: readonly GatewayFee[] | null): number | null {
  const f = provider && fees ? fees.find((x) => x.provider === provider.toLowerCase()) : undefined;
  if (!f) return null;
  return Math.round((amountMinor * f.percentBps) / 10_000) + f.fixedMinor;
}
