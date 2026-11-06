// S12 · PR 253 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): what the articles sold — per article and
// product the counted lines of the orders that read it: Ordered value from placed orders, Sales only from delivered
// ones; a removed line, another store's order, a draft and an order that read nothing never counted. Made-up values.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { linesByArticle } from './metrics';
import { daysPeriod } from './pure';

const TZ = 'Asia/Dhaka';
const A = randomUUID();
const B = randomUUID();
const P1 = randomUUID();
const P2 = randomUUID();

describe.skipIf(!HAS_TEST_DB)('PR 253 · what the articles sold on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(o: { status?: 'DELIVERED' | 'PLACED' | 'DRAFT'; store?: number; reads: string[]; lines: { p: string; q: number; each: number; removed?: boolean }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const status = o.status ?? 'DELIVERED';
    const total = o.lines.reduce((s, l) => s + (l.removed ? 0 : l.q * l.each), 0);
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `L253-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date('2026-10-05T04:00:00Z'),
        deliveredAt: status === 'DELIVERED' ? new Date('2026-10-08T06:00:00Z') : null,
        subtotalMinor: total,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: total,
        paymentMethod: 'COD',
        idempotencyKey: `l253-${n}`,
      },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, productId: l.p, sku: `SKU-${l.p.slice(0, 4)}`, productName: 'Sample polo', quantity: l.q, unitPriceMinor: l.each, lineTotalMinor: l.q * l.each, ...(l.removed ? { status: 'REMOVED' } : {}) } });
    for (const postId of o.reads) await t.prisma.blogOrderRead.create({ data: { storeId, orderId: row.id, postId, readAt: new Date('2026-10-04T10:00:00Z') } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-article-lines');
    [S, O] = await seedSampleStores(t.prisma);
    await order({ reads: [A, B], lines: [{ p: P1, q: 2, each: 150_000 }, { p: P2, q: 1, each: 90_000, removed: true }] });
    await order({ status: 'PLACED', reads: [A], lines: [{ p: P1, q: 1, each: 150_000 }, { p: P2, q: 1, each: 90_000 }] });
    await order({ reads: [], lines: [{ p: P1, q: 5, each: 150_000 }] });
    await order({ status: 'DRAFT', reads: [A], lines: [{ p: P1, q: 9, each: 150_000 }] });
    await order({ store: O, reads: [A], lines: [{ p: P1, q: 7, each: 150_000 }] });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('each article and product: pieces, value and orders, placed beside delivered', async () => {
    const rows = await linesByArticle(t.prisma, S, daysPeriod('2026-10-01', '2026-10-31', TZ));
    const of = (post: string, p: string) => rows.find((r) => r.postId === post && r.productId === p);
    expect(of(A, P1)).toMatchObject({ ordered: { pieces: 3, valueMinor: 450_000, orders: 2 }, sales: { pieces: 2, valueMinor: 300_000, orders: 1 } });
    expect(of(A, P2)).toMatchObject({ ordered: { pieces: 1, valueMinor: 90_000, orders: 1 }, sales: { pieces: 0, valueMinor: 0, orders: 0 } });
    expect(of(B, P1)).toMatchObject({ ordered: { pieces: 2, orders: 1 }, sales: { pieces: 2, orders: 1 } });
    expect(of(B, P2)).toBeUndefined();
    expect(rows).toHaveLength(3);
  });

  it('a period with only the placed day has the pieces ordered and nothing delivered', async () => {
    const rows = await linesByArticle(t.prisma, S, daysPeriod('2026-10-05', '2026-10-06', TZ));
    expect(rows.every((r) => r.sales.pieces === 0)).toBe(true);
    expect(rows.find((r) => r.postId === A && r.productId === P1)?.ordered.pieces).toBe(3);
  });
});
