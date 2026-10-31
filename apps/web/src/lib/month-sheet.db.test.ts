// S16 · PR 346 — Money → Month-end on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the total per service
// counts a summary-line cost on its own day and any other on the store's day it happened (never the next month's); what
// the ERP has is each day's latest summary (a newer version not yet sent is waiting again), from the link's first day;
// the month's differences and its close (closed, then re-opened) read from the books; a store not on the books shows only
// its own costs. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { openErpLink } from '@extas/inventory';
import { monthDays, monthSheet } from './month-sheet';

const TZ = 'Asia/Dhaka';
const TODAY = '2026-10-31';
const day = (d: string) => new Date(`${d}T00:00:00Z`);

describe('month days (PR 346)', () => {
  it('from the first (or the link start) up to the last day given, never into the next month', () => {
    expect(monthDays('2026-09', null, '2026-09-03')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(monthDays('2026-09', '2026-09-29', '2026-10-05')).toEqual(['2026-09-29', '2026-09-30']);
    expect(monthDays('2026-02', null, '2026-12-31')).toHaveLength(28);
    expect(monthDays('2026-09', '2026-10-02', '2026-10-31')).toEqual([]);
  });
});

describe.skipIf(!HAS_TEST_DB)('month-end sheet on PostgreSQL (PR 346)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let linkId = '';

  beforeAll(async () => {
    t = await createTestDatabase('monthsheet');
    [A, B] = await seedSampleStores(t.prisma);
    const integ = await t.prisma.integration.create({ data: { storeId: A, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: true, config: {}, secretNames: [] } });
    const link = await openErpLink(t.prisma, A, integ.id);
    linkId = link.id;
    await t.prisma.erpStoreLink.update({ where: { id: linkId }, data: { switchDate: day('2026-09-20') } });
    const cost = (storeId: number, service: string, amountMinor: number, at: string, extra: { summaryLine?: 'DELIVERY' | 'OTHER'; costDate?: string } = {}) =>
      t.prisma.costEntry.create({
        data: { storeId, service, amountMinor, currency: 'BDT', source: 'test', occurredAt: new Date(at), summaryLine: extra.summaryLine ?? null, costDate: extra.costDate ? day(extra.costDate) : null },
      });
    // on a summary line: counted on its own day (the 30 Sep one happened on 1 Oct, still September's)
    await cost(A, 'COURIER', 6_000, '2026-09-21T06:00:00Z', { summaryLine: 'DELIVERY', costDate: '2026-09-21' });
    await cost(A, 'COURIER', 4_000, '2026-10-01T03:00:00Z', { summaryLine: 'DELIVERY', costDate: '2026-09-30' });
    await cost(A, 'COURIER', 9_999, '2026-10-02T06:00:00Z', { summaryLine: 'DELIVERY', costDate: '2026-10-02' });
    await cost(A, 'EXPENSE', 25_000, '2026-09-25T06:00:00Z', { summaryLine: 'OTHER', costDate: '2026-09-25' });
    // the shop's own ledger only: on the store's day (01:00 on 1 Sep in Dhaka is September; 01:00 on 1 Oct is not)
    await cost(A, 'SMS', 120, '2026-08-31T19:00:00Z');
    await cost(A, 'SMS', 80, '2026-09-15T10:00:00Z');
    await cost(A, 'SMS', 777, '2026-09-30T19:00:00Z');
    await cost(B, 'SMS', 50, '2026-09-10T10:00:00Z');

    const summary = (date: string, version: number) =>
      t.prisma.erpDailySummary.create({ data: { storeId: A, linkId, date: day(date), version, body: {}, bodyHash: `h-${date}-${version}`, netProfitMinor: 0n, reason: 'NIGHTLY' } });
    const send = (refId: string, kind: 'DAILY_SUMMARY' | 'FIXED_COSTS', accepted: boolean, httpStatus: number | null, attempt = 1) =>
      t.prisma.erpBooksSend.create({ data: { storeId: A, linkId, kind, refId, attempt, sentAt: new Date(Date.UTC(2026, 9, 1, 0, 0, attempt)), httpStatus, accepted, error: accepted ? null : 'sample' } });
    // 20 Sep: v1 accepted, v2 not sent yet → waiting again; 21 Sep accepted after a failed try; 22 Sep refused (4xx);
    // 23 Sep made, not sent; the rest of the days (24–30) not made
    const d20a = await summary('2026-09-20', 1);
    await send(d20a.id, 'DAILY_SUMMARY', true, 200);
    await summary('2026-09-20', 2);
    const d21 = await summary('2026-09-21', 1);
    await send(d21.id, 'DAILY_SUMMARY', false, 503, 1);
    await send(d21.id, 'DAILY_SUMMARY', true, 200, 2);
    const d22 = await summary('2026-09-22', 1);
    await send(d22.id, 'DAILY_SUMMARY', false, 422);
    await summary('2026-09-23', 1);
    const fixed = await t.prisma.erpFixedCostMonth.create({ data: { storeId: A, linkId, month: day('2026-09-01'), version: 1, salaryMinor: 0n, rentMinor: 0n, utilitiesMinor: 0n, otherMinor: 0n } });
    await send(fixed.id, 'FIXED_COSTS', true, 200);

    const diff = (date: string, key: string, status: 'PENDING' | 'MISMATCH' | 'FIXED' | 'OVERRIDDEN') =>
      t.prisma.booksDifference.create({ data: { storeId: A, linkId, date: day(date), check: 'ACCOUNT', kind: 'AMOUNT_DIFF', key, status, detail: {}, firstSeenAt: new Date(), lastSeenAt: new Date() } });
    await diff('2026-09-21', 'a', 'MISMATCH');
    await diff('2026-09-22', 'b', 'PENDING');
    await diff('2026-09-22', 'c', 'FIXED');
    await diff('2026-09-23', 'd', 'OVERRIDDEN');
    await diff('2026-10-01', 'e', 'MISMATCH');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('the total per service, split into what goes to the ERP and the shop’s own ledger', async () => {
    const s = await monthSheet(t.prisma, A, '2026-09', TZ, TODAY);
    expect(s.linked).toBe(true);
    expect(s.services).toEqual([
      { service: 'EXPENSE', minor: 25_000, count: 1, toErp: true },
      { service: 'COURIER', minor: 10_000, count: 2, toErp: true },
      { service: 'SMS', minor: 200, count: 2, toErp: false },
    ]);
    expect(s.totals).toEqual({ minor: 35_200, toErpMinor: 35_000, shopOnlyMinor: 200 });
  });

  it('what the ERP has: each day’s latest summary from the link’s first day, and the month’s fixed costs', async () => {
    const s = await monthSheet(t.prisma, A, '2026-09', TZ, TODAY);
    expect(s.days).toMatchObject({ total: 11, accepted: 1, waiting: 2, refused: 1, none: 7 });
    expect(s.days.notPosted.slice(0, 4)).toEqual(['2026-09-20', '2026-09-22', '2026-09-23', '2026-09-24']);
    expect(s.days.notPosted).not.toContain('2026-09-21');
    expect(s.fixedCosts).toBe('ACCEPTED');
    expect(s.differences).toEqual({ open: 2, fixed: 1, overridden: 1 });
    expect(s.close.state).toBe('OPEN');
    // this month only up to today
    const oct = await monthSheet(t.prisma, A, '2026-10', TZ, '2026-10-05');
    expect(oct.days.total).toBe(5);
    expect(oct.fixedCosts).toBe('NONE');
    expect(oct.differences.open).toBe(1);
  });

  it('the close: closed with differences, then re-opened', async () => {
    const close = (version: number, reopens: number | null) =>
      t.prisma.booksPeriodClose.create({
        data: { storeId: A, linkId, level: 'MONTH', periodStart: day('2026-09-01'), periodEnd: day('2026-09-30'), version, result: 'MISMATCH', openingBalanceMinor: 0n, closingBalanceMinor: 0n, matchedDays: 9, totalDays: 11, figures: {}, override: reopens == null, reopens, hash: `h${version}` },
      });
    await close(1, null);
    let s = await monthSheet(t.prisma, A, '2026-09', TZ, TODAY);
    expect(s.close).toMatchObject({ state: 'CLOSED', result: 'MISMATCH', override: true });
    await close(2, 1);
    s = await monthSheet(t.prisma, A, '2026-09', TZ, TODAY);
    expect(s.close.state).toBe('REOPENED');
  });

  it('a store not on the books shows only its own costs', async () => {
    const s = await monthSheet(t.prisma, B, '2026-09', TZ, TODAY);
    expect(s.linked).toBe(false);
    expect(s.totals).toEqual({ minor: 50, toErpMinor: 0, shopOnlyMinor: 50 });
    expect(s.days.total).toBe(0);
    expect(s.close.state).toBe('OPEN');
  });
});
