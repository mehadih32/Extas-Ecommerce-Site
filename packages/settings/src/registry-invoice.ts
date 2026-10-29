// S20 · PR 407 — the customer invoice: how it is printed, how its picture for a chat is made, and how the invoices of
// placed orders are issued. Registry version 63. Labels: messages/invoice.<lang>.json (the Orders group; the admin's
// place is Orders → Packing & print → Invoices, docs/ADMIN-ARCHITECTURE.md §4.2 "invoice designs").
//
// What the invoice says — its parts, its number, the owner's note and footer — stays in `account.invoice` (PR 136), so
// the customer's page and the printed copy always say the same. These keys only steer the printed and picture copies.
// Nothing here moves money, changes a price, a discount or COD: an invoice shows only what the order already stores.
import { z } from 'zod';
import { setting } from './define';

const V = 63;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/** PR 407 — the paper of a printed invoice (A4 or A5) and the thermal roll (80 or 58 mm wide; international sizes). */
export const INVOICE_PAPERS = ['a4', 'a5'] as const;
export const INVOICE_ROLLS = ['roll80', 'roll58'] as const;
export const INVOICE_DPIS = [150, 203, 300] as const;
export type InvoicePaper = (typeof INVOICE_PAPERS)[number];
export type InvoiceRoll = (typeof INVOICE_ROLLS)[number];

/**
 * PR 407 (B2.1, B2.4) — the printed invoice. `paper`: the sheet size of a paper invoice; `roll`: the width of the thermal
 * roll (its length follows the invoice); `dpi`: the printer's dots per inch; `lang`: the language of the printed words
 * (the order's own names and address print as stored); `barcode`: the courier's consignment barcode on the invoice,
 * once a parcel is booked (always the courier's own id); `logo`: the shop's logo (Brand settings) at the top instead of
 * its name, when there is one; `maxPerPdf`: how many invoices one print takes.
 */
export const invoicePrintSchema = z
  .object({
    paper: z.enum(INVOICE_PAPERS),
    roll: z.enum(INVOICE_ROLLS),
    dpi: z.union([z.literal(INVOICE_DPIS[0]), z.literal(INVOICE_DPIS[1]), z.literal(INVOICE_DPIS[2])]),
    lang: z.enum(['en', 'bn']),
    barcode: z.boolean(),
    logo: z.boolean(),
    maxPerPdf: z.int().min(1).max(500),
  })
  .strict();

/** PR 407 — the copy sent in a chat: a picture (JPG, §59 answer 45) or the PDF. */
export const INVOICE_IMAGE_FORMATS = ['jpg', 'pdf'] as const;

/**
 * PR 407 (B2.1, §59 answer 45) — the invoice copy for a chat (WhatsApp and the others, once connected): a full-page
 * picture by default. `widthPx`: the picture's width (its height follows the invoice); `quality`: the JPG quality.
 */
export const invoiceImageSchema = z
  .object({ format: z.enum(INVOICE_IMAGE_FORMATS), widthPx: z.int().min(600).max(2400), quality: z.int().min(50).max(100) })
  .strict();

/**
 * PR 407 (B2.1 locked: "generated automatically on every order; one invoice per order; regenerated only if the order is
 * edited") — issuing. `enabled`: every placed order gets its invoice (number and the content as issued) without anyone
 * opening it; a background job looks every `everyMinutes` at orders changed in the last `lookbackDays` and takes at most
 * `perRun` orders a run (an older order gets its invoice when it is opened or printed). An order whose lines,
 * money, name or address were edited gets a new version with the same number; a payment or a delivery never does.
 */
export const invoiceIssueSchema = z
  .object({ enabled: z.boolean(), everyMinutes: z.int().min(1).max(1440), perRun: z.int().min(1).max(5000), lookbackDays: z.int().min(1).max(3650) })
  .strict();

export const invoiceSettings = {
  'documents.invoice.print': setting({
    ...base,
    valueType: 'JSON',
    schema: invoicePrintSchema,
    default: { paper: 'a4', roll: 'roll80', dpi: 203, lang: 'en', barcode: true, logo: true, maxPerPdf: 100 },
    labelKey: 'documents.invoice.print.label',
    helpKey: 'documents.invoice.print.help',
    sortOrder: 960,
  }),
  'documents.invoice.image': setting({
    ...base,
    valueType: 'JSON',
    schema: invoiceImageSchema,
    default: { format: 'jpg', widthPx: 1240, quality: 85 },
    labelKey: 'documents.invoice.image.label',
    helpKey: 'documents.invoice.image.help',
    sortOrder: 961,
  }),
  'documents.invoice.issue': setting({
    ...base,
    valueType: 'JSON',
    schema: invoiceIssueSchema,
    default: { enabled: true, everyMinutes: 10, perRun: 200, lookbackDays: 30 },
    labelKey: 'documents.invoice.issue.label',
    helpKey: 'documents.invoice.issue.help',
    sortOrder: 962,
  }),
};

export type InvoicePrintSettings = z.output<typeof invoicePrintSchema>;
export type InvoiceImageSettings = z.output<typeof invoiceImageSchema>;
export type InvoiceIssueSettings = z.output<typeof invoiceIssueSchema>;
