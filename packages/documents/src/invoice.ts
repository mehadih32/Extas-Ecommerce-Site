// PR 407 (Blueprint B2.1, B2.4) — the customer invoice as a printed document: on paper (A4/A5), on a thermal roll (80
// or 58 mm, as long as the invoice), and as one tall picture for a chat (the WhatsApp invoice is a full-page JPG with
// the logo, §59 answer 45). The same words as the customer's invoice page (the web app's invoice view, every word
// already in the shop's language and every amount already written): the shop's letterhead — its logo or its name, then
// its own lines — on every page, the invoice's heading, number, order and date, a mark when it is a revised version,
// the courier's consignment barcode once the parcel is booked (always the courier's own id), the customer's side, the
// lines with a header row that repeats on every page and rows that never split, the stored totals, how it is paid,
// the owner's note and the footer, and "n/of" at the foot of every page. Black-and-white safe: a mark is white on a
// black box, nothing depends on colour. Nothing is cut or overlaps: every block is measured before it is placed.
//
// PR 409 (ORD-04d) — seven designs, each a set of choices on the same measured layout (so every one keeps the B2.4
// rules): classic (the name centred over a heavy rule), minimal (left, hairline rules, a little smaller), brand (the name
// large, white on a black band), receipt (smaller, everything one under another), two-column (the name left, the
// shop's lines right), accent (a black band, the heading white on black too) and cards (each side of the customer in a
// box). Black-and-white safe: a band is solid black with white letters, never a colour or a grey.
//
// Pure: data in (already in words), PDF or JPG bytes out. Nothing here reads the database or the settings.
import sharp from 'sharp';
import { code128Svg } from './code128';
import { Sheet, type TextBlock, type TextEngine, type TextStyle } from './layout';
import { writePdf, type PdfPage } from './pdf';

/** PR 409 — the invoice designs, in the order the owner sees them. */
export const INVOICE_DESIGNS = ['classic', 'minimal', 'brand', 'receipt', 'twoColumn', 'accent', 'cards'] as const;
export type InvoiceDesign = (typeof INVOICE_DESIGNS)[number];

interface DesignStyle {
  /** The letterhead: centred, left, name left with the shop's lines right, or white on a black band. */
  header: 'centre' | 'left' | 'split' | 'band';
  /** The name's size against the classic one, and every other text's. */
  brandScale: number;
  scale: number;
  /** The rules' weight against the classic one (1: heavy under the letterhead). */
  heavy: boolean;
  /** The customer's side: side by side, one under another, or each in a box. */
  parties: 'side' | 'stack' | 'boxed';
  /** The heading white on a black box. */
  inverseHeading: boolean;
}

const DESIGNS: Record<InvoiceDesign, DesignStyle> = {
  classic: { header: 'centre', brandScale: 1, scale: 1, heavy: true, parties: 'side', inverseHeading: false },
  minimal: { header: 'left', brandScale: 0.9, scale: 0.95, heavy: false, parties: 'side', inverseHeading: false },
  brand: { header: 'band', brandScale: 1.35, scale: 1, heavy: true, parties: 'side', inverseHeading: false },
  receipt: { header: 'centre', brandScale: 0.9, scale: 0.9, heavy: false, parties: 'stack', inverseHeading: false },
  twoColumn: { header: 'split', brandScale: 1.1, scale: 1, heavy: true, parties: 'side', inverseHeading: false },
  accent: { header: 'band', brandScale: 1.1, scale: 1, heavy: true, parties: 'side', inverseHeading: true },
  cards: { header: 'centre', brandScale: 1, scale: 1, heavy: false, parties: 'boxed', inverseHeading: false },
};

export interface InvoiceDocRow {
  no: string;
  name: string;
  subs: readonly string[];
  marks: readonly string[];
  qty: string;
  unit: string;
  amount: string;
}

export interface InvoiceDocument {
  /** The shop's name (printed when there is no logo, or the logo cannot be read). */
  brand: string;
  /** The shop's logo (PNG/JPG/WebP bytes), or none. */
  logo?: Buffer | null;
  /** The shop's own lines under the name (slogan, contacts, address); empty ones are left out. */
  shopLines: readonly string[];
  heading: string;
  /** The invoice number, the order number, the date (and "Revised …" on a later version). */
  meta: readonly string[];
  /** A short mark in a black box beside the heading (e.g. "REVISED 2"), or none. */
  stamp?: string | null;
  /** The courier's consignment id as a barcode, with its caption (e.g. "Courier · 12345678"), or none. */
  barcode?: { value: string; caption: string } | null;
  parties: readonly { label: string; strong?: string; lines: readonly string[] }[];
  cols: { no: string; item: string; qty: string; unit: string; amount: string };
  rows: readonly InvoiceDocRow[];
  totals: readonly { label: string; value: string; kind?: 'disc' | 'total' }[];
  payment: { title: string; lines: readonly string[] } | null;
  /** The owner's own note (a box above the footer). */
  note: readonly string[];
  footer: readonly string[];
  /** false: a gift with its prices hidden (no unit and amount columns). */
  prices?: boolean;
  /** "{n}/{of}" at the foot of each page. */
  pageWords: string;
  /** PR 409: the design (classic when none). */
  design?: InvoiceDesign | null;
}

/** A sheet of paper (pages of a fixed size), a thermal roll (one page as long as the invoice), or a tall picture. */
export type InvoicePaper = { kind: 'page'; widthMm: number; heightMm: number } | { kind: 'roll'; widthMm: number } | { kind: 'tall'; widthMm: number };

/** Thermal roll widths in millimetres (international roll sizes; not owner values). */
export const ROLL_MM = { roll80: 80, roll58: 58 } as const;

const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

interface Part {
  h: number;
  /** A line of the table: on a new page the header row goes first. */
  row?: boolean;
  draw(sheet: Sheet, y: number): void;
}

const sum = (parts: readonly Part[]) => parts.reduce((s, p) => s + p.h, 0);

/** The pages of one invoice. */
export async function invoicePages(doc: InvoiceDocument, paper: InvoicePaper, dpi: number, engine: TextEngine): Promise<PdfPage[]> {
  const roll = paper.kind === 'roll';
  const narrow = roll || paper.widthMm < 120;
  // a roll or a picture is as long as the invoice: measured on a sheet as tall as anything could need
  const measure = new Sheet(paper.widthMm, paper.kind === 'page' ? paper.heightMm : 2000, dpi, engine);
  const m = measure.px(roll ? 3 : narrow ? 8 : 12);
  const w = measure.width - 2 * m;
  const gap = measure.px(roll ? 1 : 1.5);
  const line = Math.max(1, Math.round(dpi / 100));
  const pad = Math.max(2, Math.round(measure.px(roll ? 0.6 : 1)));
  const ds = DESIGNS[doc.design ?? 'classic'] ?? DESIGNS.classic;
  const scale = (roll && paper.widthMm < 70 ? 0.85 : 1) * ds.scale;
  const SIZE = { brand: 15, head: 13, body: 9, small: 7.5 } as const;
  const st = (size: keyof typeof SIZE, o: Omit<TextStyle, 'sizePt'> = {}): TextStyle => ({ sizePt: Math.round(SIZE[size] * scale * 10) / 10, ...o });
  const shape = (text: string | null | undefined, style: TextStyle, width = w): Promise<TextBlock> => measure.shape(text ?? '', style, Math.max(1, width));
  const textPart = (b: TextBlock, x = m, width = w, align: TextStyle['align'] = 'left'): Part => ({ h: b.height, draw: (s, y) => s.place(b, x, y, width, align) });
  const space = (h: number): Part => ({ h, draw: () => undefined });
  const rule = (weight = line): Part => ({ h: gap * 2, draw: (s, y) => s.line(m, y + gap, m + w, y + gap, ds.heavy ? weight : line) });

  // ---- the letterhead (every page): the logo or the shop's name, then its own lines (PR 409: in the design's way) ----
  const head: Part[] = [];
  const logo = doc.logo ? await measure.shapePicture(doc.logo, Math.min(w, measure.px(roll ? 50 : 60)), measure.px(roll ? 16 : 20)) : null;
  const hasLogo = !!(logo && logo.height);
  // a band carries the name only (a logo keeps its own colours on white: centred, as classic)
  const look = narrow && ds.header === 'split' ? 'left' : ds.header === 'band' && hasLogo ? 'centre' : ds.header;
  const brandStyle = (align: TextStyle['align'], inverse = false): TextStyle => ({ ...st('brand', { bold: true, align, inverse }), sizePt: Math.round(SIZE.brand * scale * ds.brandScale * 10) / 10 });
  const lines = doc.shopLines.filter((x) => x.trim());
  if (look === 'band') {
    // the name white on a full-width black band, the shop's lines under it
    const name = await shape(doc.brand, brandStyle('centre', true), w - 4 * pad);
    const bandH = name.height + 4 * pad;
    head.push({
      h: bandH + gap,
      draw: (s, y) => {
        s.rect(m, y, w, bandH, { fill: true });
        s.place(name, m + 2 * pad, y + 2 * pad, w - 4 * pad, 'centre');
      },
    });
    for (const l of lines) head.push(textPart(await shape(l, st('small', { align: 'centre' })), m, w, 'centre'));
  } else if (look === 'split') {
    // the name (or logo) on the left half, the shop's lines on the right half, right-aligned
    const half = Math.floor((w - measure.px(4)) / 2);
    const left = hasLogo ? logo! : await shape(doc.brand, brandStyle('left'), half);
    const right = await Promise.all(lines.map((l) => shape(l, st('small', { align: 'right' }), half)));
    const rightH = right.reduce((n, b) => n + b.height, 0);
    head.push({
      h: Math.max(left.height, rightH),
      draw: (s, y) => {
        s.place(left, m, y, half);
        let at = y;
        for (const b of right) at += s.place(b, m + w - half, at, half, 'right');
      },
    });
  } else {
    const align: TextStyle['align'] = look === 'left' ? 'left' : 'centre';
    if (hasLogo) head.push(textPart(logo, m, w, align));
    else head.push(textPart(await shape(doc.brand, brandStyle(align)), m, w, align));
    for (const l of lines) head.push(textPart(await shape(l, st('small', { align })), m, w, align));
  }
  head.push(rule(line * 2));

  // ---- the heading, the stamp, number · order · date ----
  const body: Part[] = [];
  const stamp = doc.stamp ? await shape(doc.stamp, st('small', { bold: true, inverse: true }), measure.px(40)) : null;
  const headW = stamp ? w - stamp.width - 4 * pad : w;
  const heading = await shape(doc.heading, st('head', { bold: true, inverse: ds.inverseHeading }), headW - (ds.inverseHeading ? 4 * pad : 0));
  const headingBox = ds.inverseHeading ? 2 * pad : 0;
  body.push({
    h: Math.max(heading.height + 2 * headingBox, stamp ? stamp.height + 2 * pad : 0),
    draw: (s, y) => {
      if (ds.inverseHeading) s.rect(m, y, heading.width + 2 * headingBox, heading.height + 2 * headingBox, { fill: true });
      s.place(heading, m + headingBox, y + headingBox, headW - 2 * headingBox);
      if (stamp) {
        const x = m + w - stamp.width - 2 * pad;
        s.rect(x - pad, y, stamp.width + 2 * pad, stamp.height + 2 * pad, { fill: true });
        s.place(stamp, x, y + pad, stamp.width);
      }
    },
  });
  // the meta lines on the left; on paper the courier's barcode (its own consignment id) beside them, on a roll under them
  const bw = narrow ? w : Math.min(Math.floor(w * 0.42), measure.px(70));
  const metaW = doc.barcode?.value && !narrow ? w - bw - measure.px(4) : w;
  const metas = await Promise.all(doc.meta.filter((x) => x.trim()).map((x) => shape(x, st('body'), metaW)));
  const metaH = metas.reduce((s2, b) => s2 + b.height + Math.round(pad / 2), 0);
  let code: { h: number; draw: (s: Sheet, x: number, y: number) => void } | null = null;
  if (doc.barcode?.value) {
    const bh = measure.px(roll ? 10 : 12);
    const caption = await shape(doc.barcode.caption, st('small', { align: 'centre' }), bw);
    const value = doc.barcode.value;
    const fits = code128Svg(value, 0, 0, bw, bh) !== null;
    code = {
      h: (fits ? bh + pad : 0) + caption.height,
      draw: (s, x, y) => {
        if (fits) s.barcode(value, x, y, bw, bh);
        s.place(caption, x, y + (fits ? bh + pad : 0), bw, 'centre');
      },
    };
  }
  const side = code && !narrow ? code : null;
  body.push({
    h: Math.max(metaH, side?.h ?? 0),
    draw: (s, y) => {
      let at = y;
      for (const b of metas) at += s.place(b, m, at, metaW) + Math.round(pad / 2);
      side?.draw(s, m + w - bw, y + pad);
    },
  });
  if (code && !side) {
    const c = code;
    body.push(space(gap));
    body.push({ h: c.h, draw: (s, y) => c.draw(s, m, y) });
  }
  body.push(space(gap * 2));

  // ---- the customer's side: side by side on paper, one under another on a roll or a narrow sheet ----
  const parties = await Promise.all(
    doc.parties.map(async (p) => {
      const boxPad = ds.parties === 'boxed' ? 2 * pad : 0;
      const cw = (narrow || ds.parties === 'stack' ? w : Math.floor((w - (Math.min(doc.parties.length, 3) - 1) * measure.px(4)) / Math.min(doc.parties.length, 3))) - 2 * boxPad;
      const blocks = [await shape(p.label, st('small', { bold: true }), cw), ...(p.strong ? [await shape(p.strong, st('body', { bold: true }), cw)] : []), ...(await Promise.all(p.lines.map((l) => shape(l, st('body'), cw))))];
      return { cw, boxPad, blocks, h: sum(blocks.map((b) => ({ h: b.height, draw: () => undefined }))) + 2 * boxPad };
    }),
  );
  if (narrow || ds.parties === 'stack') {
    for (const p of parties) {
      for (const b of p.blocks) body.push(textPart(b));
      body.push(space(gap));
    }
  } else {
    for (let i = 0; i < parties.length; i += 3) {
      const group = parties.slice(i, i + 3);
      const h = Math.max(...group.map((g) => g.h));
      body.push({
        h: h + gap,
        draw: (s, y) =>
          group.forEach((g, k) => {
            const x = m + k * (g.cw + 2 * g.boxPad + measure.px(4));
            // cards: each side in a thin box
            if (g.boxPad) s.rect(x, y, g.cw + 2 * g.boxPad, h, { stroke: line });
            let at = y + g.boxPad;
            for (const b of g.blocks) at += s.place(b, x + g.boxPad, at, g.cw);
          }),
      });
    }
  }
  body.push(space(gap));

  // ---- the lines ----
  const prices = doc.prices !== false;
  let header: Part | null = null;
  const rows: Part[] = [];
  if (roll) {
    // a roll: the name with its small lines, then "qty × unit" and the amount on one line
    body.push(rule(line * 2));
    for (const r of doc.rows) {
      const name = await shape(`${r.no}. ${r.name}`, st('body', { bold: true }));
      const subs = await Promise.all([...r.subs, ...r.marks].map((x) => shape(x, st('small'))));
      const left = await shape(prices ? `${r.qty} × ${r.unit}` : `${doc.cols.qty}: ${r.qty}`, st('body'), Math.floor(w * 0.6));
      const amount = prices ? await shape(r.amount, st('body', { bold: true, align: 'right' }), Math.floor(w * 0.4)) : null;
      const h = name.height + subs.reduce((s, b) => s + b.height, 0) + Math.max(left.height, amount?.height ?? 0) + 2 * pad;
      rows.push({
        h: h + line,
        row: true,
        draw: (s, y) => {
          let at = y + pad;
          at += s.place(name, m, at, w);
          for (const b of subs) at += s.place(b, m, at, w);
          s.place(left, m, at, Math.floor(w * 0.6));
          if (amount) s.place(amount, m + Math.floor(w * 0.6), at, Math.floor(w * 0.4), 'right');
          s.line(m, y + h, m + w, y + h, line, true);
        },
      });
    }
  } else {
    const cols = prices
      ? [
          { title: doc.cols.no, share: 0.6, align: 'left' as const },
          { title: doc.cols.item, share: 5, align: 'left' as const },
          { title: doc.cols.qty, share: 0.9, align: 'right' as const },
          { title: doc.cols.unit, share: 1.7, align: 'right' as const },
          { title: doc.cols.amount, share: 1.9, align: 'right' as const },
        ]
      : [
          { title: doc.cols.no, share: 0.6, align: 'left' as const },
          { title: doc.cols.item, share: 6, align: 'left' as const },
          { title: doc.cols.qty, share: 1, align: 'right' as const },
        ];
    const total = cols.reduce((s, c) => s + c.share, 0);
    const xs: { x: number; w: number }[] = [];
    let at = m;
    for (const c of cols) {
      const cw = Math.floor((w * c.share) / total);
      xs.push({ x: at, w: cw });
      at += cw;
    }
    const cellPad = pad * 2;
    const heads = await Promise.all(cols.map((c, i) => shape(c.title, st('small', { bold: true, align: c.align }), xs[i]!.w - 2 * cellPad)));
    const hh = Math.max(...heads.map((b) => b.height), 1) + 2 * pad;
    header = {
      h: hh + line,
      draw: (s, y) => {
        s.line(m, y, m + w, y, line * 2);
        heads.forEach((b, i) => s.place(b, xs[i]!.x + cellPad, y + pad, xs[i]!.w - 2 * cellPad, cols[i]!.align));
        s.line(m, y + hh, m + w, y + hh, line * 2);
      },
    };
    for (const r of doc.rows) {
      const itemW = xs[1]!.w - 2 * cellPad;
      const name = await shape(r.name, st('body', { bold: true }), itemW);
      const subs = await Promise.all(r.subs.map((x) => shape(x, st('small'), itemW)));
      const marks = await Promise.all(r.marks.map((x) => shape(x, st('small', { bold: true, inverse: true }), itemW - 2 * pad)));
      const cells = prices ? [r.no, '', r.qty, r.unit, r.amount] : [r.no, '', r.qty];
      const blocks = await Promise.all(cells.map((c, i) => (i === 1 ? Promise.resolve(null) : shape(c, st('body', { align: cols[i]!.align }), xs[i]!.w - 2 * cellPad))));
      const markH = marks.reduce((s, b) => s + b.height + pad, 0);
      const itemH = name.height + subs.reduce((s, b) => s + b.height, 0) + markH;
      const h = Math.max(itemH, ...blocks.map((b) => b?.height ?? 0)) + 2 * pad;
      rows.push({
        h: h + line,
        row: true,
        draw: (s, y) => {
          blocks.forEach((b, i) => b && s.place(b, xs[i]!.x + cellPad, y + pad, xs[i]!.w - 2 * cellPad, cols[i]!.align));
          let iy = y + pad;
          const ix = xs[1]!.x + cellPad;
          iy += s.place(name, ix, iy, itemW);
          for (const b of subs) iy += s.place(b, ix, iy, itemW);
          for (const b of marks) {
            s.rect(ix, iy, b.width + 2 * pad, b.height + pad, { fill: true });
            s.place(b, ix + pad, iy + Math.round(pad / 2), b.width);
            iy += b.height + pad;
          }
          s.line(m, y + h, m + w, y + h, line, true);
        },
      });
    }
  }

  // ---- the totals, how it is paid, the owner's note, the footer ----
  const tail: Part[] = [];
  if (doc.totals.length) {
    tail.push(space(gap));
    const tw = roll || narrow ? w : Math.floor(w * 0.5);
    const tx = m + w - tw;
    for (const t of doc.totals) {
      const bold = t.kind === 'total';
      const label = await shape(t.label, st(bold ? 'head' : 'body', { bold }), Math.floor(tw * 0.6));
      const value = await shape(t.value, st(bold ? 'head' : 'body', { bold, align: 'right' }), Math.floor(tw * 0.4));
      const h = Math.max(label.height, value.height) + pad;
      tail.push({
        h: h + (bold ? gap : 0),
        draw: (s, y) => {
          const top = y + (bold ? gap : 0);
          if (bold) s.line(tx, y + Math.round(gap / 2), tx + tw, y + Math.round(gap / 2), line * 2);
          s.place(label, tx, top, Math.floor(tw * 0.6));
          s.place(value, tx + Math.floor(tw * 0.6), top, Math.floor(tw * 0.4), 'right');
        },
      });
    }
  }
  const box = async (title: string | null, lines: readonly string[]): Promise<Part | null> => {
    const inner = w - 4 * pad;
    const blocks = [...(title ? [await shape(title, st('body', { bold: true }), inner)] : []), ...(await Promise.all(lines.filter((l) => l.trim()).map((l) => shape(l, st('body'), inner))))];
    if (!blocks.length) return null;
    const h = blocks.reduce((s, b) => s + b.height, 0) + 4 * pad;
    return {
      h: h + gap * 2,
      draw: (s, y) => {
        const top = y + gap;
        s.rect(m, top, w, h, { stroke: line * 2 });
        let at = top + 2 * pad;
        for (const b of blocks) at += s.place(b, m + 2 * pad, at, inner);
      },
    };
  };
  if (doc.payment) {
    const p = await box(doc.payment.title, doc.payment.lines);
    if (p) tail.push(p);
  }
  const note = await box(null, doc.note);
  if (note) tail.push(note);
  if (doc.footer.length) {
    tail.push(space(gap));
    for (const f of doc.footer.filter((x) => x.trim())) tail.push(textPart(await shape(f, st('small', { align: 'centre' })), m, w, 'centre'));
  }

  // ---- one tall page (a roll, a picture), or pages that never split a row ----
  const all = [...body, ...(header ? [header] : []), ...rows, ...tail];
  if (paper.kind !== 'page') {
    const height = 2 * m + sum(head) + sum(all);
    const sheet = new Sheet(paper.widthMm, (height * 25.4) / dpi + 0.5, dpi, engine);
    let y = m;
    for (const part of [...head, ...all]) {
      part.draw(sheet, y);
      y += part.h;
    }
    return [await sheet.render()];
  }
  const pageWords = (n: number, of: number) => shape(fill(doc.pageWords, { n, of }), st('small', { align: 'right' }));
  const footH = (await pageWords(1, 1)).height + gap;
  const room = measure.height - 2 * m - footH;
  const groups: Part[][] = [];
  let cur: Part[] = [];
  let used = sum(head);
  for (const part of all) {
    if (used + part.h > room && cur.length) {
      groups.push(cur);
      cur = [];
      used = sum(head);
      if (part.row && header) {
        cur.push(header);
        used += header.h;
      }
    }
    cur.push(part);
    used += part.h;
  }
  groups.push(cur);
  const pages: PdfPage[] = [];
  for (let p = 0; p < groups.length; p++) {
    const sheet = new Sheet(paper.widthMm, paper.heightMm, dpi, engine);
    let y = m;
    for (const part of [...head, ...groups[p]!]) {
      part.draw(sheet, y);
      y += part.h;
    }
    sheet.place(await pageWords(p + 1, groups.length), m, m + room + gap, w, 'right');
    pages.push(await sheet.render());
  }
  return pages;
}

/** Several invoices in one PDF (a bulk print): each starts on its own page (or its own length of roll). */
export async function invoicePdf(docs: readonly InvoiceDocument[], paper: InvoicePaper, dpi: number, engine: TextEngine, meta: { title?: string; created?: Date } = {}): Promise<Buffer> {
  const pages: PdfPage[] = [];
  for (const d of docs) pages.push(...(await invoicePages(d, paper, dpi, engine)));
  return writePdf(pages, meta);
}

/**
 * One invoice as one tall picture (JPG) for a chat: the paper layout `widthMm` wide, drawn `widthPx` pixels across, as
 * long as the invoice.
 */
export async function invoiceJpeg(doc: InvoiceDocument, opts: { widthMm: number; widthPx: number; quality: number }, engine: TextEngine): Promise<Buffer> {
  const dpi = Math.max(72, Math.round((opts.widthPx * 25.4) / opts.widthMm));
  const [page] = await invoicePages(doc, { kind: 'tall', widthMm: opts.widthMm }, dpi, engine);
  const img = page!.image;
  return sharp(img.gray, { raw: { width: img.width, height: img.height, channels: 1 } })
    .jpeg({ quality: opts.quality })
    .toBuffer();
}
