// S16 · PR 348 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): one delivered order's profit after its
// own costs — goods after discounts plus the delivery charge, less the cost snapshots, the real parcel's charge (a mock
// parcel and an exchange leg are not its cost), the owner's gateway fee on a paid bKash payment (COD has none), the
// packaging figure, its paid messages and the ad spend spread over the month's delivered orders. Unknowns stay unknown
// and are named: a line without a cost (no profit at all), a provider without a fee figure, packaging not entered, a
// real parcel without a charge, ads with an account but nothing imported. Not delivered = no profit. Another store's
// order is never read. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { orderProfits, type ProfitInputs } from './order-profit';

const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));
const base: ProfitInputs = {
  currency: 'BDT',
  timeZone: 'Asia/Dhaka',
  packagingMinor: 3_000,
  gatewayFee: (amount, provider) => (provider === 'bkash' ? Math.round((amount * 185) / 10_000) : null),
  ads: { allocate: true, basis: 'month' },
};

describe.skipIf(!HAS_TEST_DB)('PR 348 · per-order profit on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  let courier = '';
  const ids: Record<string, string> = {};

  async function order(key: string, o: { status: 'DELIVERED' | 'CONFIRMED'; at: Date; store?: number; discount?: number; delivery?: number; lines: { sku: string; qty: number; total: number; cost?: number | null }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `P348-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: new Date(o.at.getTime() - 86_400_000),
        deliveredAt: o.status === 'DELIVERED' ? o.at : null,
        subtotalMinor: sub,
        discountMinor: o.discount ?? 0,
        deliveryChargeMinor: o.delivery ?? 0,
        totalMinor: sub - (o.discount ?? 0) + (o.delivery ?? 0),
        paymentMethod: 'COD',
        idempotencyKey: `p348-${n}`,
      },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, sku: l.sku, productName: `Sample ${l.sku}`, quantity: l.qty, unitPriceMinor: Math.round(l.total / l.qty), lineTotalMinor: l.total, unitCostMinor: l.cost === undefined ? 40_000 : l.cost } });
    ids[key] = row.id;
    return row.id;
  }
  const parcel = (orderId: string, x: { charge: number | null; mode?: 'MOCK' | 'LIVE'; exchange?: boolean }) =>
    t.prisma.shipment.create({ data: { storeId: S, orderId, courierAccountId: courier, consignmentId: `C-${(n += 1)}`, chargeMinor: x.charge, mode: x.mode ?? 'LIVE', isExchangeLeg: x.exchange ?? false, idempotencyKey: `p348-s-${n}` } });
  const pay = (orderId: string, method: 'BKASH' | 'NAGAD' | 'COD', status: 'PAID' | 'FAILED', amountMinor: number) =>
    t.prisma.payment.create({ data: { storeId: S, orderId, method, provider: method === 'COD' ? null : method.toLowerCase(), purpose: 'ORDER', status, amountMinor, currency: 'BDT', idempotencyKey: `p348-p-${(n += 1)}` } });

  beforeAll(async () => {
    t = await createTestDatabase('metrics-profit');
    [S, O] = await seedSampleStores(t.prisma);
    courier = (await t.prisma.courierAccount.create({ data: { storeId: S, providerKey: 'sample', name: 'Sample courier' } })).id;

    const full = await order('full', { status: 'DELIVERED', at: at(10), discount: 10_000, delivery: 8_000, lines: [{ sku: 'POLO-M', qty: 2, total: 180_000 }, { sku: 'TEE-M', qty: 1, total: 60_000, cost: 25_000 }] });
    await parcel(full, { charge: 7_000 });
    await parcel(full, { charge: 99_999, mode: 'MOCK' });
    await parcel(full, { charge: 99_999, exchange: true });
    await pay(full, 'BKASH', 'PAID', 100_000);
    await pay(full, 'BKASH', 'FAILED', 50_000);
    await pay(full, 'COD', 'PAID', 128_000);
    const log = await t.prisma.notificationLog.create({ data: { storeId: S, orderId: full, channel: 'SMS', recipient: '01700000000', dedupeKey: 'p348-sms' } });
    await t.prisma.costEntry.create({ data: { storeId: S, service: 'SMS', module: 'messages', amountMinor: 35, currency: 'BDT', refType: 'notification', refId: log.id, source: 'system', occurredAt: at(9) } });
    await t.prisma.costEntry.create({ data: { storeId: S, service: 'AI', amountMinor: 120, currency: 'BDT', refType: 'Order', refId: full, source: 'system', occurredAt: at(9) } });

    const gaps = await order('gaps', { status: 'DELIVERED', at: at(20), lines: [{ sku: 'POLO-M', qty: 1, total: 90_000 }, { sku: 'CAP-1', qty: 1, total: 20_000, cost: null }] });
    await parcel(gaps, { charge: null });
    await pay(gaps, 'NAGAD', 'PAID', 10_000);
    await order('open', { status: 'CONFIRMED', at: at(21), lines: [{ sku: 'POLO-M', qty: 1, total: 90_000 }] });
    await order('other', { status: 'DELIVERED', at: at(10), store: O, lines: [{ sku: 'POLO-M', qty: 1, total: 90_000 }] });
  });
  afterAll(async () => t?.drop());

  it('a delivered order with every part known; ads off; mock, exchange and failed payments never count', async () => {
    const r = (await orderProfits(t.prisma, S, [ids.full!], { ...base, ads: { allocate: false, basis: 'month' } })).get(ids.full!)!;
    expect(r.deliveredDay).toBe('2026-10-10');
    expect(Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, v.minor]))).toEqual({
      sales: 230_000,
      returns: 0, // PR 353: nothing came back
      deliveryCharge: 8_000,
      productCost: 105_000,
      courier: 7_000,
      codFee: null, // PR 354: off as shipped
      paymentFees: 1_850,
      packaging: 3_000,
      messages: 155,
      returnLoss: 0,
      ads: null,
    });
    expect(r.parts.ads.state).toBe('off');
    expect(r.profitMinor).toBe(230_000 + 8_000 - 105_000 - 7_000 - 1_850 - 3_000 - 155);
    expect(r.status).toBe('complete');
  });

  it('ad spend spread over the month’s delivered orders (estimated); none imported with an account = unknown', async () => {
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-348', name: 'Sample ads', currency: 'BDT' } });
    let r = (await orderProfits(t.prisma, S, [ids.full!], base)).get(ids.full!)!;
    expect(r.parts.ads).toEqual({ minor: null, state: 'missing' });
    expect(r.status).toBe('partial');
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, date: new Date('2026-10-05T00:00:00Z'), platform: 'META', spendMinor: 20_001, currency: 'BDT' } });
    r = (await orderProfits(t.prisma, S, [ids.full!], base)).get(ids.full!)!;
    expect(r.parts.ads).toEqual({ minor: 10_000, state: 'estimated' }); // two orders delivered in October; the odd poisha is not invented
    expect(r.status).toBe('estimated');
    const byDay = (await orderProfits(t.prisma, S, [ids.full!], { ...base, ads: { allocate: true, basis: 'day' } })).get(ids.full!)!;
    expect(byDay.parts.ads.state).toBe('missing');
  });

  it('unknowns are named, never 0: no cost on a line means no profit; not delivered has none; another store is not read', async () => {
    const m = await orderProfits(t.prisma, S, [ids.gaps!, ids.open!, ids.other!], { ...base, packagingMinor: null });
    expect(m.has(ids.other!)).toBe(false);
    const g = m.get(ids.gaps!)!;
    expect(g.uncostedSkus).toEqual(['CAP-1']);
    expect(g.parts.productCost.state).toBe('missing');
    expect(g.parts.courier.state).toBe('missing');
    expect(g.parts.paymentFees.state).toBe('missing');
    expect(g.parts.packaging.state).toBe('missing');
    expect(g.profitMinor).toBeNull();
    expect(g.status).toBe('partial');
    const o = m.get(ids.open!)!;
    expect(o.status).toBe('notDelivered');
    expect(o.profitMinor).toBeNull();
    expect(o.deliveredDay).toBeNull();
  });
});
