// S20 · PR 408 (Blueprint B2.4) — the admin's "Print check": every printed document drawn at every size the owner can
// choose, in the owner's own settings (printer dots, language, scale, the letterhead), from made-up sample words
// (messages `ful.sticker.sample`, `ful.check.sample`), and each one checked by @extas/documents' print rules: nothing
// cut, nothing wider than its box, no text over text, no ink in the outer band (`documents.printQuality.edgeMm`),
// black-and-white safe. The sticker at each sticker size, the picking list and the handover sheet on A4 and A5, the
// invoice on A4, A5 and both thermal rolls. Nothing is printed, kept or counted; no order or parcel is read.
import { invoicePages, listPages, PAPER_MM, printQuality, ROLL_MM, sharpText, type InvoiceDocument, type PrintProblem, type TextEngine } from '@extas/documents';
import { INVOICE_PAPERS, INVOICE_ROLLS, LIST_PAPERS, STICKER_SIZES, type HandoverSheetSettings, type InvoicePrintSettings, type PickingListSettings, type StickerLayoutSettings } from '@extas/settings';
import { groupPicking, type HandoverSheet, type PickingList } from '@extas/shipping';
import { formatMoney } from '@/lib/shop/lang';
import { t } from '@/lib/i18n';
import { handoverDocument, type Letterhead } from './handover';
import { fulfilDicts } from './i18n';
import { pickingDocument } from './picking';
import { oneSticker, sampleParcel, stickerInput, type StickerContext } from './sticker';

export const PRINT_DOCS = ['sticker', 'picking', 'handover', 'invoice'] as const;
export type PrintDoc = (typeof PRINT_DOCS)[number];

/** One document at one size: its pages and the rules it broke (none: it prints right). */
export interface PrintCheckRow {
  doc: PrintDoc;
  /** The size's key: a sticker size, a paper (a4, a5) or a roll (roll80, roll58). */
  size: string;
  pages: number;
  problems: PrintProblem[];
}

export interface PrintCheckInput {
  sticker: StickerContext;
  picking: PickingListSettings;
  handover: HandoverSheetSettings;
  invoice: InvoicePrintSettings;
  head: Letterhead;
  currency: string;
  timeZone: string;
  edgeMm: number;
  /** The moment the samples say they were printed (ISO). */
  at: string;
}

/** How many sample rows the lists and the invoice carry: enough to run onto a second page. */
const SAMPLE_ROWS = 40;

const sampleWords = (lang: 'en' | 'bn') => {
  const d = fulfilDicts[lang];
  return { s: (k: string) => t(d, `ful.sticker.sample.${k}`), c: (k: string) => t(d, `ful.check.sample.${k}`) };
};

function sampleSheet(lang: 'en' | 'bn', currency: string, at: string): HandoverSheet {
  const { s } = sampleWords(lang);
  const amount = Number(s('amountMinor')) || 0;
  const lines = Array.from({ length: SAMPLE_ROWS }, (_, i) => ({ shipmentId: `s${i}`, orderId: `o${i}`, orderNumber: `${s('order')}${i}`, consignmentId: `${s('consignment')}${i}`, receiverName: s('name'), pieces: 1 + (i % 3), collectMinor: i % 5 ? amount : 0 }));
  return {
    batchId: '00000000-0000-4000-8000-000000000000',
    courierName: s('courier'),
    currency,
    practice: true,
    printCount: 1,
    printedAt: at,
    lines,
    totals: { parcels: lines.length, pieces: lines.reduce((n, l) => n + l.pieces, 0), collectMinor: lines.reduce((n, l) => n + l.collectMinor, 0) },
    replay: false,
  };
}

function sampleList(lang: 'en' | 'bn'): PickingList {
  const { s } = sampleWords(lang);
  const lines = Array.from({ length: SAMPLE_ROWS }, (_, i) => ({ category: s('item1'), styleKey: `st${i % 8}`, style: `${s(i % 2 ? 'item1' : 'item2')} ${i % 8}`, colour: s(i % 2 ? 'colour1' : 'colour2'), size: `${s('size1')}${i}`, variantId: `v${i}`, quantity: 1 + (i % 4) }));
  const groups = groupPicking(lines, null);
  const pieces = lines.reduce((n, l) => n + l.quantity, 0);
  return { groups, categoryBn: {}, summary: { orders: SAMPLE_ROWS, pieces, lineItems: lines.length, categories: [{ name: s('item1'), nameBn: null, pieces }], shortages: 0, shortPieces: 0, held: 0, pulled: 0 }, held: [], orderIds: [], range: { from: null, to: null }, shortagesMarked: false };
}

function sampleInvoice(lang: 'en' | 'bn', currency: string, head: Letterhead): InvoiceDocument {
  const { s, c } = sampleWords(lang);
  const money = (minor: number) => formatMoney(minor, currency, 'en', false, 'en', '');
  const unit = Number(s('amountMinor')) || 0;
  return {
    brand: head.name ?? s('courier'),
    logo: head.logo ?? null,
    shopLines: [head.address ?? '', head.phone ?? ''],
    heading: c('heading'),
    meta: [`${c('number')} ${s('order')}`, s('order'), s('tracking')],
    stamp: c('stamp'),
    barcode: { value: s('consignment'), caption: `${s('courier')} · ${s('consignment')}` },
    parties: [
      { label: c('billed'), strong: s('name'), lines: [s('phone')] },
      { label: c('deliver'), lines: [s('address')] },
    ],
    cols: { no: '#', item: c('item'), qty: c('qty'), unit: c('unit'), amount: c('amount') },
    rows: Array.from({ length: SAMPLE_ROWS }, (_, i) => ({ no: String(i + 1), name: s(i % 2 ? 'item1' : 'item2'), subs: [`${s('colour1')} · ${s('size1')}`], marks: [], qty: String(1 + (i % 3)), unit: money(unit), amount: money(unit * (1 + (i % 3))) })),
    totals: [
      { label: c('subtotal'), value: money(unit * SAMPLE_ROWS * 2) },
      { label: c('total'), value: money(unit * SAMPLE_ROWS * 2), kind: 'total' },
    ],
    payment: { title: c('payment'), lines: [money(unit * SAMPLE_ROWS * 2)] },
    note: [s('note')],
    footer: [c('footer')],
    pageWords: t(fulfilDicts[lang], 'ful.handover.sheet.page'),
  };
}

/** Every document at every size, checked. Slow on purpose (a few seconds): the admin runs it when he asks. */
export async function printCheck(input: PrintCheckInput, engine: TextEngine = sharpText()): Promise<PrintCheckRow[]> {
  const rows: PrintCheckRow[] = [];
  const opts = { edgeMm: input.edgeMm };
  const put = (doc: PrintDoc, size: string, pages: Parameters<typeof printQuality>[0]) => rows.push({ doc, size, ...printQuality(pages, opts) });

  const lang = input.sticker.layout.lang;
  const parcel = sampleParcel(fulfilDicts[lang], input.currency);
  const sticker = stickerInput({ ...parcel, items: [...parcel.items, ...parcel.items, ...parcel.items] }, input.sticker);
  for (const size of STICKER_SIZES) {
    const layout: StickerLayoutSettings = { ...input.sticker.layout, size };
    // a sticker is checked on its own (a shared sheet only places the same pictures four to a page)
    put('sticker', size, await oneSticker(sticker, layout, engine));
  }
  for (const paper of LIST_PAPERS) {
    put('picking', paper, await listPages(pickingDocument(sampleList(input.picking.lang), { ...input.picking, paper }, input.head, input.timeZone, input.at), engine));
    put('handover', paper, await listPages(handoverDocument(sampleSheet(input.handover.lang, input.currency, input.at), { ...input.handover, paper }, input.head, input.timeZone), engine));
  }
  const inv = sampleInvoice(input.invoice.lang, input.currency, input.head);
  for (const paper of INVOICE_PAPERS) put('invoice', paper, await invoicePages(inv, { kind: 'page', widthMm: PAPER_MM[paper][0], heightMm: PAPER_MM[paper][1] }, input.invoice.dpi, engine));
  for (const roll of INVOICE_ROLLS) put('invoice', roll, await invoicePages(inv, { kind: 'roll', widthMm: ROLL_MM[roll] }, input.invoice.dpi, engine));
  return rows;
}
