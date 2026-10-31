// S16 · PR 343 (B3.9; BACKEND-ARCHITECTURE §5 MNY-06) — the cost ledger's own settings. Registry version 77 (lane C's
// numbers). Every paid call writes a cost row (packages/messages/src/costs.ts for messages); Money → Cost ledger
// (`/admin/money/cost-ledger`) shows them by today, this month and this year, by service, with the latest rows, the
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
};
