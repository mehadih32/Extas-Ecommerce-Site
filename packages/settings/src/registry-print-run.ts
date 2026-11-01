// S20 · PR 404 (ORD-04a; Blueprint B1.3, B1.4) — the print run: what one press prints (registry version 150, lane C's
// range). Labels: messages/print-run.<lang>.json (the Orders group; the admin's place is Orders › Packing & print ›
// Print run, docs/BACKEND-ARCHITECTURE.md ORD-04a).
//
// `what`: the courier stickers only (as before this setting), each parcel's sticker followed by its customer invoice,
// or the invoices only — always in packing order (the category and style with the most pieces first), one PDF.
// `invoiceLayout`: an invoice in that PDF on paper (the invoice's own paper, `documents.invoice.print.paper`) or on the
// thermal roll (`documents.invoice.print.roll`). Printing never books, re-books or changes a parcel, a price or COD;
// an invoice prints only what the order already holds (PR 407).
import { z } from 'zod';
import { setting } from './define';

const V404 = 150;

export const PRINT_RUN_WHATS = ['sticker', 'both', 'invoice'] as const;
export type PrintRunWhat = (typeof PRINT_RUN_WHATS)[number];
export const PRINT_RUN_INVOICE_LAYOUTS = ['page', 'roll'] as const;

export const printRunSchema = z.object({ what: z.enum(PRINT_RUN_WHATS), invoiceLayout: z.enum(PRINT_RUN_INVOICE_LAYOUTS) }).strict();
export type PrintRunSettings = z.output<typeof printRunSchema>;

export const printRunSettings = {
  'fulfilment.printRun': setting({
    scope: 'store',
    group: 'orders',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: printRunSchema,
    default: { what: 'sticker', invoiceLayout: 'page' },
    labelKey: 'fulfilment.printRun.label',
    helpKey: 'fulfilment.printRun.help',
    sortOrder: 963,
    version: V404,
  }),
};
