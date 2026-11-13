// S28 · PR 689 (admin prototype v5, Reports › Single reports) — the library's own answers as files: Sales and profit (each card
// with the span before and the change), Products and stock (restock now and sitting unsold), When orders come in (by weekday and
// by hour) and the Monthly review (last month's facts). Each reads the same screen figures as the library, nothing more.
import type { FileTable, ReportFile, Value, Words } from './report-files';
import { wordsFor } from './report-files';
import type { LibraryCard, ReviewFacts } from './report-library-api';

export const SINGLE_REPORTS = ['figures', 'products', 'timing', 'review'] as const;
export type SingleId = (typeof SINGLE_REPORTS)[number];

export interface SingleData {
  range: { from: string; to: string };
  currency: string;
  cards: LibraryCard[];
  restock: { restock: Style[]; unsold: Style[] };
  time: { weekday: number[]; hour: number[]; discountMinor: number };
  review: ReviewFacts;
}
interface Style {
  name: string;
  sizesInStock: number;
  sizesTotal: number;
  stockDays: number | null;
  sold30: number;
}

export function singleFile(id: SingleId, d: SingleData, w: Words = wordsFor('en')): ReportFile {
  const val = (c: Pick<LibraryCard, 'kind'>, n: number | null): Value => (c.kind === 'money' ? { money: n } : n);
  let tables: FileTable[];
  let range = d.range;
  if (id === 'figures') {
    tables = [
      {
        name: w('partFigures'),
        columns: [{ title: w('figure') }, { title: w('value'), right: true }, { title: w('before'), right: true }, { title: w('change'), right: true }],
        rows: d.cards.map((c): Value[] => [w(`cards.${c.id}`), val(c, c.now), c.prev === null ? null : val(c, c.prev), c.change === null ? null : `${c.change}%`]),
      },
    ];
  } else if (id === 'products') {
    const cols = [{ title: w('style') }, { title: w('sizes'), right: true }, { title: w('stockDays'), right: true }, { title: w('sold30'), right: true }];
    const row = (s: Style): Value[] => [s.name, w('sizesOf', { n: s.sizesInStock, total: s.sizesTotal }), s.stockDays, s.sold30];
    tables = [
      { name: w('partRestock'), columns: cols, rows: d.restock.restock.map(row) },
      { name: w('partUnsold'), columns: cols, rows: d.restock.unsold.map(row) },
    ];
  } else if (id === 'timing') {
    tables = [
      { name: w('partWeekday'), columns: [{ title: w('weekday') }, { title: w('orders'), right: true }], rows: d.time.weekday.map((n, i): Value[] => [w(`days.${i}`), n]) },
      { name: w('partHour'), columns: [{ title: w('hour') }, { title: w('orders'), right: true }], rows: d.time.hour.map((n, i): Value[] => [`${i}`, n]) },
    ];
  } else {
    const r = d.review;
    range = { from: r.from, to: r.to };
    const pct = (n: number | null): Value => (n === null ? null : `${n}%`);
    tables = [
      {
        name: w('partFigures'),
        columns: [{ title: w('figure') }, { title: w('value'), right: true }, { title: w('change'), right: true }],
        rows: [
          [w('cards.sales'), { money: r.salesMinor }, pct(r.salesChange)],
          [w('cards.profit'), { money: r.netProfitMinor }, pct(r.profitChange)],
          [w('cards.orders'), r.orders, null],
          [w('busiest'), r.busiestWeekday === null ? null : w(`days.${r.busiestWeekday}`), null],
          [w('cards.restock'), r.restockStyles, null],
        ],
      },
    ];
  }
  return { title: w(`titles.${id}`), range, currency: d.currency, tables };
}
