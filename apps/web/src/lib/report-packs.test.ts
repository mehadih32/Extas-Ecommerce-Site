// S28 · PR 690 — the report packs: the tables each pack holds, the letterhead on the paper document, a real PDF, and a safe CSV.
import { describe, expect, it } from 'vitest';
import { packCsv, packDocument, packPdf, packTable, PACKS, PACK_PRESET, type PackData } from './report-packs';

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
      expect(packTable(p, data).rows.length).toBeGreaterThan(0);
    }
  });
  it('the bank pack lists every account and their total; an unknown profit says so', () => {
    const rows = packTable('bank', data).rows;
    expect(rows).toContainEqual(['Net profit', 'Not known']);
    expect(rows.find((r) => r[0] === 'Balance: Bank')).toBeTruthy();
    expect(rows.find((r) => r[0] === 'All accounts')?.[1]).toContain('10,000');
  });
  it('without book access the bank pack has no balances', () => {
    expect(packTable('bank', { ...data, accounts: null }).rows.some((r) => r[0].startsWith('Balance'))).toBe(false);
  });
  it('the stock pack holds the restock and unsold styles', () => {
    expect(packTable('stock', data).rows.map((r) => r[0])).toEqual(['Restock now', 'Unsold']);
  });
  it('the paper document carries the letterhead, the period and the page words', () => {
    const doc = packDocument('monthly', data, head, 150, '13 Nov 2026');
    expect(doc.letterhead).toEqual(['Extas', 'Dhaka', '0170']);
    expect(doc.summary[0]).toContain('2026-10-01 to 2026-10-31');
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
});
