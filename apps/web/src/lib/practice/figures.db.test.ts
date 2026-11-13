// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a practice order counts in Sales and
// Ordered value only while practice mode (`practice.enabled`) is on for its store; off, every figure built on
// `basisWhere` leaves it out. The same switch decides whether a practice customer is in the people list. Sample values.
import { Prisma } from '@extas/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, registry, syncSettings } from '@extas/settings';
import { peopleBaseSql } from '@extas/customers';
import { daysPeriod, kpi } from '@extas/metrics';

describe.skipIf(!HAS_TEST_DB)('practice orders in the figures (PR 706)', () => {
  let t: TestDatabase;
  let S = 0;
  const period = daysPeriod('2026-11-01', '2026-11-30', 'Asia/Dhaka');
  const day = new Date('2026-11-10T06:00:00Z');
  const order = (number: string, total: number, isPractice: boolean) =>
    t.prisma.order.create({
      data: {
        storeId: S,
        number,
        status: 'DELIVERED',
        source: 'WEBSITE',
        currency: 'BDT',
        placedAt: day,
        deliveredAt: day,
        subtotalMinor: total,
        totalMinor: total,
        idempotencyKey: `k-${number}`,
        isPractice,
      },
    });

  beforeAll(async () => {
    t = await createTestDatabase('practicemetrics');
    [S] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await order('EX-1', 100_000, false);
    await order('P-1', 250_000, true);
    await t.prisma.customer.create({
      data: { storeId: S, phone: '+8801700000611', name: 'Real Person' },
    });
    await t.prisma.customer.create({
      data: {
        storeId: S,
        phone: '+8801000000612',
        name: 'Practice Person',
        isPractice: true,
      },
    });
  }, 180_000);
  const people = async () =>
    Number(
      (await t.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`${peopleBaseSql(S, [])} SELECT count(*) AS n FROM base b WHERE b."phone" IN ('+8801700000611', '+8801000000612')`))[0]!
        .n,
    );
  afterAll(async () => t?.drop());

  it('off as shipped: only the real order counts', async () => {
    const k = await kpi(t.prisma, S, period);
    expect(k.sales).toMatchObject({ orders: 1, valueMinor: 100_000 });
    expect(k.ordered).toMatchObject({ orders: 1, valueMinor: 100_000 });
    expect(await people()).toBe(1);
  });

  it('while practice mode is on, the practice order counts like any other', async () => {
    await t.prisma.storeSettingValue.create({
      data: { storeId: S, key: 'practice.enabled', value: { on: true } },
    });
    const k = await kpi(t.prisma, S, period);
    expect(k.sales).toMatchObject({ orders: 2, valueMinor: 350_000 });
    expect(await people()).toBe(2);
  });

  it('switched off again, it is gone from the figures (and nothing was deleted)', async () => {
    await t.prisma.storeSettingValue.updateMany({
      where: { storeId: S, key: 'practice.enabled' },
      data: { value: { on: false } },
    });
    expect((await kpi(t.prisma, S, period)).sales).toMatchObject({
      orders: 1,
      valueMinor: 100_000,
    });
    expect(await people()).toBe(1);
    expect(await t.prisma.order.count({ where: { storeId: S, isPractice: true } })).toBe(1);
  });
});
