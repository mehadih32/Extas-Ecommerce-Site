// PR 724 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the rich sample world (screenshots and the
// comparison with the admin prototype) is big, deterministic, fast, flagged as practice, and only ever made on the sample
// store: on any other store the "rich" ask is ignored and the ordinary practice data is made.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB, createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { seedPractice } from './seed';
import { RICH, RICH_ORDER_TOTAL, RICH_PLAN } from './data';

const NOW = new Date('2026-11-13T08:00:00Z');
const SAMPLE_PACK_KEY = 'sample-catalogue'; // hardcode-ok: the sample seed's marker (packages/seed/src/sample.ts)

describe.skipIf(!HAS_TEST_DB)('rich sample data on PostgreSQL (PR 724)', () => {
  let t: TestDatabase;
  let sample = 0;

  beforeAll(async () => {
    t = await createTestDatabase('practice-rich');
    [sample] = await seedSampleStores(t.prisma);
    const db = t.prisma;
    for (const storeId of [sample]) {
      for (const slug of ['polos', 'tshirts', 'shirts', 'panjabi', 'trousers', 'hoodies']) {
        if (!(await db.category.findFirst({ where: { storeId, slug }, select: { id: true } }))) await db.category.create({ data: { storeId, slug, nameEn: slug } });
      }
      for (const key of ['tee', 'shirt', 'trouser']) {
        if (!(await db.garmentType.findFirst({ where: { storeId, key }, select: { id: true } }))) {
          await db.garmentType.create({ data: { storeId, key, nameEn: key, nameBn: key, measurementFields: [] } });
        }
      }
    }
    await db.defaultPackApplication.create({ data: { storeId: sample, packKey: SAMPLE_PACK_KEY, version: 1, summary: {} } });
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('makes hundreds of orders, the 72 demo products, claims, ad spend and reviews on the sample store, fast, all flagged practice', async () => {
    const started = Date.now();
    const r = await seedPractice(t.prisma, sample, NOW, { rich: true });
    expect(r.seeded).toBe(true);
    expect(Date.now() - started).toBeLessThan(60_000);
    const db = t.prisma;
    // PR 1068: the prototype's own count (All 861) and its status mix
    expect(await db.order.count({ where: { storeId: sample, isPractice: true } })).toBe(RICH_ORDER_TOTAL);
    expect(RICH_ORDER_TOTAL).toBe(861);
    expect(await db.order.count({ where: { storeId: sample, isPractice: true, status: 'RETURNED' } })).toBe(RICH_PLAN.find((p) => p.kind === 'RETURNED')!.count);
    expect(await db.order.count({ where: { storeId: sample, isPractice: true, status: 'CANCELLED' } })).toBe(RICH_PLAN.find((p) => p.kind === 'CANCELLED')!.count);
    expect(await db.order.count({ where: { storeId: sample, isPractice: false, number: { startsWith: 'P-' } } })).toBe(0);
    expect(await db.product.count({ where: { storeId: sample, isPractice: true } })).toBeGreaterThanOrEqual(72);
    expect(await db.customer.count({ where: { storeId: sample, isPractice: true } })).toBe(RICH.customers);
    expect(await db.courierClaim.count({ where: { storeId: sample, isPractice: true } })).toBe(RICH.claims);
    expect(await db.courierSettlement.count({ where: { storeId: sample, isPractice: true } })).toBeGreaterThan(20);
    expect(await db.adSpendDaily.count({ where: { storeId: sample } })).toBe(r.counts.adSpendRows);
    expect(r.counts.adSpendRows).toBeGreaterThan(RICH.adDays * 4); // 6 campaigns over RICH.adDays days (the prototype's 336 rows)
    expect(await db.review.count({ where: { storeId: sample, status: 'APPROVED' } })).toBeGreaterThan(40);
    // every status of the plan is there
    const statuses = await db.order.groupBy({ by: ['status'], where: { storeId: sample, isPractice: true } });
    expect(statuses.length).toBeGreaterThanOrEqual(8);
  }, 180_000);

  it('a second run changes nothing', async () => {
    const before = await t.prisma.order.count({ where: { storeId: sample } });
    const r = await seedPractice(t.prisma, sample, NOW, { rich: true });
    expect(r.seeded).toBe(false);
    expect(await t.prisma.order.count({ where: { storeId: sample } })).toBe(before);
  });

  // PR 880: the live seed command asks for the big set on the owner's own store, after the small set may already be there
  it('richAnywhere tops a small practice set up to the big one, adds no ad spend, changes no older order, and a second run changes nothing', async () => {
    const t3 = await createTestDatabase('practice-rich-live');
    try {
      const [live] = await seedSampleStores(t3.prisma);
      const db = t3.prisma;
      const small = await seedPractice(db, live, NOW);
      expect(small.seeded).toBe(true);
      const firstIds = (await db.order.findMany({ where: { storeId: live, isPractice: true }, select: { id: true, totalMinor: true }, orderBy: { id: 'asc' } })).slice(0, 20);
      const itemsBefore = await db.orderItem.count({ where: { orderId: { in: firstIds.map((o) => o.id) } } });
      const ignored = await seedPractice(db, live, NOW, { rich: true });
      expect(ignored.seeded).toBe(false); // without richAnywhere the ask is ignored on a store that is not the sample store
      const r = await seedPractice(db, live, NOW, { rich: true, richAnywhere: true });
      expect(r.seeded).toBe(true);
      expect(await db.order.count({ where: { storeId: live, isPractice: true } })).toBeGreaterThanOrEqual(800);
      expect(await db.order.count({ where: { storeId: live, isPractice: false } })).toBe(0);
      expect(await db.customer.count({ where: { storeId: live, isPractice: true } })).toBe(RICH.customers);
      expect(await db.adSpendDaily.count({ where: { storeId: live } })).toBe(0);
      expect(await db.adAccount.count({ where: { storeId: live } })).toBe(0);
      // the older orders keep their own lines and totals
      const again = await db.order.findMany({ where: { id: { in: firstIds.map((o) => o.id) } }, select: { id: true, totalMinor: true }, orderBy: { id: 'asc' } });
      expect(again).toEqual(firstIds);
      expect(await db.orderItem.count({ where: { orderId: { in: firstIds.map((o) => o.id) } } })).toBe(itemsBefore);
      // every customer's order count matches the orders he has
      const grouped = await db.order.groupBy({ by: ['customerId'], where: { storeId: live, isPractice: true }, _count: { _all: true } });
      for (const g of grouped) expect((await db.customer.findUnique({ where: { id: g.customerId! }, select: { orderCount: true } }))!.orderCount).toBe(g._count._all);
      const before = { orders: await db.order.count({ where: { storeId: live } }), claims: await db.courierClaim.count({ where: { storeId: live } }), payouts: await db.courierSettlement.count({ where: { storeId: live } }) };
      const second = await seedPractice(db, live, NOW, { rich: true, richAnywhere: true });
      expect(second.seeded).toBe(false);
      expect({ orders: await db.order.count({ where: { storeId: live } }), claims: await db.courierClaim.count({ where: { storeId: live } }), payouts: await db.courierSettlement.count({ where: { storeId: live } }) }).toEqual(before);
    } finally {
      await t3.drop();
    }
  }, 240_000);

  it('on a store that is not the sample store, "rich" is ignored', async () => {
    // its own database: the practice ids are made from the record's key alone, so two stores in one database would share them
    const t2 = await createTestDatabase('practice-rich-other');
    try {
      const [plain] = await seedSampleStores(t2.prisma);
      const r = await seedPractice(t2.prisma, plain, NOW, { rich: true });
      expect(r.seeded).toBe(true);
      expect(r.counts.orders).toBeLessThan(150);
      expect(r.counts.adSpendRows).toBeUndefined();
    } finally {
      await t2.drop();
    }
  }, 120_000);
});
