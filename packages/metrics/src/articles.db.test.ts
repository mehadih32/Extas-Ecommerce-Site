// S12 · PR 250 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the orders that read a journal article —
// Sales only from delivered orders on their delivered day, Ordered value from every placed order on its placed day;
// an order that read two articles is in both article rows but once in the total; another store's, archived and draft
// orders are never read. Made-up values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { kpiByArticle, kpiFromArticles } from './metrics';
import { daysPeriod } from './pure';

const TZ = 'Asia/Dhaka';
const A = randomUUID();
const B = randomUUID();

describe.skipIf(!HAS_TEST_DB)('PR 250 · orders that read an article on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(o: { total: number; status?: 'DELIVERED' | 'PLACED' | 'DRAFT'; store?: number; archived?: boolean; reads: string[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const status = o.status ?? 'DELIVERED';
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `L250-${n}`,
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
        idempotencyKey: `l250-${n}`,
      },
    });
    for (const postId of o.reads) await t.prisma.blogOrderRead.create({ data: { storeId, orderId: row.id, postId, readAt: new Date('2026-10-04T10:00:00Z') } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-articles');
    [S, O] = await seedSampleStores(t.prisma);
    await order({ total: 100_000, reads: [A, B] });
    await order({ total: 50_000, status: 'PLACED', reads: [A] });
    await order({ total: 70_000, reads: [] });
    await order({ total: 90_000, status: 'DRAFT', reads: [A] });
    await order({ total: 30_000, archived: true, reads: [A] });
    await order({ total: 40_000, store: O, reads: [A] });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('each article: Ordered value of the placed orders that read it, Sales of the delivered ones', async () => {
    const rows = await kpiByArticle(t.prisma, S, daysPeriod('2026-10-01', '2026-10-31', TZ));
    const a = rows.find((r) => r.key === A)!;
    const b = rows.find((r) => r.key === B)!;
    expect(a.ordered).toMatchObject({ orders: 2, valueMinor: 150_000 });
    expect(a.sales).toMatchObject({ orders: 1, valueMinor: 100_000 });
    expect(b.ordered).toMatchObject({ orders: 1, valueMinor: 100_000 });
    expect(b.sales).toMatchObject({ orders: 1, valueMinor: 100_000 });
    expect(rows).toHaveLength(2);
  });

  it('the total counts an order that read two articles once, and only orders that read one', async () => {
    const k = await kpiFromArticles(t.prisma, S, daysPeriod('2026-10-01', '2026-10-31', TZ));
    expect(k.ordered).toMatchObject({ orders: 2, valueMinor: 150_000 });
    expect(k.sales).toMatchObject({ orders: 1, valueMinor: 100_000 });
  });

  it('Sales sits on the delivered day: a period that holds only the placed day has Ordered value and no Sales', async () => {
    const k = await kpiFromArticles(t.prisma, S, daysPeriod('2026-10-05', '2026-10-06', TZ));
    expect(k.ordered.orders).toBe(2);
    expect(k.sales.orders).toBe(0);
  });
});
