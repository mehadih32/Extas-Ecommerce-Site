// S28 · PR 690 (admin prototype v5, Reports › Report packs) — four ready packs of the library's own numbers, each as a PDF on
// the shop's letterhead (name, address, phone from the settings; A4, page "n/of", nothing cut), as a real spreadsheet (.xlsx, one
// sheet per part) and as a CSV: Monthly business, Bank (for a loan or bank file: profit, fixed costs, balances of every
// account), Stock (restock now and sitting unsold) and Sales (the period's figures and orders by weekday).
// S28 · PR 689 follow-up: the words come from messages/admin-reports-files.<lang>.json, so the PDF is in English or Bengali (the
// admin's language); the file model is report-files.ts.
// Read-only: a pack reads the same figures as the library and Finance and changes nothing.
import type { TextEngine } from '@extas/documents';
import { fileCsv, filePdf, fileXlsx, wordsFor, type FileTable, type Letterhead, type ReportFile, type Value, type Words } from './report-files';

export type { Letterhead };

export const PACKS = ['monthly', 'bank', 'stock', 'sales'] as const;
export type PackId = (typeof PACKS)[number];
/** The period each pack covers: the whole month before for the two that go to a bank or the owner, the last 30 days for the rest. */
export const PACK_PRESET: Record<PackId, 'lastmonth' | 'last30'> = { monthly: 'lastmonth', bank: 'lastmonth', stock: 'last30', sales: 'last30' };

export interface PackData {
  range: { from: string; to: string };
  currency: string;
  cards: { id: string; kind: 'money' | 'count'; now: number | null }[];
  restock: { restock: PackStyle[]; unsold: PackStyle[] };
  weekday: number[];
  discountMinor: number;
  /** Bank pack: the accounts' balances (null = the person cannot see the books). */
  accounts: { name: string; balanceMinor: number }[] | null;
  fixedMinor: number | null;
}
export interface PackStyle {
  name: string;
  sizesInStock: number;
  sizesTotal: number;
  stockDays: number | null;
  sold30: number;
}

export const packTitle = (p: PackId, w: Words = wordsFor('en')) => w(`titles.${p}`);

/** The tables of a pack: one part each. Money is in minor units (null = not known). */
export function packTables(pack: PackId, d: PackData, w: Words = wordsFor('en')): FileTable[] {
  const figureCols = [{ title: w('figure') }, { title: w('value'), right: true }];
  const card = (c: PackData['cards'][number]): Value[] => [w(`cards.${c.id}`), c.kind === 'money' ? { money: c.now } : c.now === null ? w('notKnown') : c.now];
  const cards = (ids: string[]) => d.cards.filter((c) => ids.includes(c.id)).map(card);
  const figures = (name: string, rows: Value[][]): FileTable => ({ name, columns: figureCols, rows });
  if (pack === 'monthly') return [figures(w('partFigures'), [...cards(['sales', 'profit', 'orders', 'aov', 'discount', 'restock']), [w('fixedCosts'), { money: d.fixedMinor }]])];
  if (pack === 'bank') {
    const out = [figures(w('partFigures'), [...cards(['sales', 'profit']), [w('fixedCosts'), { money: d.fixedMinor }]])];
    if (d.accounts) out.push(figures(w('partBalances'), [...d.accounts.map((a): Value[] => [w('balance', { name: a.name }), { money: a.balanceMinor }]), [w('allAccounts'), { money: d.accounts.reduce((n, a) => n + a.balanceMinor, 0) }]]));
    return out;
  }
  if (pack === 'sales')
    return [figures(w('partFigures'), cards(['sales', 'profit', 'orders', 'aov', 'discount'])), figures(w('partWeekday'), d.weekday.map((n, i): Value[] => [w('ordersOn', { day: w(`days.${i}`) }), n]))];
  const cols = [{ title: w('style') }, { title: w('sizes'), right: true }, { title: w('stockDays'), right: true }, { title: w('sold30'), right: true }];
  const style = (s: PackStyle): Value[] => [s.name, w('sizesOf', { n: s.sizesInStock, total: s.sizesTotal }), s.stockDays, s.sold30];
  return [
    { name: w('partRestock'), columns: cols, rows: d.restock.restock.map(style) },
    { name: w('partUnsold'), columns: cols, rows: d.restock.unsold.map(style) },
  ];
}

/** A pack as a file model. */
export function packFile(pack: PackId, d: PackData, w: Words = wordsFor('en')): ReportFile {
  return { title: packTitle(pack, w), range: d.range, currency: d.currency, tables: packTables(pack, d, w) };
}

export const packPdf = (pack: PackId, d: PackData, head: Letterhead, dpi: number, printedOn: string, engine?: TextEngine, w: Words = wordsFor('en')): Promise<Buffer> => filePdf(packFile(pack, d, w), head, w, dpi, printedOn, engine);

/** The pack as a spreadsheet file (CSV with a byte-order mark so Excel reads it as UTF-8). A cell that starts like a formula is quoted as text. */
export const packCsv = (pack: PackId, d: PackData, head: Letterhead, w: Words = wordsFor('en')): string => fileCsv(packFile(pack, d, w), head, w);

/** The pack as a real Excel workbook, one sheet per part. */
export const packXlsx = (pack: PackId, d: PackData, w: Words = wordsFor('en')): Buffer => fileXlsx(packFile(pack, d, w), w);
