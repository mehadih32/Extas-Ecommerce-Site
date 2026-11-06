// S12 · PR 592 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the orders credited to a house ad click,
// by place — Ordered value from every placed order on its placed day, Sales only from delivered orders on their
// delivered day; another store's, archived and draft orders are never read. Made-up values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { kpiByHouseAdPlace } from './metrics';
import { daysPeriod } from './pure';

const TZ = 'Asia/Dhaka';
const AD = randomUUID();
const P1 = randomUUID();
const P2 = randomUUID();

describe.skipIf(!HAS_TEST_DB)('PR 592 · orders credited to a house ad place on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(o: { total: number; status?: 'DELIVERED' | 'PLACED' | 'DRAFT'; store?: number; archived?: boolean; place: string | null }) {
    n += 1;
    const storeId = o.store ?? S;
    const status = o.status ?? 'DELIVERED';
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `L592-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date('2026-10-05T04:00:00Z'),
        deliveredAt: status === 'DELIVERED' ? new Date('2026-10-08T06:00:00Z') : null,
        archivedAt: o.archived ? new Date() : null,
        subtotalMinor: o.total,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: o.total,
        paymentMethod: 'COD',
        idempotencyKey: `l592-${n}`,
      },
    });
    if (o.place) await t.prisma.houseAdOrderClick.create({ data: { storeId, orderId: row.id, adId: AD, placementId: o.place, slot: 'inline', clickedAt: new Date('2026-10-04T10:00:00Z') } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-house-ads');
    [S, O] = await seedSampleStores(t.prisma);
    await order({ total: 100_000, place: P1 });
    await order({ total: 50_000, status: 'PLACED', place: P1 });
    await order({ total: 20_000, place: P2 });
    await order({ total: 70_000, place: null });
    await order({ total: 90_000, status: 'DRAFT', place: P1 });
    await order({ total: 30_000, archived: true, place: P1 });
    await order({ total: 40_000, store: O, place: P1 });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('each place: Ordered value of the placed orders credited to it, Sales of the delivered ones', async () => {
    const rows = await kpiByHouseAdPlace(t.prisma, S, daysPeriod('2026-10-01', '2026-10-31', TZ));
    expect(rows).toHaveLength(2);
    const one = rows.find((r) => r.key === P1)!;
    expect(one.ordered).toMatchObject({ orders: 2, valueMinor: 150_000 });
    expect(one.sales).toMatchObject({ orders: 1, valueMinor: 100_000 });
    expect(rows.find((r) => r.key === P2)!.sales).toMatchObject({ orders: 1, valueMinor: 20_000 });
  });

  it('an order credited to a click is written once: the database refuses a change or a second credit', async () => {
    const row = await t.prisma.houseAdOrderClick.findFirstOrThrow({ where: { storeId: S, placementId: P2 } });
    await expect(t.prisma.houseAdOrderClick.update({ where: { id: row.id }, data: { slot: 'end' } })).rejects.toThrow();
    await expect(t.prisma.houseAdOrderClick.create({ data: { storeId: S, orderId: row.orderId, adId: AD, placementId: P1, slot: 'end', clickedAt: new Date() } })).rejects.toThrow();
  });
});
