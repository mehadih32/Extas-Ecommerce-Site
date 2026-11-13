// S28 · PR 690 (admin prototype v5, Reports › Report packs) — four ready packs of the library's own numbers, each as a PDF on
// the shop's letterhead (name, address, phone from the settings; A4, the table header on every page, page "n/of", nothing cut)
// and as a spreadsheet file (CSV, opens in Excel): Monthly business, Bank (for a loan or bank file: profit, fixed costs, balances
// of every account), Stock (restock now and sitting unsold) and Sales (the period's figures and orders by weekday).
// Read-only: a pack reads the same figures as the library and Finance and changes nothing. The PDF is in English.
import { listPdf, PAPER_MM, sharpText, type ListColumn, type ListDocument, type ListRow, type TextEngine } from '@extas/documents';
import { formatMoney } from '@/lib/shop/lang';

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
export interface Letterhead {
  name: string | null;
  address: string | null;
  phone: string | null;
}

const TITLES: Record<PackId, string> = { monthly: 'Monthly business report', bank: 'Bank report', stock: 'Stock report', sales: 'Sales report' };
const CARD_NAMES: Record<string, string> = {
  sales: 'Sales',
  profit: 'Net profit',
  orders: 'Orders',
  aov: 'Average order',
  discount: 'Discounts given',
  restock: 'Styles to restock',
  unsold: 'Styles sitting unsold',
};
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const packTitle = (p: PackId) => TITLES[p];

/** One table of a pack: its columns, its rows (text) and a short title. */
interface Table {
  columns: ListColumn[];
  rows: string[][];
}

export function packTable(pack: PackId, d: PackData): Table {
  const m = (n: number | null) => (n === null ? 'Not known' : formatMoney(n, d.currency, 'en', false, 'en', ''));
  const figure = (c: PackData['cards'][number]) => (c.kind === 'money' ? m(c.now) : c.now === null ? 'Not known' : String(c.now));
  const cards = (ids: string[]) => d.cards.filter((c) => ids.includes(c.id)).map((c) => [CARD_NAMES[c.id] ?? c.id, figure(c)]);
  const figureCols: ListColumn[] = [
    { title: 'Figure', width: 3 },
    { title: 'Value', width: 2, align: 'right' },
  ];
  if (pack === 'monthly') return { columns: figureCols, rows: [...cards(['sales', 'profit', 'orders', 'aov', 'discount', 'restock']), ['Fixed costs', m(d.fixedMinor)]] };
  if (pack === 'bank')
    return {
      columns: figureCols,
      rows: [
        ...cards(['sales', 'profit']),
        ['Fixed costs', m(d.fixedMinor)],
        ...(d.accounts ?? []).map((a) => [`Balance: ${a.name}`, m(a.balanceMinor)]),
        ...(d.accounts ? [['All accounts', m(d.accounts.reduce((n, a) => n + a.balanceMinor, 0))]] : []),
      ],
    };
  if (pack === 'sales') return { columns: figureCols, rows: [...cards(['sales', 'profit', 'orders', 'aov', 'discount']), ...d.weekday.map((n, i) => [`Orders on ${DAYS[i]}`, String(n)])] };
  const style = (tag: string) => (s: PackStyle) => [tag, s.name, `${s.sizesInStock} of ${s.sizesTotal}`, s.stockDays === null ? '-' : String(s.stockDays), String(s.sold30)];
  return {
    columns: [
      { title: 'Verdict', width: 2 },
      { title: 'Style', width: 5 },
      { title: 'Sizes in stock', width: 2, align: 'right' },
      { title: 'Days of stock', width: 2, align: 'right' },
      { title: 'Sold in 30 days', width: 2, align: 'right' },
    ],
    rows: [...d.restock.restock.map(style('Restock now')), ...d.restock.unsold.map(style('Unsold'))],
  };
}

/** The pack as a paper document on the letterhead. */
export function packDocument(pack: PackId, d: PackData, head: Letterhead, dpi: number, printedOn: string): ListDocument {
  const t = packTable(pack, d);
  const [widthMm, heightMm] = PAPER_MM.a4;
  return {
    widthMm,
    heightMm,
    dpi,
    letterhead: [head.name, head.address, head.phone],
    title: TITLES[pack],
    summary: [`Period: ${d.range.from} to ${d.range.to}`, `Printed: ${printedOn}`],
    columns: t.columns,
    rows: t.rows.map((cells): ListRow => ({ cells })),
    foot: `${TITLES[pack]} · ${d.range.from} to ${d.range.to}`,
    pageWords: '{n}/{of}',
    empty: 'Nothing to show for this period.',
  };
}

export async function packPdf(pack: PackId, d: PackData, head: Letterhead, dpi: number, printedOn: string, engine: TextEngine = sharpText()): Promise<Buffer> {
  const doc = packDocument(pack, d, head, dpi, printedOn);
  return listPdf(doc, engine, { title: doc.title });
}

const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@\t]/.test(s) ? `'${s}` : s);

/** The pack as a spreadsheet file (CSV with a byte-order mark so Excel reads it as UTF-8). A cell that starts like a formula is quoted as text. */
export function packCsv(pack: PackId, d: PackData, head: Letterhead): string {
  const t = packTable(pack, d);
  const lines = [[head.name ?? ''], [TITLES[pack]], [`Period: ${d.range.from} to ${d.range.to}`], [], t.columns.map((c) => c.title), ...t.rows];
  return `﻿${lines.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
