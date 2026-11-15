// PR 724 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the rich sample world (screenshots and the
// comparison with the admin prototype) is big, deterministic, fast, flagged as practice, and only ever made on the sample
// store: on any other store the "rich" ask is ignored and the ordinary practice data is made.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB, createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { seedPractice } from './seed';
import { RICH } from './data';

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
    expect(await db.order.count({ where: { storeId: sample, isPractice: true } })).toBeGreaterThanOrEqual(800);
    expect(await db.order.count({ where: { storeId: sample, isPractice: false, number: { startsWith: 'P-' } } })).toBe(0);
    expect(await db.product.count({ where: { storeId: sample, isPractice: true } })).toBeGreaterThanOrEqual(72);
    expect(await db.customer.count({ where: { storeId: sample, isPractice: true } })).toBe(RICH.customers);
    expect(await db.courierClaim.count({ where: { storeId: sample, isPractice: true } })).toBe(RICH.claims);
    expect(await db.courierSettlement.count({ where: { storeId: sample, isPractice: true } })).toBeGreaterThan(20);
    expect(await db.adSpendDaily.count({ where: { storeId: sample } })).toBe(r.counts.adSpendRows);
    expect(r.counts.adSpendRows).toBeGreaterThan(RICH.adDays * 4); // 5 campaigns over RICH.adDays days (900 rows)
    expect(await db.review.count({ where: { storeId: sample, status: 'APPROVED' } })).toBeGreaterThan(100);
    // every status of the plan is there
    const statuses = await db.order.groupBy({ by: ['status'], where: { storeId: sample, isPractice: true } });
    expect(statuses.length).toBeGreaterThanOrEqual(10);
  }, 180_000);

  it('a second run changes nothing', async () => {
    const before = await t.prisma.order.count({ where: { storeId: sample } });
    const r = await seedPractice(t.prisma, sample, NOW, { rich: true });
    expect(r.seeded).toBe(false);
    expect(await t.prisma.order.count({ where: { storeId: sample } })).toBe(before);
  });

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
