// PR 27, 28, 32, 34, 38 without a database: the size chart arithmetic, the CSV reader and writer, the honesty rule of
// the "was" price, the collection states, the stored chart shapes and the v7 settings.
import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, isOwnerSetting, ownerDataRegister, registry } from '@extas/settings';
import {
  bothUnits,
  collectionState,
  comboWasFor,
  csvCell,
  CsvSyntaxError,
  formatMoneyCell,
  inchToCm,
  missingSizes,
  parseBool,
  parseCsv,
  parseMoney,
  parsePasted,
  productFitKey,
  readMeta,
  readRows,
  readTable,
  roundToStep,
  sizeForBody,
  sortSizes,
  suggestRow,
  uncell,
  wasPriceFor,
  writeCsv,
  type WasPriceInput,
} from '../src';

const ORDER = ['xs', 's', 'm', 'l', 'xl', 'xxl', '3xl', '28', '30', '32', '34', '36'];
const polo = [
  { size: 's', values: [38, 27, 16.5, 7.5] },
  { size: 'm', values: [40, 28, 17, 8] },
  { size: 'l', values: [42, 29, 18, 8.25] },
  { size: 'xl', values: [44, 30, 19, 8.5] },
];

describe('size chart arithmetic (PR 27)', () => {
  it('works cm out from inches once, rounded as the setting says', () => {
    expect(inchToCm(40, 0)).toBe(102);
    expect(inchToCm(16.5, 1)).toBe(41.9);
    expect(bothUnits(40, 'inch', 0)).toEqual({ inch: 40, cm: 102 });
    expect(bothUnits(102, 'cm', 0)).toEqual({ inch: 40.16, cm: 102 });
    expect(roundToStep(40.13, 0.25)).toBe(40.25);
    expect(roundToStep(40.1, 0.5)).toBe(40);
  });

  it("keeps the shop's size order; numbers by value; unknown last", () => {
    expect(sortSizes(['xl', 's', 'm'], ORDER)).toEqual(['s', 'm', 'xl']);
    expect(sortSizes(['34', '30', '32'], ORDER)).toEqual(['30', '32', '34']);
    expect(sortSizes(['40', '38'], [])).toEqual(['38', '40']);
    expect(sortSizes(['zz', 'm'], ORDER)).toEqual(['m', 'zz']);
  });

  it('suggests a missing row from its neighbours (demo sc_addRow), never out of nothing', () => {
    // past the end: the chart's own step (XL − L)
    expect(suggestRow(polo, ORDER, 'xxl', 0.25)).toEqual([46, 31, 20, 8.75]);
    // before the start: the first step backwards
    expect(suggestRow(polo, ORDER, 'xs', 0.25)).toEqual([36, 26, 16, 7]);
    // between two rows: the middle, rounded to the step
    expect(suggestRow([polo[0]!, polo[2]!], ORDER, 'm', 0.25)).toEqual([40, 28, 17.25, 8]);
    // one neighbour only: a copy to check, no invented growth
    expect(suggestRow([polo[1]!], ORDER, 'l', 0.25)).toEqual([40, 28, 17, 8]);
  });

  it('reads rows pasted from Excel: tabs, spaces, commas; header skipped; unknown sizes named', () => {
    const sizeOf = (t: string) => (ORDER.includes(t.toLowerCase()) ? t.toLowerCase() : null);
    const r = parsePasted('Size\tChest\tLength\nS\t38\t27\nM, 40, 28\nL 42 29 99\nXL 44\nZZ 1 2\n\n', 2, sizeOf);
    expect(r.rows).toEqual([
      { size: 's', values: [38, 27] },
      { size: 'm', values: [40, 28] },
      { size: 'l', values: [42, 29] },
    ]);
    expect(r.unknownSizes).toEqual(['ZZ']);
    expect(r.skipped).toBe(2);
  });

  it('finds the sizes a product sells that the chart lacks, and a size for a body measure', () => {
    expect(missingSizes(['s', 'm', 'l'], ['m', 'l', 'xl', 'xxl', 'xl'])).toEqual(['xl', 'xxl']);
    expect(sizeForBody(polo, ORDER, 0, 36, 4)).toBe('m');
    expect(sizeForBody(polo, ORDER, 0, 37, 4)).toBe('l');
    expect(sizeForBody(polo, ORDER, 0, 41, 4)).toBeNull();
  });

  it("reads both stored shapes: this PR's object and the sample seed's bare list", () => {
    expect(readMeta(['chest', 'length'])).toEqual({ fields: ['chest', 'length'], easeInch: null, diagram: null, copiedFromId: null });
    expect(readMeta({ fields: ['waist'], easeInch: 1, diagram: 'bottom', copiedFromId: null })).toEqual({ fields: ['waist'], easeInch: 1, diagram: 'bottom', copiedFromId: null });
    expect(readMeta('nonsense')).toEqual({ fields: [], easeInch: null, diagram: null, copiedFromId: null });
    expect(readRows([{ size: 's', values: [1, 2] }, { size: 'm', values: ['x'] }])).toEqual([{ size: 's', values: [1, 2] }]);
    expect(readRows({ s: [1], m: [2] })).toEqual([
      { size: 's', values: [1] },
      { size: 'm', values: [2] },
    ]);
  });

  it("finds a product's fit from its key or its fit line", () => {
    const fits = registry['catalogue.fits'].default;
    expect(productFitKey({ fitKey: 'slim' }, fits)).toBe('slim');
    expect(productFitKey({ fit: 'Regular fit' }, fits)).toBe('regular');
    expect(productFitKey({ fit: '  relaxed FIT ' }, fits)).toBe('relaxed');
    expect(productFitKey({ fit: 'One size' }, fits)).toBeNull();
    expect(productFitKey(null, fits)).toBeNull();
  });
});

describe('CSV (PR 34)', () => {
  it('reads quotes, doubled quotes, line breaks in a cell, CRLF and a BOM', () => {
    const text = '﻿product,nameEn,descriptionEn\r\npolo,"Polo, navy","Soft ""piqué""\nline two"\r\n\r\ntee,Tee,\n';
    expect(parseCsv(text, ',')).toEqual([['product', 'nameEn', 'descriptionEn'], ['polo', 'Polo, navy', 'Soft "piqué"\nline two'], [''], ['tee', 'Tee', '']]);
    const t = readTable(text, ',');
    expect(t.header).toEqual(['product', 'nameEn', 'descriptionEn']);
    expect(t.rows.map((r) => [r.line, r.cells[0]])).toEqual([
      [2, 'polo'],
      [4, 'tee'],
    ]);
    expect(() => parseCsv('a,"b\n', ',')).toThrow(CsvSyntaxError);
    expect(parseCsv('a;b\tc', ';')).toEqual([['a', 'b\tc']]);
  });

  it('writes what spreadsheets read back, and never a formula', () => {
    expect(csvCell('a,b', ',')).toBe('"a,b"');
    expect(csvCell('say "hi"', ',')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")', ',')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1', ',')).toBe("'-1");
    expect(csvCell(-1, ',')).toBe('-1');
    expect(csvCell(null, ',')).toBe('');
    const file = writeCsv(['product', 'nameEn'], [['polo', '@cmd'], ['tee', ' padded ']], ',');
    expect(file.startsWith('﻿')).toBe(true);
    const back = readTable(file, ',');
    expect(back.rows.map((r) => r.cells.map(uncell))).toEqual([
      ['polo', '@cmd'],
      ['tee', ' padded '],
    ]);
  });

  it('reads and writes money in the currency’s minor units; yes/no cells', () => {
    expect(parseMoney('850', 2)).toBe(85000);
    expect(parseMoney('1,450.5', 2)).toBe(145050);
    expect(parseMoney('1450.505', 2)).toBeNull();
    expect(parseMoney('-5', 2)).toBeNull();
    expect(parseMoney('abc', 2)).toBeNull();
    expect(parseMoney('12', 0)).toBe(12);
    expect(formatMoneyCell(85000, 2)).toBe('850');
    expect(formatMoneyCell(145050, 2)).toBe('1450.50');
    expect(formatMoneyCell(null, 2)).toBe('');
    expect([parseBool('Yes'), parseBool('0'), parseBool('maybe')]).toEqual([true, false, null]);
  });

  it('the column list never offers cost or ERP prices, nor owner data', () => {
    for (const c of CSV_COLUMNS) expect(c.toLowerCase()).not.toMatch(/cost|erp(?!.*code)|retail/);
    const owned = [...ownerDataRegister.tables.map((t) => t.target), ...ownerDataRegister.columns.map((c) => c.target)];
    expect(owned).not.toContain('Product');
    expect(owned).not.toContain('ProductVariant');
  });
});

describe('"was" price honesty rule (PR 38)', () => {
  const now = new Date('2026-10-20T06:00:00Z');
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const base: WasPriceInput = { source: 'MRP', priceMinor: 85000, compareAtMinor: 119000, brand: { isOwnLabel: false }, mrpOwnLabel: false, history: [], historyDays: 30, now };

  it('shows nothing until a source is chosen, or when "none" is', () => {
    expect(wasPriceFor({ ...base, source: null })).toMatchObject({ wasMinor: null, reason: 'NOT_CHOSEN' });
    expect(wasPriceFor({ ...base, source: 'NONE' })).toMatchObject({ wasMinor: null, reason: 'OFF' });
  });

  it('MRP: only a real list price above today’s, only on genuine branded goods', () => {
    expect(wasPriceFor(base)).toMatchObject({ wasMinor: 119000, reason: 'SHOWN' });
    expect(wasPriceFor({ ...base, compareAtMinor: null })).toMatchObject({ wasMinor: null, reason: 'NO_MRP' });
    expect(wasPriceFor({ ...base, compareAtMinor: 85000 })).toMatchObject({ wasMinor: null, reason: 'NOT_HIGHER' });
    expect(wasPriceFor({ ...base, brand: { isOwnLabel: true } })).toMatchObject({ wasMinor: null, reason: 'MRP_OWN_LABEL' });
    expect(wasPriceFor({ ...base, brand: null })).toMatchObject({ wasMinor: null, reason: 'MRP_OWN_LABEL' });
    expect(wasPriceFor({ ...base, brand: { isOwnLabel: true }, mrpOwnLabel: true })).toMatchObject({ wasMinor: 119000, reason: 'SHOWN' });
    expect(wasPriceFor({ ...base, priceMinor: null })).toMatchObject({ reason: 'NO_PRICE' });
  });

  it('price history: the lowest real price of the window before the change, only for that window', () => {
    const h = (rows: [number, number][]) => rows.map(([d, p]) => ({ effectiveFrom: day(d), priceMinor: p }));
    const src: WasPriceInput = { ...base, source: 'PRICE_HISTORY', priceMinor: 85000 };
    // 1000 for months, cut to 850 five days ago → was 1000
    expect(wasPriceFor({ ...src, history: h([[200, 100000], [5, 85000]]) })).toMatchObject({ wasMinor: 100000, reason: 'SHOWN' });
    // a short dip to 900 inside the 30 days before the cut counts: the lowest is shown, not the highest
    expect(wasPriceFor({ ...src, history: h([[200, 100000], [20, 90000], [15, 100000], [5, 85000]]) })).toMatchObject({ wasMinor: 90000 });
    // a price raised just before the cut does not make a bigger "was" (the 30 days before it started lower)
    expect(wasPriceFor({ ...src, history: h([[200, 80000], [8, 120000], [5, 85000]]) })).toMatchObject({ wasMinor: null, reason: 'NOT_HIGHER' });
    // the cut was long ago: it is simply the price now
    expect(wasPriceFor({ ...src, history: h([[200, 100000], [40, 85000]]) })).toMatchObject({ wasMinor: null, reason: 'TOO_OLD' });
    // never another price, or the history does not end at today's price
    expect(wasPriceFor({ ...src, history: h([[100, 85000], [50, 85000]]) })).toMatchObject({ wasMinor: null, reason: 'NO_HISTORY' });
    expect(wasPriceFor({ ...src, history: h([[100, 90000]]) })).toMatchObject({ wasMinor: null, reason: 'NO_HISTORY' });
    // a future row is not history yet
    expect(wasPriceFor({ ...src, history: [...h([[200, 100000], [5, 85000]]), { effectiveFrom: new Date(now.getTime() + 86_400_000), priceMinor: 70000 }] })).toMatchObject({ wasMinor: 100000 });
  });

  it('combo: the sum of the pieces’ own prices, only when every piece has one and it is higher', () => {
    expect(comboWasFor(150000, [{ priceMinor: 85000, quantity: 2 }])).toEqual({ sumMinor: 170000, wasMinor: 170000, reason: 'SHOWN' });
    expect(comboWasFor(170000, [{ priceMinor: 85000, quantity: 2 }])).toMatchObject({ wasMinor: null, reason: 'NOT_HIGHER' });
    expect(comboWasFor(150000, [{ priceMinor: null, quantity: 1 }])).toMatchObject({ wasMinor: null, reason: 'NO_PRICE' });
    expect(wasPriceFor({ ...base, source: 'COMBO' })).toMatchObject({ wasMinor: null, reason: 'COMBO_ONLY' });
    expect(wasPriceFor({ ...base, source: 'LAUNCH_PRICE' })).toMatchObject({ wasMinor: null, reason: 'NO_END_DATE' });
  });
});

describe('collections (PR 32)', () => {
  const now = new Date('2026-10-20T06:00:00Z');
  it('live, scheduled and ended are states of a permanent page', () => {
    expect(collectionState({ startsAt: null, endsAt: null, archivedAt: null }, now)).toBe('always');
    expect(collectionState({ startsAt: new Date('2026-10-01'), endsAt: new Date('2026-11-01'), archivedAt: null }, now)).toBe('live');
    expect(collectionState({ startsAt: new Date('2026-12-01'), endsAt: null, archivedAt: null }, now)).toBe('scheduled');
    expect(collectionState({ startsAt: new Date('2026-04-01'), endsAt: new Date('2026-05-01'), archivedAt: null }, now)).toBe('ended');
    expect(collectionState({ startsAt: null, endsAt: null, archivedAt: now }, now)).toBe('archived');
  });
});

describe('settings of these PRs (registry version 7)', () => {
  const keys = Object.keys(registry).filter((k) => /^catalogue\.(fits|sizeCharts|collections|tags|csv|wasPrice)/.test(k));
  it('are all version 7 and parse their own defaults', () => {
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const k of keys) {
      const spec = registry[k as keyof typeof registry];
      expect(spec.version, k).toBe(7);
      expect(spec.schema.safeParse(spec.default).success, k).toBe(true);
    }
  });
  it('the "was" price source is the owner’s: no default, his OK needed; everything else ships', () => {
    const src = registry['catalogue.wasPrice.defaultSource'];
    expect(src.default).toBeNull();
    expect(src.isOwnerData && src.requiresOwnerOk).toBe(true);
    expect(keys.filter((k) => isOwnerSetting(k, registry))).toEqual(['catalogue.wasPrice.defaultSource']);
  });
  it('how-to lines exist for every measurement of the default pack, in both languages', () => {
    const how = registry['catalogue.sizeCharts.howToMeasure'].default;
    for (const k of ['chest', 'length', 'shoulder', 'sleeve', 'waist', 'hip', 'thigh', 'legOpening']) {
      expect(how[k]?.en, k).toBeTruthy();
      expect(how[k]?.bn, k).toBeTruthy();
    }
  });
});
