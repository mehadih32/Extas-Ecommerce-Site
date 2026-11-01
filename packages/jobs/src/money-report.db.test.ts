// S16 · PR 351 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the money report to the owner — off as
// shipped plans nothing; on, a store is planned only from its time to the end of its day, with the period in the run key
// (one run per period however often the worker looks); the run sends the day's Profit & loss (Sales of delivered orders
// with Ordered value beside it) to the owner's Telegram once; switched off before the run, nothing goes; no Telegram, no
// send. Through the catalogue. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { InventoryDeps, SettingsReader } from '@extas/inventory';
import { registry, type Key, type MoneyReportSettings, type Value } from '@extas/settings';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { MONEY_REPORT_JOB, moneyReportPlanner } from './money-report';

const dhaka = (hm: string) => new Date(`2026-11-07T${hm}:00+06:00`);

describe.skipIf(!HAS_TEST_DB)('PR 351 · the money report to the owner on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let report: MoneyReportSettings = { ...registry['money.report'].default };
  const sent: string[] = [];
  const settings: SettingsReader = {
    value: async <K extends Key>(k: K) => (k === 'money.report' ? report : k === 'store.timeZone' ? 'Asia/Dhaka' : registry[k].default) as Value<K>,
  };
  const telegram = { use: async <Api>() => ({ api: { send: async (text: string) => (sent.push(text), { ok: true }) } as Api, mode: 'LIVE' }) };
  const deps = (now: Date, withTelegram = true): JobDeps => ({ db: t.prisma, settings, inventory: {} as InventoryDeps, now: () => now, ...(withTelegram ? { owner: { telegram } } : {}) });

  beforeAll(async () => {
    t = await createTestDatabase('jobs-money-report');
    [S] = await seedSampleStores(t.prisma);
    const order = (n: number, status: 'DELIVERED' | 'CONFIRMED', total: number, cost: number | null) =>
      t.prisma.order.create({
        data: {
          storeId: S,
          number: `L351-${n}`,
          source: 'WEBSITE',
          currency: 'BDT',
          status,
          placedAt: dhaka('10:00'),
          deliveredAt: status === 'DELIVERED' ? dhaka('15:00') : null,
          subtotalMinor: total,
          totalMinor: total,
          paymentMethod: 'COD',
          idempotencyKey: `l351-${n}`,
          items: { create: [{ storeId: S, sku: `L351-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: total, lineTotalMinor: total, unitCostMinor: cost }] },
        },
      });
    await order(1, 'DELIVERED', 150_000, 90_000);
    await order(2, 'CONFIRMED', 80_000, 50_000);
  });
  afterAll(async () => t?.drop());

  it('off as shipped plans nothing; on, only from the time set, one key per day', async () => {
    expect(await moneyReportPlanner(deps(dhaka('22:30')), dhaka('22:30'))).toEqual([]);
    report = { ...report, enabled: true };
    expect(await moneyReportPlanner(deps(dhaka('21:59')), dhaka('21:59'))).toEqual([]);
    const a = await moneyReportPlanner(deps(dhaka('22:00')), dhaka('22:00'));
    const b = await moneyReportPlanner(deps(dhaka('23:45')), dhaka('23:45'));
    const mine = (x: typeof a) => x.filter((j) => j.payload.storeId === S);
    expect(mine(a)).toHaveLength(1);
    expect(mine(a)[0]).toMatchObject({ name: MONEY_REPORT_JOB, queue: 'reports', payload: { storeId: S, period: 'D:2026-11-07' } });
    expect(mine(b)[0]!.key).toBe(mine(a)[0]!.key);
  });

  it("sends the day's Profit & loss to the owner's Telegram; delivered Sales first, Ordered value beside it", async () => {
    const job = jobDefinition(MONEY_REPORT_JOB)!;
    const out = await job.run(deps(dhaka('22:10')), job.parse({ storeId: S, period: 'D:2026-11-07' }));
    expect(out).toEqual({ ok: true, stats: { sent: true, mode: 'LIVE' } });
    expect(sent).toHaveLength(1);
    const lines = sent[0]!.split('\n');
    expect(lines[0]).toBe('টাকার রিপোর্ট · 2026-11-07');
    expect(lines[1]).toBe('বিক্রি (ডেলিভারি হওয়া): 1,500 BDT · 1টা অর্ডার');
    expect(lines[2]).toBe('অর্ডারের মূল্য: 2,300 BDT');
    expect(lines[3]).toBe('মোট লাভ: 600 BDT');
  });

  it('a period no longer due, a switch turned off or no Telegram sends nothing; a bad payload is refused', async () => {
    const job = jobDefinition(MONEY_REPORT_JOB)!;
    const before = sent.length;
    expect((await job.run(deps(dhaka('22:10')), { storeId: S, period: 'D:2026-11-06' })).stats).toEqual({ sent: false, reason: 'not-due' });
    expect((await job.run(deps(dhaka('22:10'), false), { storeId: S, period: 'D:2026-11-07' })).stats).toEqual({ sent: false, reason: 'no-telegram' });
    report = { ...report, enabled: false };
    expect((await job.run(deps(dhaka('22:10')), { storeId: S, period: 'D:2026-11-07' })).stats).toEqual({ sent: false, reason: 'not-due' });
    expect(sent.length).toBe(before);
    expect(() => job.parse({ storeId: S, period: '2026-11-07' })).toThrow();
    expect(() => job.parse({ storeId: 0, period: 'D:2026-11-07' })).toThrow();
  });
});
