// S20 · PR 407 — the admin's printed invoice (Orders › Packing & print › Invoices; the order page's "Print invoice"):
// the same invoice the customer sees (lib/shop/invoice-view.ts, the same words and settings), in the print language
// the owner chose (`documents.invoice.print.lang`), drawn on the server (packages/documents invoice.ts) on paper, on the
// thermal roll, or as one JPG picture for a chat. Each order's invoice is issued first (packages/orders issueInvoice),
// so the printed copy carries its kept number and, after an edit, its "Revised" mark. The barcode is the courier's
// own consignment id, only once a parcel is booked. Nothing here changes an order, a price or COD.
import { orderReceipt } from '@extas/checkout';
import { invoiceJpeg, invoicePdf, PAPER_MM, ROLL_MM, sharpText, type InvoiceDesign, type InvoiceDocument, type InvoicePaper } from '@extas/documents';
import { invoiceOrders, issueInvoice, OrdersError } from '@extas/orders';
import type { InvoiceImageSettings, InvoicePrintSettings } from '@extas/settings';
import type { AdminDeps } from '../admin-auth';
import { mediaDeps } from '../media';
import { shopContextFor, type ShopContext } from '../shop/context';
import { invoiceViewFor, readInvoiceSettings } from '../shop/invoice-load';
import type { InvoiceView } from '../shop/invoice';

/** PR 409: a preview is a small picture (its width in pixels at most; the chat picture's own width when smaller). */
const PREVIEW_PX = 900;

export const INVOICE_LAYOUTS = ['page', 'roll'] as const;
export type InvoiceLayout = (typeof INVOICE_LAYOUTS)[number];
export const INVOICE_FORMATS = ['pdf', 'jpg'] as const;
export type InvoiceFormat = (typeof INVOICE_FORMATS)[number];

export interface InvoiceFile {
  body: Buffer;
  contentType: 'application/pdf' | 'image/jpeg';
  fileName: string;
}

/** The printed copy of one invoice view: the same words, plus the logo, the barcode (when on) and "n/of". */
export function invoiceDocument(view: InvoiceView, c: Pick<ShopContext, 't'>, o: { barcode: boolean; logo: Buffer | null; design?: InvoiceDesign | null }): InvoiceDocument {
  return {
    design: o.design ?? null,
    brand: view.brand,
    logo: o.logo,
    shopLines: view.shopLines,
    heading: view.heading,
    meta: view.meta,
    stamp: view.stamp ?? null,
    barcode: o.barcode && view.courierCode ? view.courierCode : null,
    parties: view.parties,
    cols: view.cols,
    rows: view.rows,
    totals: view.totals,
    payment: view.payment,
    note: view.note,
    footer: view.footer,
    prices: view.prices,
    pageWords: c.t('account.invoice.page'),
  };
}

/** The paper the print settings name. */
export function invoicePaper(set: InvoicePrintSettings, layout: InvoiceLayout): InvoicePaper {
  if (layout === 'roll') return { kind: 'roll', widthMm: ROLL_MM[set.roll] };
  const [w, h] = PAPER_MM[set.paper];
  return { kind: 'page', widthMm: w, heightMm: h };
}

/** The file's name: the invoice number (one) or how many (several), safe characters only. */
export function invoiceFileStem(numbers: readonly string[]): string {
  const raw = numbers.length === 1 ? numbers[0]! : `invoices-${numbers.length}`;
  return raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice';
}

/** The shop's logo (Brand settings) as bytes, when the owner set one and it can be read; else null (the name prints). */
async function logoBytes(deps: AdminDeps, storeId: number, assetId: string | null): Promise<Buffer | null> {
  if (!assetId) return null;
  const media = mediaDeps();
  if (!media) return null;
  try {
    const a = await deps.db.mediaAsset.findFirst({ where: { id: assetId, storeId, archivedAt: null, kind: 'IMAGE' }, select: { storage: true, storageKey: true } });
    if (!a) return null;
    const f = await (await media.storage(storeId, a.storage)).get(a.storageKey);
    return f ? Buffer.from(f.body) : null;
  } catch (e) {
    console.warn(`invoice: the logo could not be read (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** PR 408 (B2.4) — the shop's logo (Brand settings) for the other printed documents' letterhead, or null. */
export async function shopLogo(deps: AdminDeps, storeId: number): Promise<Buffer | null> {
  return logoBytes(deps, storeId, await deps.resolver.value('brand.logo', { storeId }));
}

/** One order's printed invoice: the document, its kept number, and the order it belongs to. */
export interface PrintedInvoice {
  orderId: string;
  number: string;
  doc: InvoiceDocument;
}

/**
 * PR 404 — the printed invoices of the asked orders (each issued first, so it carries its kept number) with the print
 * settings, for one file of invoices or a print run that puts each parcel's invoice after its sticker. Unknown and draft
 * orders are left out; the invoice switched off (`account.invoice.enabled`) → INVOICE_OFF.
 */
export async function printedInvoices(deps: AdminDeps, storeId: number, orderIds: readonly string[]): Promise<{ print: InvoicePrintSettings; image: InvoiceImageSettings; invoices: PrintedInvoice[] }> {
  const v = <K extends 'documents.invoice.print' | 'documents.invoice.image' | 'documents.invoice.design' | 'brand.logo'>(k: K) => deps.resolver.value(k, { storeId });
  const [print, image, logoRef, look] = await Promise.all([v('documents.invoice.print'), v('documents.invoice.image'), v('brand.logo'), v('documents.invoice.design')]);
  const s = await readInvoiceSettings(storeId);
  if (!s['account.invoice'].enabled) throw new OrdersError('INVOICE_OFF', 'the invoice is switched off');
  const orders = await invoiceOrders(deps, storeId, [...orderIds], print.maxPerPdf);
  const c = await shopContextFor(storeId, print.lang);
  const logo = print.logo && orders.length ? await logoBytes(deps, storeId, logoRef) : null;
  const invoices: PrintedInvoice[] = [];
  for (const o of orders) {
    const receipt = await orderReceipt(deps, { storeId, visitorId: null, number: o.number, staff: true });
    if (!receipt) continue;
    const issued = await issueInvoice({ db: deps.db, settings: deps.resolver, now: deps.now }, { storeId, orderId: o.id });
    const view = invoiceViewFor(c, receipt, s, issued ? { number: issued.invoice.number, version: issued.invoice.version, issuedAt: issued.invoice.issuedAt } : null);
    invoices.push({ orderId: o.id, number: view.invoiceNo, doc: invoiceDocument(view, c, { barcode: print.barcode, logo, design: look.design }) });
  }
  return { print, image, invoices };
}

/**
 * The invoices of the asked orders as one file: a PDF on paper or on the roll (each invoice on its own pages), or one
 * JPG picture (one order only). Unknown and draft orders are left out; none left → NOT_FOUND. The invoice switched
 * off (`account.invoice.enabled`) → INVOICE_OFF.
 */
export async function invoiceFile(deps: AdminDeps, storeId: number, input: { orderIds: string[]; layout: InvoiceLayout; format: InvoiceFormat }): Promise<InvoiceFile> {
  if (input.format === 'jpg' && input.orderIds.length !== 1) throw new OrdersError('INVALID_INPUT', 'a picture is made of one invoice', ['orderIds']);
  const { print, image, invoices } = await printedInvoices(deps, storeId, input.orderIds);
  if (!invoices.length) throw new OrdersError('NOT_FOUND', 'no such order', ['orderIds']);
  const docs = invoices.map((i) => i.doc);
  const numbers = invoices.map((i) => i.number);
  const stem = invoiceFileStem(numbers);
  const engine = sharpText();
  if (input.format === 'jpg') {
    const body = await invoiceJpeg(docs[0]!, { widthMm: PAPER_MM[print.paper][0], widthPx: image.widthPx, quality: image.quality }, engine);
    return { body, contentType: 'image/jpeg', fileName: `${stem}.jpg` };
  }
  const body = await invoicePdf(docs, invoicePaper(print, input.layout), print.dpi, engine, { title: numbers.length === 1 ? numbers[0] : stem, created: deps.now?.() });
  return { body, contentType: 'application/pdf', fileName: `${stem}.pdf` };
}

/** PR 409 — whether the store has an issued invoice to preview (the page asks for no picture before there is one). */
export async function hasIssuedInvoice(deps: Pick<AdminDeps, 'db'>, storeId: number): Promise<boolean> {
  return !!(await deps.db.generatedDocument.findFirst({ where: { storeId, kind: 'INVOICE', orderId: { not: null } }, select: { id: true } }));
}

/**
 * PR 409 (ORD-04d) — the live preview of a design: the latest order's issued invoice drawn in `design` as the chat
 * picture (the owner's own words, parts, logo and settings), never saved, sent or counted. None issued yet → NOT_FOUND.
 */
export async function invoicePreview(deps: AdminDeps, storeId: number, design: InvoiceDesign): Promise<Buffer> {
  const latest = await deps.db.generatedDocument.findFirst({ where: { storeId, kind: 'INVOICE', orderId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { orderId: true } });
  if (!latest?.orderId) throw new OrdersError('NOT_FOUND', 'no invoice issued yet', ['orderId']);
  const { print, image, invoices } = await printedInvoices(deps, storeId, [latest.orderId]);
  if (!invoices.length) throw new OrdersError('NOT_FOUND', 'no invoice issued yet', ['orderId']);
  return invoiceJpeg({ ...invoices[0]!.doc, design }, { widthMm: PAPER_MM[print.paper][0], widthPx: Math.min(image.widthPx, PREVIEW_PX), quality: image.quality }, sharpText());
}
