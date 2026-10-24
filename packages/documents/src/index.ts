// @extas/documents — the fulfilment documents rendered on the server (S08 · PR 179–181; Blueprint B1.4, B1.6, B1.7).
//
// - pdf.ts: a small PDF writer; every page is one greyscale picture at the printer's dots per inch, so a page prints
//   the same everywhere and Bengali letters never break on a printer without Bengali fonts.
// - code128.ts: the Code 128 barcode of a courier's consignment id (the id always comes from the courier).
// - layout.ts: one page being drawn — lines, boxes, the barcode, and text shaped by the server's fonts (Pango).
// - sticker.ts: the courier sticker (PR 179), fitted to the owner's sticker size; the pieces carry on onto a second
//   sticker only when even the smallest type does not fit.
//
// Pure: data in (already in words), PDF bytes out. Nothing here reads the database or the settings; the callers
// (@extas/shipping for the data, the admin routes for the words) do.
export { CODE128_PATTERNS, QUIET_MODULES, canEncode, code128Modules, code128Svg, code128Values, code128Widths } from './code128';
export { mmToPt, mmToPx, writePdf, type PdfPage } from './pdf';
export { FONT_FAMILIES, Sheet, sharpText, tile, type TextBlock, type TextEngine, type TextStyle } from './layout';
export { stickerPages, stickerPdf, type StickerInput, type StickerItem, type StickerLayout, type StickerWords } from './sticker';
