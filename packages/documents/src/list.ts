// PR 180, 181 (Blueprint B1.6, B1.7) — a paper list document: the handover sheet for the rider and the daily picking list.
// The shop's letterhead (name, address, phone) at the top of every page and its foot line at the bottom, the title and
// the summary lines on the first page, a table whose header row repeats on every page, rows that may be bold group rows
// or indented detail rows, a tick box at the end of a row for the person who checks it off, a mark on a row (e.g. a
// shortage) printed in a black box so it reads in black and white, the page number "n/of", and signature lines at the end.
// Rows are measured before they are placed: a row never splits across a page, nothing is cut or overlaps.
import { Sheet, type TextBlock, type TextEngine, type TextStyle } from './layout';
import { writePdf, type PdfPage } from './pdf';

export interface ListColumn {
  title: string;
  /** Its share of the table's width (the shares are added up). */
  width: number;
  align?: 'left' | 'right' | 'centre';
}

export interface ListRow {
  cells: readonly string[];
  bold?: boolean;
  /** Indent of the first cell (0, 1, 2 …), for detail rows under a group row. */
  indent?: number;
  /** A tick box at the end of the row. */
  tick?: boolean;
  /** A short mark in a black box after the first cell (e.g. "SHORT 2"). */
  mark?: string | null;
  /** A heavier line above the row (a new group). */
  ruleAbove?: boolean;
}

export interface ListDocument {
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** The letterhead: the shop's name first (bold), then its address and phone lines; empty lines are left out. */
  letterhead: readonly (string | null)[];
  title: string;
  /** The summary lines under the title, on the first page. */
  summary: readonly string[];
  columns: readonly ListColumn[];
  rows: readonly ListRow[];
  /** Under the table on the last page (e.g. totals). */
  after?: readonly string[];
  /** Signature lines on the last page, one label each ("Handed over by", "Received by"). */
  signatures?: readonly string[];
  /** The foot line of every page (e.g. the date and the batch). */
  foot?: string | null;
  /** "{n}/{of}". */
  pageWords: string;
  /** Shown when there are no rows. */
  empty?: string;
}

const SIZE = { head: 13, small: 8, body: 9, title: 12 } as const;
const MARGIN_MM = 12;
const GAP_MM = 1.5;
const TICK_MM = 7;

const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

interface Part {
  h: number;
  draw(sheet: Sheet, y: number): void;
}

/** The pages of a list document. */
export async function listPages(doc: ListDocument, engine: TextEngine): Promise<PdfPage[]> {
  const measure = new Sheet(doc.widthMm, doc.heightMm, doc.dpi, engine);
  const m = measure.px(MARGIN_MM);
  const w = measure.width - 2 * m;
  const gap = measure.px(GAP_MM);
  const line = Math.max(1, Math.round(doc.dpi / 100));
  const pad = Math.max(2, Math.round(measure.px(1)));
  const st = (size: keyof typeof SIZE, o: Omit<TextStyle, 'sizePt'> = {}): TextStyle => ({ sizePt: SIZE[size], ...o });
  const shape = (text: string | null | undefined, style: TextStyle, width = w): Promise<TextBlock> => measure.shape(text ?? '', style, width);
  const textPart = (b: TextBlock, x = m, width = w, align: TextStyle['align'] = 'left'): Part => ({ h: b.height, draw: (s, y) => s.place(b, x, y, width, align) });

  // the letterhead (every page) and the foot (every page)
  const head: Part[] = [];
  const lines = doc.letterhead.filter((l): l is string => !!l && !!l.trim());
  for (const [i, l] of lines.entries()) head.push(textPart(await shape(l, i === 0 ? st('head', { bold: true, align: 'centre' }) : st('small', { align: 'centre' })), m, w, 'centre'));
  head.push({ h: gap * 2, draw: (s, y) => s.line(m, y + gap, m + w, y + gap, line * 2) });

  // the table's columns (the tick box gets its own narrow column)
  const ticks = doc.rows.some((r) => r.tick);
  const tickW = ticks ? measure.px(TICK_MM) : 0;
  const total = doc.columns.reduce((s, c) => s + c.width, 0) || 1;
  const xs: { x: number; w: number }[] = [];
  let at = m;
  for (const c of doc.columns) {
    const cw = Math.floor(((w - tickW) * c.width) / total);
    xs.push({ x: at, w: cw });
    at += cw;
  }
  const cellPad = pad * 2;
  const headerRow = await (async (): Promise<Part> => {
    const blocks = await Promise.all(doc.columns.map((c, i) => shape(c.title, st('small', { bold: true, align: c.align ?? 'left' }), xs[i]!.w - 2 * cellPad)));
    const h = Math.max(...blocks.map((b) => b.height), 1) + 2 * pad;
    return {
      h: h + line,
      draw: (s, y) => {
        blocks.forEach((b, i) => s.place(b, xs[i]!.x + cellPad, y + pad, xs[i]!.w - 2 * cellPad, doc.columns[i]!.align ?? 'left'));
        s.line(m, y + h, m + w, y + h, line * 2);
      },
    };
  })();

  const rows: Part[] = [];
  for (const r of doc.rows) {
    const indent = (r.indent ?? 0) * measure.px(5);
    const mark = r.mark ? await shape(r.mark, st('body', { bold: true, inverse: true }), measure.px(40)) : null;
    const blocks = await Promise.all(
      doc.columns.map((c, i) => {
        const cw = xs[i]!.w - 2 * cellPad - (i === 0 ? indent + (mark ? mark.width + 3 * pad : 0) : 0);
        return shape(r.cells[i] ?? '', st('body', { bold: r.bold, align: c.align ?? 'left' }), Math.max(cw, 1));
      }),
    );
    const box = ticks && r.tick ? Math.round(measure.px(3.5)) : 0;
    const h = Math.max(...blocks.map((b) => b.height), mark ? mark.height + pad : 0, box, 1) + 2 * pad;
    rows.push({
      h: h + line,
      draw: (s, y) => {
        if (r.ruleAbove) s.line(m, y, m + w, y, line * 2);
        blocks.forEach((b, i) => {
          const x = xs[i]!.x + cellPad + (i === 0 ? indent : 0);
          const cw = xs[i]!.w - 2 * cellPad - (i === 0 ? indent + (mark ? mark.width + 3 * pad : 0) : 0);
          s.place(b, x, y + pad, Math.max(cw, 1), doc.columns[i]!.align ?? 'left');
          if (i === 0 && mark) {
            const mx = x + Math.min(b.width, cw) + 2 * pad;
            const half = Math.round(pad / 2);
            s.rect(mx - pad, y + half, mark.width + 2 * pad, mark.height + pad, { fill: true });
            s.place(mark, mx, y + pad, mark.width);
          }
        });
        if (box) s.rect(m + w - tickW + Math.round((tickW - box) / 2), y + Math.round((h - box) / 2), box, box, { stroke: line * 2 });
        s.line(m, y + h, m + w, y + h, line, true);
      },
    });
  }
  if (!rows.length && doc.empty) rows.push(textPart(await shape(doc.empty, st('body', { align: 'centre' })), m, w, 'centre'));

  // the first page's title and summary; the last page's lines after the table and the signatures
  const title: Part[] = [textPart(await shape(doc.title, st('title', { bold: true }))), { h: gap, draw: () => undefined }];
  for (const s of doc.summary) title.push(textPart(await shape(s, st('body'))));
  title.push({ h: gap * 2, draw: () => undefined });
  const tail: Part[] = [];
  if (doc.after?.length) {
    tail.push({ h: gap * 2, draw: () => undefined });
    for (const a of doc.after) tail.push(textPart(await shape(a, st('body', { bold: true }))));
  }
  if (doc.signatures?.length) {
    const n = doc.signatures.length;
    const sw = Math.floor((w - (n - 1) * measure.px(10)) / n);
    const labels = await Promise.all(doc.signatures.map((l) => shape(l, st('small'), sw)));
    const space = measure.px(14);
    tail.push({
      h: space + Math.max(...labels.map((b) => b.height)) + gap,
      draw: (s, y) =>
        labels.forEach((b, i) => {
          const x = m + i * (sw + measure.px(10));
          s.line(x, y + space, x + sw, y + space, line);
          s.place(b, x, y + space + gap, sw);
        }),
    });
  }
  const pageWords = async (n: number, of: number) => shape([doc.foot, fill(doc.pageWords, { n, of })].filter(Boolean).join(' · '), st('small', { align: 'right' }));
  const footH = (await pageWords(1, 1)).height + gap;

  // pages: letterhead, (first page: title), the header row, rows that fit; the tail on the last page
  const room = measure.height - 2 * m - footH;
  const top = (first: boolean) => sum(head) + (first ? sum(title) : 0) + headerRow.h;
  const groups: Part[][] = [];
  let cur: Part[] = [];
  let used = top(true);
  for (const r of rows) {
    if (used + r.h > room && cur.length) {
      groups.push(cur);
      cur = [];
      used = top(false);
    }
    cur.push(r);
    used += r.h;
  }
  groups.push(cur);
  // the tail goes with the last rows, or on a page of its own when it does not fit
  const tailOwn = used + sum(tail) > room;
  if (tailOwn) groups.push([]);

  const pages: PdfPage[] = [];
  for (let p = 0; p < groups.length; p++) {
    const sheet = new Sheet(doc.widthMm, doc.heightMm, doc.dpi, engine);
    let y = m;
    const draw = (part: Part) => {
      part.draw(sheet, y);
      y += part.h;
    };
    head.forEach(draw);
    if (p === 0) title.forEach(draw);
    const own = tailOwn && p === groups.length - 1;
    if (!own) draw(headerRow);
    groups[p]!.forEach(draw);
    if (p === groups.length - 1) tail.forEach(draw);
    const f = await pageWords(p + 1, groups.length);
    sheet.place(f, m, m + room + gap, w, 'right');
    pages.push(await sheet.render());
  }
  return pages;
}

const sum = (parts: readonly Part[]) => parts.reduce((s, p) => s + p.h, 0);

/** A list document as a PDF. */
export async function listPdf(doc: ListDocument, engine: TextEngine, meta: { title?: string; created?: Date } = {}): Promise<Buffer> {
  return writePdf(await listPages(doc, engine), { title: meta.title ?? doc.title, created: meta.created });
}

/** Paper sizes in millimetres (international paper sizes; not owner values). */
export const PAPER_MM = { a4: [210, 297], a5: [148, 210] } as const;
export type Paper = keyof typeof PAPER_MM;
