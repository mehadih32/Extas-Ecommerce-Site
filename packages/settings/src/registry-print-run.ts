// S20 · PR 404 (ORD-04a; Blueprint B1.3, B1.4) — the print run: what one press prints (registry version 150, lane C's
// range). Labels: messages/print-run.<lang>.json (the Orders group; the admin's place is Orders › Packing & print ›
// Print run, docs/BACKEND-ARCHITECTURE.md ORD-04a).
//
// `what`: the courier stickers only (as before this setting), each parcel's sticker followed by its customer invoice,
// or the invoices only — always in packing order (the category and style with the most pieces first), one PDF.
// `invoiceLayout`: an invoice in that PDF on paper (the invoice's own paper, `documents.invoice.print.paper`) or on the
// thermal roll (`documents.invoice.print.roll`). Printing never books, re-books or changes a parcel, a price or COD;
// an invoice prints only what the order already holds (PR 407).
//
// S20 · PR 406 (ORD-04c; registry version 151) — the handover page's "Handed over" history per courier: the batches
// handed over in the last `days` days, at most `perCourier` per courier, each with its rider, its parcels and the
// amount the courier collects, and a copy of its sheet to print again (proof for a courier's count or a lost sheet).
import { z } from 'zod';
import { setting } from './define';

const V404 = 150;
const V406 = 151;

export const PRINT_RUN_WHATS = ['sticker', 'both', 'invoice'] as const;
export type PrintRunWhat = (typeof PRINT_RUN_WHATS)[number];
export const PRINT_RUN_INVOICE_LAYOUTS = ['page', 'roll'] as const;

export const printRunSchema = z.object({ what: z.enum(PRINT_RUN_WHATS), invoiceLayout: z.enum(PRINT_RUN_INVOICE_LAYOUTS) }).strict();
export type PrintRunSettings = z.output<typeof printRunSchema>;

export const handoverHistorySchema = z.object({ days: z.int().min(1).max(90), perCourier: z.int().min(1).max(50) }).strict();
export type HandoverHistorySettings = z.output<typeof handoverHistorySchema>;

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
  'fulfilment.handover.history': setting({
    scope: 'store',
    group: 'orders',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: handoverHistorySchema,
    default: { days: 7, perCourier: 10 }, // hardcode-ok: how far back the page looks (a week) and how many batches it lists; the owner changes both on the page
    labelKey: 'fulfilment.handover.history.label',
    helpKey: 'fulfilment.handover.history.help',
    sortOrder: 964,
    version: V406,
  }),
};
