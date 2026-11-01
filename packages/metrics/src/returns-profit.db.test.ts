// S16 · PR 353 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): pieces of a delivered order that came back
// after receipt come off its profit — their value (each line's share of the goods after the order discount) off Sales,
// the cost of a sellable piece (or a not-sellable one with its loss booked) back off the product cost, the booked loss
// as the return loss — on the order, on Profit & loss (net delivered sales; the loss row no longer among the other
// costs) and on the profit by group (the total still matches). A return not received yet, an exchange's old piece and a
// piece not checked yet (its cost stays) never undo more than they should. Another store is never read. Values made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { profitByGroup } from './group-profit';
import { orderProfits, type ProfitInputs } from './order-profit';
import { profitAndLoss } from './pnl';

const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));
const base: ProfitInputs = { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: 0, gatewayFee: () => 0, ads: { allocate: false, basis: 'month' } };
const days = { from: '2026-10-01', to: '2026-10-31' };

describe.skipIf(!HAS_TEST_DB)('PR 353 · returns in the profit on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  let back = '';
  let kept = '';
  const item: Record<string, string> = {};

  async function order(storeId: number, discount: number, lines: { sku: string; qty: number; total: number; cost: number }[]) {
    n += 1;
    const sub = lines.reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: { storeId, number: `R353-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: at(9), deliveredAt: at(10), subtotalMinor: sub, discountMinor: discount, deliveryChargeMinor: 0, totalMinor: sub - discount, paymentMethod: 'COD', idempotencyKey: `r353-${n}` },
    });
    for (const l of lines) {
      const i = await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, sku: l.sku, productName: `Sample ${l.sku}`, quantity: l.qty, unitPriceMinor: l.total / l.qty, lineTotalMinor: l.total, unitCostMinor: l.cost } });
      item[`${n}:${l.sku}`] = i.id;
    }
    return row.id;
  }
  async function returned(storeId: number, orderId: string, kind: 'RETURNED' | 'DEFECT_RETURN' | 'EXCHANGE_PICKUP', received: boolean, orderItemId: string, x: { disposition?: 'SELLABLE' | 'UNSELLABLE'; loss?: number } = {}) {
    const r = await t.prisma.returnRecord.create({ data: { storeId, orderId, kind, status: received ? 'QC_DONE' : 'EXPECTED', receivedAt: received ? at(14) : null } });
    const ri = await t.prisma.returnItem.create({ data: { storeId, returnId: r.id, orderItemId, quantity: 1, disposition: x.disposition ?? null } });
    if (x.loss !== undefined) {
      const ce = await t.prisma.costEntry.create({ data: { storeId, service: 'RETURN_LOSS', module: 'returns', amountMinor: x.loss, currency: 'BDT', refType: 'ReturnItem', refId: ri.id, source: 'qc', occurredAt: at(14) } });
      await t.prisma.returnItem.update({ where: { id: ri.id }, data: { lossCostEntryId: ce.id, dispositionState: 'LOSS_RECORDED' } });
    }
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-returns-profit');
    [S, O] = await seedSampleStores(t.prisma);
    // goods 225,000 after a 25,000 order discount: the polo line's share 180,000 (90,000 a piece), the tee's 45,000
    back = await order(S, 25_000, [
      { sku: 'POLO-M', qty: 2, total: 200_000, cost: 60_000 },
      { sku: 'TEE-M', qty: 1, total: 50_000, cost: 20_000 },
    ]);
    const polo = item['1:POLO-M']!;
    const tee = item['1:TEE-M']!;
    await returned(S, back, 'RETURNED', true, polo, { disposition: 'SELLABLE' }); // back to stock: value off, cost back
    await returned(S, back, 'RETURNED', true, polo); // received, not checked yet: value off, its cost stays
    await returned(S, back, 'RETURNED', false, polo); // on its way: nothing yet
    await returned(S, back, 'EXCHANGE_PICKUP', true, polo, { disposition: 'SELLABLE' }); // an exchange: the new piece replaces it
    await returned(S, back, 'DEFECT_RETURN', true, tee, { disposition: 'UNSELLABLE', loss: 20_000 }); // a loss, at its cost
    kept = await order(S, 0, [{ sku: 'POLO-L', qty: 1, total: 100_000, cost: 60_000 }]);
    const other = await order(O, 0, [{ sku: 'POLO-M', qty: 1, total: 90_000, cost: 1 }]);
    await returned(O, other, 'RETURNED', true, item['3:POLO-M']!, { disposition: 'SELLABLE' });
  });
  afterAll(async () => t?.drop());

  it('the order: goods that came back off Sales, the cost of the sellable and written-off pieces back, the loss shown', async () => {
    const m = await orderProfits(t.prisma, S, [back, kept], base);
    const r = m.get(back)!;
    expect(r.parts.sales.minor).toBe(225_000);
    expect(r.parts.returns).toEqual({ minor: 180_000 + 45_000, state: 'known' });
    expect(r.parts.productCost.minor).toBe(140_000 - 60_000 - 20_000);
    expect(r.parts.returnLoss).toEqual({ minor: 20_000, state: 'known' });
    expect(r.returned).toEqual([
      { orderItemId: item['1:POLO-M'], sku: 'POLO-M', pieces: 2, valueMinor: 180_000, costBackMinor: 60_000, lossMinor: 0 },
      { orderItemId: item['1:TEE-M'], sku: 'TEE-M', pieces: 1, valueMinor: 45_000, costBackMinor: 20_000, lossMinor: 20_000 },
    ]);
    expect(r.profitMinor).toBe(225_000 - 225_000 - 60_000 - 20_000);
    const k = m.get(kept)!;
    expect(k.parts.returns.minor).toBe(0);
    expect(k.returned).toEqual([]);
    expect(k.profitMinor).toBe(40_000);
  });

  it('Profit & loss: net delivered sales, gross and contribution with the returns; the loss row is not counted twice', async () => {
    const p = await profitAndLoss(t.prisma, S, days, { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: 0, gatewayFee: () => 0 });
    expect(p.parts).toMatchObject({ sales: 325_000, returns: 225_000, productCost: 120_000, returnLoss: 20_000 });
    expect(p.netSalesMinor).toBe(100_000);
    expect(p.grossProfitMinor).toBe(100_000 - 120_000);
    expect(p.contributionMinor).toBe(-20_000 - 20_000);
    expect(p.otherCosts).toEqual([]);
    expect(p.byDay[0]).toMatchObject({ grossProfitMinor: -20_000, contributionMinor: -40_000 });
  });

  it('profit by group: the returns sit on their lines and the total still matches Profit & loss', async () => {
    const g = await profitByGroup(t.prisma, S, days, 'category', base);
    expect(g.total).toMatchObject({ salesMinor: 325_000, returnsMinor: 225_000, productCostMinor: 120_000, grossProfitMinor: -20_000, orderCostsMinor: -20_000, profitMinor: -40_000 });
  });
});
