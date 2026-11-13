// S28 · PR 689 — the single reports as files: the library's own figures, one part each, in English or Bengali.
import { describe, expect, it } from 'vitest';
import { fileCsv, fileSheets, wordsFor } from './report-files';
import { SINGLE_REPORTS, singleFile, type SingleData } from './report-singles';

const data: SingleData = {
  range: { from: '2026-11-01', to: '2026-11-13' },
  currency: 'BDT',
  cards: [
    { id: 'sales', group: 'sales', kind: 'money', now: 200_000, prev: 100_000, change: 100 },
    { id: 'profit', group: 'sales', kind: 'money', now: null, prev: null, change: null },
    { id: 'orders', group: 'sales', kind: 'count', now: 10, prev: 8, change: 25 },
  ],
  restock: { restock: [{ name: 'Gap polo', sizesInStock: 1, sizesTotal: 3, stockDays: 6, sold30: 20 }], unsold: [] },
  time: { weekday: [1, 2, 3, 4, 5, 6, 7], hour: Array.from({ length: 24 }, (_, i) => i), discountMinor: 0 },
  review: { from: '2026-10-01', to: '2026-10-31', salesMinor: 900_000, salesChange: -10, netProfitMinor: null, profitChange: null, orders: 40, busiestWeekday: 5, restockStyles: 1 },
};
const en = wordsFor('en');

describe('PR 689 · single reports as files', () => {
  it('every report has at least one part and a title in both languages', () => {
    for (const id of SINGLE_REPORTS) {
      expect(singleFile(id, data, en).tables.length).toBeGreaterThan(0);
      expect(singleFile(id, data, wordsFor('bn')).title).not.toBe(singleFile(id, data, en).title);
    }
  });
  it('the figures keep the change against the span before; an unknown profit is not turned into zero', () => {
    const sheet = fileSheets(singleFile('figures', data, en), en)[0]!;
    expect(sheet.rows).toContainEqual(['Sales', 2000, 1000, '100%']);
    expect(sheet.rows).toContainEqual(['Net profit', 'Not known', null, null]);
  });
  it('the timing report has a part for weekdays (7) and one for hours (24)', () => {
    const t = singleFile('timing', data, en).tables;
    expect(t.map((x) => x.rows.length)).toEqual([7, 24]);
  });
  it('the monthly review uses last month, whatever period was asked', () => {
    const f = singleFile('review', data, en);
    expect(f.range).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(fileCsv(f, { name: 'Shop', address: null, phone: null }, en)).toContain('Friday');
  });
});
