// @extas/documents — the fulfilment documents rendered on the server (S08 · PR 179–181; Blueprint B1.4, B1.6, B1.7).
//
// - pdf.ts: a small PDF writer; every page is one greyscale picture at the printer's dots per inch, so a page prints
//   the same everywhere and Bengali letters never break on a printer without Bengali fonts.
// - code128.ts: the Code 128 barcode of a courier's consignment id (the id always comes from the courier).
// - layout.ts: one page being drawn — lines, boxes, the barcode, and text shaped by the server's fonts (Pango).
// - sticker.ts: the courier sticker (PR 179), fitted to the owner's sticker size; the pieces carry on onto a second
//   sticker only when even the smallest type does not fit.
// - list.ts: a paper list on A4/A5 (PR 180 the rider's handover sheet, PR 181 the picking list): the letterhead on every
//   page, a header row that repeats, rows that never split, tick boxes, marks in a black box, signatures at the end.
// - invoice.ts: the customer invoice (PR 407) on A4/A5 paper, on a thermal roll as long as the invoice, and as one tall
//   JPG picture for a chat; the logo or the shop's name on every page, the courier's barcode, a revised version marked.
// - quality.ts (PR 408, Blueprint B2.4): the print rules checked on what was drawn — nothing cut, nothing wider than
//   its box, no text over text, no ink in the band a printer cannot reach, black-and-white safe.
//
// Pure: data in (already in words), PDF bytes out. Nothing here reads the database or the settings; the callers
// (@extas/shipping for the data, the admin routes for the words) do.
export { CODE128_PATTERNS, QUIET_MODULES, canEncode, code128Modules, code128Svg, code128Values, code128Widths } from './code128';
export { mmToPt, mmToPx, writePdf, type PdfPage } from './pdf';
export { FONT_FAMILIES, Sheet, overlaps, sharpText, tile, type TextBlock, type TextEngine, type TextStyle } from './layout';
export { stickerPages, stickerPdf, type StickerInput, type StickerItem, type StickerLayout, type StickerWords } from './sticker';
export { PAPER_MM, listPages, listPdf, type ListColumn, type ListDocument, type ListRow, type Paper } from './list';
export { ROLL_MM, invoiceJpeg, invoicePages, invoicePdf, type InvoiceDocRow, type InvoiceDocument, type InvoicePaper } from './invoice';
export { pageQuality, printQuality, type PageQuality, type PrintProblem } from './quality';
