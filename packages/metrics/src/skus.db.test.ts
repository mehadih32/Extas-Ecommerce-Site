// PR 620 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// Sales by SKU for the ERP's "Top products" — the one KPI rule (delivered orders, on the day they were delivered, counted
// lines only), pieces, net sales after the line's discount and profit over the cost snapshot; another store's orders
// never count. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { salesBySku } from './skus';

const day = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));

describe.skipIf(!HAS_TEST_DB)('PR 620 · Sales by SKU on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(o: { status: 'DELIVERED' | 'PLACED' | 'RETURNED'; at: Date; store?: number; archived?: boolean; lines: { sku: string; name?: string; qty: number; total: number; cost?: number | null; status?: 'ACTIVE' | 'REMOVED' }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `S620-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: new Date(o.at.getTime() - 86_400_000),
        deliveredAt: o.status === 'DELIVERED' ? o.at : null,
        subtotalMinor: sub,
        totalMinor: sub,
        paymentMethod: 'COD',
        idempotencyKey: `s620-${n}`,
        archivedAt: o.archived ? o.at : null,
      },
    });
    for (const l of o.lines) {
      await t.prisma.orderItem.create({
        data: { storeId, orderId: row.id, sku: l.sku, productName: l.name ?? `Sample ${l.sku}`, quantity: l.qty, unitPriceMinor: Math.round(l.total / l.qty), lineTotalMinor: l.total, unitCostMinor: l.cost === undefined ? 50_000 : l.cost, status: l.status ?? 'ACTIVE' },
      });
    }
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-skus');
    [S, O] = await seedSampleStores(t.prisma);
    await order({ status: 'DELIVERED', at: day(10), lines: [{ sku: 'POLO-M', qty: 2, total: 180_000 }, { sku: 'TEE-M', qty: 1, total: 60_000, cost: 30_000 }] });
    await order({ status: 'DELIVERED', at: day(11), lines: [{ sku: 'POLO-M', name: 'Sample polo (new name)', qty: 1, total: 85_000 }, { sku: 'TEE-M', qty: 1, total: 60_000, cost: null }] });
    // Never counted: a line taken out, an order not delivered, a returned one, an archived one, one outside the days,
    // another store's.
    await order({ status: 'DELIVERED', at: day(11), lines: [{ sku: 'POLO-M', qty: 5, total: 450_000, status: 'REMOVED' }] });
    await order({ status: 'PLACED', at: day(11), lines: [{ sku: 'POLO-M', qty: 5, total: 450_000 }] });
    await order({ status: 'RETURNED', at: day(11), lines: [{ sku: 'POLO-M', qty: 5, total: 450_000 }] });
    await order({ status: 'DELIVERED', at: day(11), archived: true, lines: [{ sku: 'POLO-M', qty: 5, total: 450_000 }] });
    await order({ status: 'DELIVERED', at: day(20), lines: [{ sku: 'POLO-M', qty: 5, total: 450_000 }] });
    await order({ status: 'DELIVERED', at: day(11), store: O, lines: [{ sku: 'POLO-M', qty: 5, total: 450_000 }] });
  });
  afterAll(async () => t?.drop());

  it('best first by net sales; pieces, net sales and profit over the cost snapshot; unknown cost = no profit', async () => {
    const rows = await salesBySku(t.prisma, S, { from: day(1, 0), to: day(15, 0) }, 20);
    expect(rows).toEqual([
      // 2 + 1 pieces, 1800 + 850 taka, cost 3 × 500 → profit 1150 taka; the name is the latest one sold.
      { sku: 'POLO-M', name: 'Sample polo (new name)', pieces: 3, salesMinor: 265_000, costMinor: 150_000, profitMinor: 115_000 },
      // One line has no cost snapshot: the profit is not known (never guessed).
      { sku: 'TEE-M', name: 'Sample TEE-M', pieces: 2, salesMinor: 120_000, costMinor: null, profitMinor: null },
    ]);
  });

  it('the limit, and an empty span', async () => {
    expect((await salesBySku(t.prisma, S, { from: day(1, 0), to: day(15, 0) }, 1)).map((r) => r.sku)).toEqual(['POLO-M']);
    expect(await salesBySku(t.prisma, S, { from: day(12, 0), to: day(15, 0) }, 20)).toEqual([]);
  });

  it("another store's orders are its own", async () => {
    expect(await salesBySku(t.prisma, O, { from: day(1, 0), to: day(15, 0) }, 20)).toEqual([{ sku: 'POLO-M', name: 'Sample POLO-M', pieces: 5, salesMinor: 450_000, costMinor: 250_000, profitMinor: 200_000 }]);
  });
});
