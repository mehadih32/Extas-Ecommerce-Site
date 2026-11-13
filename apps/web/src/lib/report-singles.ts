// S28 · PR 689 (admin prototype v5, Reports › Single reports) — the library's own answers as files: Sales and profit (each card
// with the span before and the change), Products and stock (restock now and sitting unsold), When orders come in (by weekday and
// by hour) and the Monthly review (last month's facts). Each reads the same screen figures as the library, nothing more.
import type { FileTable, ReportFile, Value, Words } from './report-files';
import { wordsFor } from './report-files';
import type { LibraryCard, ReviewFacts } from './report-library-api';

export const SINGLE_REPORTS = ['figures', 'products', 'timing', 'review', 'courier', 'areas', 'customers', 'team'] as const;
export type SingleId = (typeof SINGLE_REPORTS)[number];

export interface SingleData {
  range: { from: string; to: string };
  currency: string;
  cards: LibraryCard[];
  restock: { restock: Style[]; unsold: Style[] };
  time: { weekday: number[]; hour: number[]; discountMinor: number };
  review: ReviewFacts;
  /** Courier, Areas, Customers and Team (loaded only for the report asked for; null = off or not allowed). */
  courier?: CourierLine[] | null;
  areas?: { level: string; rows: AreaLine[]; unknown: Omit<AreaLine, 'name' | 'parent'> } | null;
  customers?: CustomerFacts | null;
  team?: { from: string; to: string; rows: { name: string; counts: Record<'confirmed' | 'packed' | 'handedOver' | 'replies', number> }[] } | null;
}
export interface CourierLine { label: string; parcels: number; delivered: number; successRate: number | null; onTimeRate: number | null; returned: number; refused: number }
export interface AreaLine { name: string; parent: string | null; delivered: number; salesMinor: number; pieces: number; returned: number; returnRate: number | null }
export interface CustomerFacts { enabled: boolean; quietDays: number; buyers: number; newBuyers: number; returning: number; quiet: number; repeaters: number; repeatRate: number | null }

/** A 0-1 share as a percentage with one decimal ("80%", "16.7%"); null stays unknown. */
const share = (r: number | null): Value => (r === null ? null : `${Math.round(r * 1000) / 10}%`);
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
  } else if (id === 'courier') {
    tables = [
      {
        name: w('partCourier'),
        columns: [{ title: w('courierName') }, { title: w('parcels'), right: true }, { title: w('delivered'), right: true }, { title: w('success'), right: true }, { title: w('onTime'), right: true }, { title: w('returned'), right: true }, { title: w('refused'), right: true }],
        rows: (d.courier ?? []).map((c): Value[] => [c.label, c.parcels, c.delivered, share(c.successRate), share(c.onTimeRate), c.returned, c.refused]),
      },
    ];
  } else if (id === 'areas') {
    const a = d.areas;
    const line = (x: Omit<AreaLine, 'name' | 'parent'>): Value[] => [x.delivered, { money: x.salesMinor }, x.pieces, x.returned, share(x.returnRate)];
    tables = [
      {
        name: w('partAreas'),
        columns: [{ title: w('area') }, { title: w('delivered'), right: true }, { title: w('cards.sales'), right: true }, { title: w('pieces'), right: true }, { title: w('returned'), right: true }, { title: w('returnRate'), right: true }],
        rows: a ? [...a.rows.map((x): Value[] => [x.parent ? `${x.name}, ${x.parent}` : x.name, ...line(x)]), [w('areaUnknown'), ...line(a.unknown)]] : [],
      },
    ];
  } else if (id === 'customers') {
    const c = d.customers;
    tables = [
      {
        name: w('partCustomers'),
        columns: [{ title: w('figure') }, { title: w('value'), right: true }],
        rows: c && c.enabled
          ? [[w('newBuyers'), c.newBuyers], [w('returning'), c.returning], [w('quiet', { n: c.quietDays }), c.quiet], [w('buyers'), c.buyers], [w('repeat'), share(c.repeatRate)]]
          : [[w('off'), null]],
      },
    ];
  } else if (id === 'team') {
    const tm = d.team;
    if (tm) range = { from: tm.from, to: tm.to };
    tables = [
      {
        name: w('partTeam'),
        columns: [{ title: w('person') }, { title: w('confirmed'), right: true }, { title: w('packed'), right: true }, { title: w('handedOver'), right: true }, { title: w('replies'), right: true }],
        rows: tm ? tm.rows.map((r): Value[] => [r.name, r.counts.confirmed, r.counts.packed, r.counts.handedOver, r.counts.replies]) : [[w('off'), null, null, null, null]],
      },
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
