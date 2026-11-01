// S16 · PR 349 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a period's profit and loss from the
// per-order profit — Sales over every delivered order with Ordered value beside it; an order without a cost left out of
// the profit lines and listed; parts not known counted; ad spend of the period's days; the other cost rows of the period
// without the messages of a delivered order (counted inside its contribution); day by day; another store never read.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { profitAndLoss, type PnlInputs } from './pnl';

const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));
const inputs: PnlInputs = { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: null, gatewayFee: () => null };

describe.skipIf(!HAS_TEST_DB)('PR 349 · profit and loss on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(o: { status: 'DELIVERED' | 'CONFIRMED'; at: Date; store?: number; delivery?: number; lines: { sku: string; total: number; cost: number | null }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: { storeId, number: `L349-${n}`, source: 'WEBSITE', currency: 'BDT', status: o.status, placedAt: o.at, deliveredAt: o.status === 'DELIVERED' ? o.at : null, subtotalMinor: sub, deliveryChargeMinor: o.delivery ?? 0, totalMinor: sub + (o.delivery ?? 0), paymentMethod: 'COD', idempotencyKey: `l349-${n}` },
    });
    for (const l of o.lines) await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, sku: l.sku, productName: `Sample ${l.sku}`, quantity: 1, unitPriceMinor: l.total, lineTotalMinor: l.total, unitCostMinor: l.cost } });
    return row.id;
  }
  const sms = async (orderId: string | null, amount: number, when: Date) => {
    const log = await t.prisma.notificationLog.create({ data: { storeId: S, orderId, channel: 'SMS', recipient: '01700000000', dedupeKey: `l349-n-${(n += 1)}` } });
    await t.prisma.costEntry.create({ data: { storeId: S, service: 'SMS', module: 'messages', amountMinor: amount, currency: 'BDT', refType: 'notification', refId: log.id, source: 'system', occurredAt: when } });
  };

  beforeAll(async () => {
    t = await createTestDatabase('metrics-pnl');
    [S, O] = await seedSampleStores(t.prisma);
    const a = await order({ status: 'DELIVERED', at: at(10), delivery: 6_000, lines: [{ sku: 'POLO-M', total: 100_000, cost: 60_000 }] });
    await order({ status: 'DELIVERED', at: at(11), lines: [{ sku: 'POLO-L', total: 80_000, cost: 50_000 }] });
    await order({ status: 'DELIVERED', at: at(11), lines: [{ sku: 'CAP-1', total: 20_000, cost: null }] });
    const open = await order({ status: 'CONFIRMED', at: at(12), lines: [{ sku: 'POLO-M', total: 100_000, cost: 60_000 }] });
    await order({ status: 'DELIVERED', at: at(11), store: O, lines: [{ sku: 'POLO-M', total: 999_000, cost: 1 }] });
    await sms(a, 35, at(9)); // inside order a's contribution
    await sms(open, 40, at(12)); // an order not delivered: an other cost of its day
    await sms(null, 50, at(12)); // a message about no order
    await t.prisma.costEntry.create({ data: { storeId: S, service: 'books.costLine', module: 'books', amountMinor: 7_000, currency: 'BDT', source: 'manual', occurredAt: at(20), costDate: new Date('2026-10-12T00:00:00Z') } });
    await t.prisma.costEntry.create({ data: { storeId: S, service: 'books.costLine', module: 'books', amountMinor: 9_999, currency: 'BDT', source: 'manual', occurredAt: at(12), costDate: new Date('2026-11-02T00:00:00Z') } });
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-349', name: 'Sample ads', currency: 'BDT' } });
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, date: new Date('2026-10-10T00:00:00Z'), platform: 'META', spendMinor: 15_000, currency: 'BDT' } });
  });
  afterAll(async () => t?.drop());

  it('the month: sales beside ordered value, gross profit and contribution of costed orders, the uncosted listed', async () => {
    const p = await profitAndLoss(t.prisma, S, { from: '2026-10-01', to: '2026-10-31' }, inputs);
    expect(p.orders).toBe(3);
    expect(p.costedOrders).toBe(2);
    expect(p.salesMinor).toBe(200_000);
    expect(p.orderedMinor).toBe(306_000);
    expect(p.uncosted).toEqual({ orders: 1, salesMinor: 20_000, skus: ['CAP-1'] });
    expect(p.parts).toMatchObject({ sales: 180_000, productCost: 110_000, deliveryCharge: 6_000, messages: 35, courier: 0 });
    expect(p.grossProfitMinor).toBe(70_000);
    expect(p.contributionMinor).toBe(70_000 + 6_000 - 35);
    expect(p.missing).toEqual({ courier: 0, codFee: 0, paymentFees: 0, packaging: 2 });
    expect(p.adsMinor).toBe(15_000);
    expect(p.adsImported).toBe(true);
    expect(p.otherCosts).toEqual([
      { key: 'books.costLine', minor: 7_000 },
      { key: 'SMS', minor: 90 },
    ]);
    expect(p.otherCostsMinor).toBe(7_090);
    expect(p.byDay).toEqual([
      { day: '2026-10-11', orders: 2, salesMinor: 80_000, grossProfitMinor: 30_000, contributionMinor: 30_000 },
      { day: '2026-10-10', orders: 1, salesMinor: 100_000, grossProfitMinor: 40_000, contributionMinor: 45_965 },
    ]);
  });

  it('a period with nothing: zeros, no ads imported', async () => {
    const p = await profitAndLoss(t.prisma, S, { from: '2026-09-01', to: '2026-09-30' }, inputs);
    expect(p).toMatchObject({ orders: 0, salesMinor: 0, grossProfitMinor: 0, contributionMinor: 0, adsMinor: 0, adsImported: false, otherCostsMinor: 0, byDay: [] });
  });
});
