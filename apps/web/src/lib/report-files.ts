// S28 · PR 689 (admin prototype v5, Reports › Downloads & report packs) — one model for every file the Reports section hands
// out. A file is a title, a period and tables (one part each). The same tables become:
//   - a spreadsheet (.xlsx, one sheet per part; money as numbers in the currency's main unit),
//   - a PDF on the shop's letterhead (A4, the part's name and its column titles before each part, page "n/of", nothing cut),
//   - a CSV (opens in Excel; a cell that starts like a formula is quoted as text).
// The words come from messages/admin-reports-files.<lang>.json, so the PDF is in the admin's language (English or Bengali).
// Read-only: a file reads the same figures as the library and Finance and changes nothing.
import { listPdf, PAPER_MM, sharpText, type ListColumn, type ListDocument, type ListRow, type TextEngine } from '@extas/documents';
import { t, type Dict } from '@/lib/i18n';
import { formatMoney } from '@/lib/shop/lang';
import bn from '../../messages/admin-reports-files.bn.json';
import en from '../../messages/admin-reports-files.en.json';
import { xlsx, type Cell as SheetCell, type Sheet } from './xlsx';

export type Words = (key: string, vars?: Record<string, string | number>) => string;
export type FileLang = 'en' | 'bn';

/** The words of the files in one language (English when the language is not known). */
export function wordsFor(lang: string): Words {
  const dict = ((lang === 'bn' ? bn : en) as unknown as { reportsFiles: Dict }).reportsFiles;
  return (key, vars) => t(dict, key, vars);
}

/** A money amount in minor units (null = not known), a count, or text. */
export type Value = string | number | { money: number | null } | null;

export interface FileTable {
  /** The part's name (the sheet's name, the heading in the PDF). */
  name: string;
  columns: { title: string; right?: boolean }[];
  rows: Value[][];
}

export interface ReportFile {
  title: string;
  range: { from: string; to: string };
  currency: string;
  tables: FileTable[];
}

export interface Letterhead {
  name: string | null;
  address: string | null;
  phone: string | null;
}

const money = (n: number | null, cur: string, w: Words) => (n === null ? w('notKnown') : formatMoney(n, cur, 'en', false, 'en', ''));

/** A value as the words on paper or in a CSV. */
export function show(v: Value, cur: string, w: Words): string {
  if (v === null) return w('none');
  if (typeof v === 'object') return money(v.money, cur, w);
  return String(v);
}

/** A value as a spreadsheet cell: money as a number in the main unit, so Excel can add it up. */
export function cellOf(v: Value, w: Words): SheetCell {
  if (v === null) return null;
  if (typeof v === 'object') return v.money === null ? w('notKnown') : v.money / 100; // hardcode-ok: minor units to the main unit
  return v;
}

/** Each table as a sheet: the title, the period, a blank line, the column titles, the rows. */
export function fileSheets(f: ReportFile, w: Words): Sheet[] {
  return f.tables.map((tb) => ({
    name: tb.name,
    rows: [[f.title], [w('period', f.range)], [], tb.columns.map((c) => c.title), ...tb.rows.map((r) => r.map((v) => cellOf(v, w)))],
  }));
}

export const fileXlsx = (f: ReportFile, w: Words): Buffer => xlsx(fileSheets(f, w));

const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@\t]/.test(s) ? `'${s}` : s);

/** The file as CSV (byte-order mark so Excel reads it as UTF-8): the parts one after the other, each with its name and column titles. */
export function fileCsv(f: ReportFile, head: Letterhead, w: Words): string {
  const lines: string[][] = [[head.name ?? ''], [f.title], [w('period', f.range)]];
  for (const tb of f.tables) lines.push([], [tb.name], tb.columns.map((c) => c.title), ...tb.rows.map((r) => r.map((v) => show(v, f.currency, w))));
  return `﻿${lines.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** The file as a paper document on the letterhead: every part is a bold heading row and its column titles, then its rows. */
export function fileDocument(f: ReportFile, head: Letterhead, w: Words, dpi: number, printedOn: string): ListDocument {
  const [widthMm, heightMm] = PAPER_MM.a4;
  const width = Math.max(1, ...f.tables.map((tb) => tb.columns.length));
  const columns: ListColumn[] = Array.from({ length: width }, (_, i) => ({ title: '', width: i === 0 ? 4 : 2, align: i === 0 ? ('left' as const) : ('right' as const) }));
  const rows: ListRow[] = [];
  f.tables.forEach((tb, i) => {
    const pad = (cells: string[]) => [...cells, ...Array.from({ length: width - cells.length }, () => '')];
    rows.push({ cells: pad([tb.name]), bold: true, ruleAbove: i > 0 });
    rows.push({ cells: pad(tb.columns.map((c) => c.title)), bold: true });
    for (const r of tb.rows) rows.push({ cells: pad(r.map((v) => show(v, f.currency, w))) });
  });
  return {
    widthMm,
    heightMm,
    dpi,
    letterhead: [head.name, head.address, head.phone],
    title: f.title,
    summary: [w('period', f.range), w('printed', { on: printedOn })],
    columns,
    rows,
    foot: `${f.title} · ${w('period', f.range)}`,
    pageWords: w('pageWords'),
    empty: w('empty'),
  };
}

export async function filePdf(f: ReportFile, head: Letterhead, w: Words, dpi: number, printedOn: string, engine: TextEngine = sharpText()): Promise<Buffer> {
  const doc = fileDocument(f, head, w, dpi, printedOn);
  return listPdf(doc, engine, { title: doc.title });
}
