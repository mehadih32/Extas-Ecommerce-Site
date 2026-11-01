// S16 · PR 347 — the Costs report on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): this store's rows
// only; a row counts on its business day (costDate, else the Dhaka day of occurredAt), so a cost line for an earlier day
// lands there and a row written at 02:00 Dhaka time is that Dhaka day; by day, month and year; by service and by module
// (no module = ''); a reversal (negative row) nets out; the AI spend this month against the cap (none set = no cap).
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { aiAgainstCap, costReport } from './cost-report';

describe.skipIf(!HAS_TEST_DB)('costs report on PostgreSQL (PR 347)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const TZ = 'Asia/Dhaka';

  const cost = (storeId: number, service: string, module: string | null, amountMinor: number, occurredAt: string, costDate?: string) =>
    t.prisma.costEntry.create({ data: { storeId, service, module, amountMinor, currency: 'BDT', source: 'system', occurredAt: new Date(occurredAt), costDate: costDate ? new Date(`${costDate}T00:00:00Z`) : null } });

  beforeAll(async () => {
    t = await createTestDatabase('costreport_347');
    [A, B] = await seedSampleStores(t.prisma);
    await cost(A, 'SMS', 'messages', 35, '2026-10-30T20:00:00Z'); // 31 Oct 02:00 in Dhaka
    await cost(A, 'SMS', 'messages', 70, '2026-10-05T06:00:00Z');
    await cost(A, 'books.costLine', 'books', 500, '2026-11-01T04:00:00Z', '2026-10-28'); // entered 1 Nov for 28 Oct
    await cost(A, 'books.costLine', 'books', -500, '2026-11-01T05:00:00Z', '2026-10-28'); // its reversal
    await cost(A, 'books.costLine', 'books', 200, '2026-10-28T06:00:00Z', '2026-10-28');
    await cost(A, 'AI', null, 4_000, '2026-11-01T03:00:00Z');
    await cost(A, 'EMAIL', 'messages', 5, '2025-12-31T19:00:00Z'); // 1 Jan 2026 01:00 in Dhaka
    await cost(B, 'SMS', 'messages', 9_999, '2026-10-30T20:00:00Z');
    await cost(B, 'AI', null, 9_999, '2026-11-01T03:00:00Z');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('by day and by service, this store only, business days in Dhaka, a reversal nets out', async () => {
    const r = await costReport(t.prisma, A, { from: '2026-10-01', to: '2026-10-31', by: 'day', group: 'service' }, TZ);
    expect(r.total).toEqual({ minor: 305, count: 5 });
    expect(r.groups).toEqual([
      { key: 'books.costLine', minor: 200, count: 3 },
      { key: 'SMS', minor: 105, count: 2 },
    ]);
    expect(r.buckets.map((b) => [b.bucket, b.minor, b.count])).toEqual([
      ['2026-10-31', 35, 1],
      ['2026-10-28', 200, 3],
      ['2026-10-05', 70, 1],
    ]);
  });

  it('by month and year, by module (no module is "")', async () => {
    const m = await costReport(t.prisma, A, { from: '2026-01-01', to: '2026-11-01', by: 'month', group: 'module' }, TZ);
    expect(m.buckets.map((b) => b.bucket)).toEqual(['2026-11', '2026-10', '2026-01']);
    expect(m.buckets[0]!.parts).toEqual([{ key: '', minor: 4_000, count: 1 }]);
    expect(m.groups).toEqual([
      { key: '', minor: 4_000, count: 1 },
      { key: 'books', minor: 200, count: 3 },
      { key: 'messages', minor: 110, count: 3 },
    ]);
    const y = await costReport(t.prisma, A, { from: '2025-01-01', to: '2026-11-01', by: 'year', group: 'service' }, TZ);
    expect(y.buckets.map((b) => [b.bucket, b.minor])).toEqual([['2026', 4_310]]);
    const none = await costReport(t.prisma, A, { from: '2025-12-31', to: '2025-12-31', by: 'day', group: 'service' }, TZ);
    expect(none).toMatchObject({ total: { minor: 0, count: 0 }, groups: [], buckets: [] });
  });

  it('AI this month against the cap; no cap set is no cap, never 0', async () => {
    const now = new Date('2026-11-01T06:00:00Z');
    expect(await aiAgainstCap(t.prisma, A, TZ, null, now)).toEqual({ month: '2026-11', spentMinor: 4_000, capMinor: null, usedPct: null, over: false });
    expect(await aiAgainstCap(t.prisma, A, TZ, 0, now)).toMatchObject({ capMinor: null, over: false });
    expect(await aiAgainstCap(t.prisma, A, TZ, 10_000, now)).toEqual({ month: '2026-11', spentMinor: 4_000, capMinor: 10_000, usedPct: 40, over: false });
    expect(await aiAgainstCap(t.prisma, A, TZ, 3_000, now)).toMatchObject({ usedPct: 133, over: true });
  });
});
