// S28 · PR 690 — the report packs: the tables each pack holds, the letterhead on the paper document, a real PDF, and a safe CSV.
import { describe, expect, it } from 'vitest';
import { fileDocument, fileSheets, wordsFor } from './report-files';
import { packCsv, packFile, packPdf, packTables, packXlsx, PACKS, PACK_PRESET, type PackData } from './report-packs';

const en = wordsFor('en');
const bn = wordsFor('bn');
const flat = (p: (typeof PACKS)[number], d: PackData, w = en) => packTables(p, d, w).flatMap((t) => t.rows.map((r) => r.map((v) => (v !== null && typeof v === 'object' ? (v.money === null ? 'Not known' : `${v.money}`) : v))));

const data: PackData = {
  range: { from: '2026-10-01', to: '2026-10-31' },
  currency: 'BDT',
  cards: [
    { id: 'sales', kind: 'money', now: 1_250_000 },
    { id: 'profit', kind: 'money', now: null },
    { id: 'orders', kind: 'count', now: 42 },
    { id: 'aov', kind: 'money', now: 29_762 },
    { id: 'discount', kind: 'money', now: 5_000 },
    { id: 'restock', kind: 'count', now: 1 },
  ],
  restock: { restock: [{ name: 'Gap polo', sizesInStock: 1, sizesTotal: 3, stockDays: 6, sold30: 20 }], unsold: [{ name: '=Old tee', sizesInStock: 2, sizesTotal: 2, stockDays: null, sold30: 0 }] },
  weekday: [1, 2, 3, 4, 5, 6, 7],
  discountMinor: 5_000,
  accounts: [
    { name: 'Cash', balanceMinor: 100_000 },
    { name: 'Bank', balanceMinor: 900_000 },
  ],
  fixedMinor: 300_000,
};
const head = { name: 'Extas', address: 'Dhaka', phone: '0170' };

describe('PR 690 · report packs', () => {
  it('every pack has a period and a table', () => {
    for (const p of PACKS) {
      expect(PACK_PRESET[p]).toMatch(/^(lastmonth|last30)$/);
      expect(packTables(p, data).flatMap((t) => t.rows).length).toBeGreaterThan(0);
    }
  });
  it('the bank pack lists every account and their total; an unknown profit says so', () => {
    const rows = flat('bank', data);
    expect(rows).toContainEqual(['Net profit', 'Not known']);
    expect(rows.find((r) => r[0] === 'Balance: Bank')).toBeTruthy();
    expect(rows.find((r) => r[0] === 'All accounts')?.[1]).toBe('1000000'); // minor units; shown as 10,000 on paper
  });
  it('without book access the bank pack has no balances', () => {
    expect(flat('bank', { ...data, accounts: null }).some((r) => String(r[0]).startsWith('Balance'))).toBe(false);
    expect(packTables('bank', { ...data, accounts: null }).length).toBe(1);
  });
  it('the stock pack holds the restock and unsold styles', () => {
    expect(packTables('stock', data).map((t) => [t.name, t.rows.length])).toEqual([['Restock now', 1], ['Sitting unsold', 1]]);
  });
  it('the paper document carries the letterhead, the period and the page words', () => {
    const doc = fileDocument(packFile('monthly', data), head, en, 150, '13 Nov 2026');
    expect(doc.letterhead).toEqual(['Extas', 'Dhaka', '0170']);
    expect(doc.summary[0]).toContain('2026-10-01 to 2026-10-31');
    expect(doc.title).toBe('Monthly business report');
    expect(doc.pageWords).toBe('{n}/{of}');
    expect(doc.widthMm).toBe(210);
  });
  it('makes a real PDF', async () => {
    const pdf = await packPdf('monthly', data, head, 100, '13 Nov 2026');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
  it('the CSV has a byte-order mark, quotes commas and does not let a cell start like a formula', () => {
    const csv = packCsv('stock', data, { ...head, name: 'Extas, Dhaka' });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Extas, Dhaka"');
    expect(csv).toContain("'=Old tee");
  });
  it('the Excel file has a sheet for each part, money as numbers in the main unit, and a Bengali one speaks Bengali', () => {
    const sheets = fileSheets(packFile('bank', data), en);
    expect(sheets.map((s) => s.name)).toEqual(['Figures', 'Account balances']);
    expect(sheets[1]!.rows).toContainEqual(['Balance: Bank', 9000]);
    expect(packXlsx('stock', data).subarray(0, 2).toString()).toBe('PK');
    expect(packTables('monthly', data, bn)[0]!.rows[0]![0]).toBe('বিক্রি');
    expect(packFile('sales', data, bn).title).toBe('বিক্রির রিপোর্ট');
  });
  it('the PDF can be made in Bengali', async () => {
    const pdf = await packPdf('stock', data, head, 100, '13 Nov 2026', undefined, bn);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
});
