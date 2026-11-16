// PR 1041 (final round D14): the Monthly statement of the ERP account. The pure part (no database) proves the owner's rules:
// closing = opening + bills - credits - paid + other, payments settle the oldest bill first for the age of what is owed, money
// paid ahead is never an age, the running month stops at today. The database part (skipped without TEST_DATABASE_ADMIN_URL) proves
// that the statement equals the ledger's own balance, needs `erp.account.read`, and never leaks another store's entries.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { buildStatement, monthlyStatement, statementMonths, syncErpAccount, type StatementEntry } from '../src';
import { setUpBooks, type BooksFixture } from './books-fixture';

const e = (kind: StatementEntry['kind'], day: string, amountMinor: number): StatementEntry => ({ kind, day, amountMinor });

describe('PR 1041: the statement of one month (pure)', () => {
  const entries = [
    e('BILL', '2026-10-20', 100000),
    e('PAYMENT', '2026-11-03', -40000),
    e('BILL', '2026-11-05', 60000),
    e('RETURN_CREDIT', '2026-11-06', -10000),
    e('BILL', '2026-11-10', 20000),
    e('ADJUSTMENT', '2026-11-11', 500),
  ];
  it('opening, bills, credits, paid, other and closing add up', () => {
    const s = buildStatement(entries, { minor: 0, day: null }, '2026-11', '2026-12-20');
    expect(s).toMatchObject({ openingMinor: 100000, billsMinor: 80000, creditsMinor: 10000, paidMinor: 40000, otherMinor: 500, closingMinor: 130500 });
    expect(s.counts).toEqual({ bills: 2, credits: 1, paid: 1, other: 1 });
    expect(s.days.at(-1)!.balanceMinor).toBe(s.closingMinor);
    expect(s.asOf).toBe('2026-11-30');
  });
  it('the age: the oldest bill is settled first, what is left is aged to the end of the month', () => {
    const s = buildStatement(entries, { minor: 0, day: null }, '2026-11', '2026-12-20');
    // 100000 (20 Oct) - 40000 - 10000 = 50000 left of it (41 days old); 60000 (5 Nov) is 25 days; 20000 (10 Nov) 20 days; 500 (11 Nov) 19 days
    expect(Object.fromEntries(s.age.map((a) => [a.band, a.minor]))).toEqual({ d7: 0, d15: 0, d30: 80500, older: 50000 });
    expect(s.age.reduce((n, a) => n + a.minor, 0)).toBe(s.closingMinor);
    expect(s.oldestOpenDay).toBe('2026-10-20');
  });
  it('the running month stops at today; a later entry is not in it', () => {
    const s = buildStatement([...entries, e('BILL', '2026-11-25', 9999)], { minor: 0, day: null }, '2026-11', '2026-11-12');
    expect(s.asOf).toBe('2026-11-12');
    expect(s.billsMinor).toBe(80000);
  });
  it('more paid than billed is "paid ahead", never an age, and a new bill uses it first', () => {
    const a = buildStatement([e('BILL', '2026-11-02', 10000), e('PAYMENT', '2026-11-03', -25000)], { minor: 0, day: null }, '2026-11', '2026-11-30');
    expect(a.closingMinor).toBe(-15000);
    expect(a.paidAheadMinor).toBe(15000);
    expect(a.age.every((x) => x.minor === 0)).toBe(true);
    const b = buildStatement([e('BILL', '2026-11-02', 10000), e('PAYMENT', '2026-11-03', -25000), e('BILL', '2026-11-20', 20000)], { minor: 0, day: null }, '2026-11', '2026-11-30');
    expect(b.closingMinor).toBe(5000);
    expect(b.paidAheadMinor).toBe(0);
  });
  it('the opening balance counts from its own day', () => {
    const s = buildStatement([e('BILL', '2026-11-05', 1000)], { minor: 70000, day: '2026-10-15' }, '2026-11', '2026-11-30');
    expect(s.openingMinor).toBe(70000);
    expect(s.closingMinor).toBe(71000);
    const t = buildStatement([e('BILL', '2026-11-05', 1000)], { minor: 70000, day: '2026-11-01' }, '2026-11', '2026-11-30');
    expect([t.openingMinor, t.otherMinor, t.closingMinor]).toEqual([0, 70000, 71000]);
  });
  it('the months to pick run from the first entry to the current month, newest first', () => {
    expect(statementMonths('2026-09-14', '2026-11-16')).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(statementMonths(null, '2026-11-16')).toEqual(['2026-11']);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 1041 on PostgreSQL: the statement equals the ledger', () => {
  let f: BooksFixture;
  beforeAll(async () => {
    f = await setUpBooks('erpstatement');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('bill + payment in the month: the statement closes at the ledger balance; it needs erp.account.read; the other store has none of it', async () => {
    await f.placeAndShip(f.storeA, 'ST-101', [f.line('ST-101-1', 'POLO-NAVY-M', 990)]);
    await f.shopOrder(f.storeA, 'ST-101', [{ lineId: 'ST-101-1', sku: 'POLO-NAVY-M', shopPrice: 650 }], new Date('2026-11-02T06:00:00Z'));
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    f.clock.now = new Date('2026-11-09T05:00:00Z');
    const accounts = await f.staff(['erp.account.read', 'erp.payments.record'], f.storeA, 'st-accounts');
    f.world.v6(f.company(f.storeA)).recordPayment(200, { reference: 'ST-1', date: '2026-11-09' });
    await f.deliverAll(f.storeA);
    await syncErpAccount(f.deps(), { storeId: f.storeA });
    const s = await monthlyStatement(f.deps(), f.who(accounts, f.storeA), { month: '2026-11' });
    expect(s).not.toBeNull();
    expect(s!.billsMinor).toBeGreaterThan(0);
    expect(s!.paidMinor).toBe(20000);
    expect(s!.closingMinor).toBe(s!.openingMinor + s!.billsMinor - s!.creditsMinor - s!.paidMinor + s!.otherMinor);
    expect(s!.closingMinor).toBe(s!.ledgerMinor);
    expect(s!.months[0]).toBe('2026-11');
    // a month that has not begun has no statement
    await expect(monthlyStatement(f.deps(), f.who(accounts, f.storeA), { month: '2027-03' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    // no permission, no statement
    const nobody = await f.staff([], f.storeA, 'st-nobody');
    await expect(monthlyStatement(f.deps(), f.who(nobody, f.storeA), { month: '2026-11' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // the other store: its own (empty or v5) statement, never store A's bill
    const other = await f.staff(['erp.account.read'], f.storeB, 'st-other');
    const o = await monthlyStatement(f.deps(), f.who(other, f.storeB), { month: '2026-11' }).catch(() => null);
    expect(o?.billsMinor ?? 0).toBe(0);
  });
});
