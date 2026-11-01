// S16 · PR 536 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): an expense entered in the shop reaches the
// ERP's daily summary exactly once. Money → Expenses (PR 344) writes a cost entry on the head's summary line and a
// RetailExpense row pointing at it (`erpPushId`); the day's figures count the cost entry, never the row as well. A row
// with no cost entry behind it still counts; a reversed expense counts 0 and leaves the line unknown, as PR 618 says.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { dayFigures } from '../src';

const DAY = '2026-11-03';
const date = new Date(`${DAY}T00:00:00Z`);

describe.skipIf(!HAS_TEST_DB)('PR 536 · an expense reaches the daily summary once', () => {
  let t: TestDatabase;
  let S = 0;

  async function expense(headId: string, line: 'PACKAGING' | 'OTHER', amountMinor: number, withCost: boolean, reverse = false) {
    const cost = withCost
      ? await t.prisma.costEntry.create({ data: { storeId: S, service: 'expense', module: 'books', amountMinor, currency: 'BDT', source: 'MANUAL', occurredAt: new Date(`${DAY}T06:00:00Z`), costDate: date, summaryLine: line } })
      : null;
    await t.prisma.retailExpense.create({ data: { storeId: S, headId, amountMinor, date, erpPushId: cost?.id ?? null } });
    if (cost && reverse) {
      const back = await t.prisma.costEntry.create({ data: { storeId: S, service: 'expense', module: 'books', amountMinor: -amountMinor, currency: 'BDT', source: 'MANUAL', occurredAt: new Date(`${DAY}T07:00:00Z`), costDate: date, summaryLine: line, refType: 'CostEntry', refId: cost.id } });
      await t.prisma.retailExpense.create({ data: { storeId: S, headId, amountMinor: -amountMinor, date, erpPushId: back.id } });
    }
  }

  beforeAll(async () => {
    t = await createTestDatabase('books536');
    [S] = await seedSampleStores(t.prisma);
    const tape = await t.prisma.expenseHead.create({ data: { storeId: S, key: 'tape', nameEn: 'Packing tape', summaryLine: 'PACKAGING' } });
    const office = await t.prisma.expenseHead.create({ data: { storeId: S, key: 'office', nameEn: 'Office', summaryLine: 'OTHER' } });
    const misc = await t.prisma.expenseHead.create({ data: { storeId: S, key: 'misc', nameEn: 'Misc', summaryLine: 'ACCESSORIES' } });
    await expense(tape.id, 'PACKAGING', 35_000, true); // through Money → Expenses
    await expense(office.id, 'OTHER', 5_000, false); // a row with no cost entry behind it
    await expense(misc.id, 'OTHER', 12_000, true, true); // entered on the Misc head's cost line OTHER, then reversed
  });
  afterAll(async () => t?.drop());

  it('counts the cost entry once, a row without one still, and a reversal as 0', async () => {
    const f = await dayFigures(t.prisma, { storeId: S, linkId: '0190a1b2-0000-7000-8000-00000000a536', day: DAY, timeZone: 'Asia/Dhaka', currency: 'BDT' });
    expect(f.costs.PACKAGING).toEqual({ minor: 35_000, entries: 1 }); // never 70,000
    // OTHER: the office row (5,000) and the reversed pair (12,000 − 12,000), whose rows add nothing more
    expect(f.costs.OTHER).toEqual({ minor: 5_000, entries: 1 });
    // ACCESSORIES: the misc head's rows point at cost entries on OTHER, so nothing lands here twice
    expect(f.costs.ACCESSORIES).toEqual({ minor: 0, entries: 0 });
  });
});
