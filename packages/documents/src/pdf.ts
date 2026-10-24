// PR 179 — a small PDF writer for the fulfilment documents: each page is one greyscale picture drawn at the printer's
// dots per inch (203 for a thermal sticker printer, 300 or more for paper), stored losslessly (Flate) and placed to fill
// the page at its exact size in millimetres. A picture page prints the same on every printer and viewer — the Bengali
// letters are shaped once on the server, so a printer without Bengali fonts cannot break them — and nothing is cut or
// overlaps, because what the server drew is what prints. PDF 1.4, no fonts, no scripts.
import { deflateSync } from 'node:zlib';

export interface PdfPage {
  /** Page size in PDF points (1/72 inch). */
  widthPt: number;
  heightPt: number;
  /** The page's picture: 8-bit greyscale, one byte per pixel, row by row from the top. */
  image: { width: number; height: number; gray: Buffer };
}

/** Millimetres to PDF points. */
export const mmToPt = (mm: number): number => (mm * 72) / 25.4;
/** Millimetres to pixels at `dpi`. */
export const mmToPx = (mm: number, dpi: number): number => Math.round((mm * dpi) / 25.4);

/** A PDF text string: ASCII as it is, anything else as UTF-16 (with its byte order mark). */
function pdfString(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  const buf = Buffer.from(`\uFEFF${s}`, 'utf16le').swap16();
  return `<${buf.toString('hex').toUpperCase()}>`;
}

/** The PDF of `pages` (at least one), with a title in the document's properties. */
export function writePdf(pages: readonly PdfPage[], meta: { title?: string; created?: Date } = {}): Buffer {
  if (!pages.length) throw new Error('a PDF needs at least one page');
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b;
    chunks.push(buf);
    size += buf.length;
  };
  const obj = (n: number, body: (Buffer | string)[]) => {
    offsets[n] = size;
    put(`${n} 0 obj\n`);
    for (const b of body) put(b);
    put('\nendobj\n');
  };
  // 1 catalog · 2 page tree · 3 info · then per page: page, contents, picture
  const first = 4;
  const kids = pages.map((_, i) => `${first + i * 3} 0 R`).join(' ');
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`]);
  const when = (meta.created ?? new Date()).toISOString().replace(/[-:T]/g, '').slice(0, 14);
  obj(3, [`<< /CreationDate (D:${when}Z)${meta.title ? ` /Title ${pdfString(meta.title)}` : ''} >>`]);
  pages.forEach((p, i) => {
    const n = first + i * 3;
    const w = p.widthPt.toFixed(2);
    const h = p.heightPt.toFixed(2);
    if (p.image.gray.length !== p.image.width * p.image.height) throw new Error('page picture: one byte per pixel');
    obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /P${i} ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`]);
    const content = `q ${w} 0 0 ${h} 0 0 cm /P${i} Do Q`;
    obj(n + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    const data = deflateSync(p.image.gray);
    obj(n + 2, [`<< /Type /XObject /Subtype /Image /Width ${p.image.width} /Height ${p.image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, data, '\nendstream']);
  });
  const xref = size;
  const count = first + pages.length * 3;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
