// S16 · PR 537 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the VAT report of a period — only the
// delivered orders delivered inside the period (on the store's day), the same Sales figure as Profit & loss, VAT by rate
// (the goods with no rate last, never 0 %), by category, day by day, the delivery charge only when switched on, the
// SKUs without a rate named; another store's orders and archived ones never read. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { profitAndLoss } from './pnl';
import { vatReport } from './vat-report';

const TZ = 'Asia/Dhaka';

describe.skipIf(!HAS_TEST_DB)('PR 537 · VAT report on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const ids: Record<string, string> = {};

  async function order(o: { store?: number; status?: 'DELIVERED' | 'CONFIRMED'; deliveredAt?: Date | null; archived?: boolean; delivery?: number; lines: { product: string | null; total: number }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `L537-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status ?? 'DELIVERED',
        placedAt: new Date('2026-10-01T04:00:00Z'),
        deliveredAt: o.deliveredAt === undefined ? new Date('2026-10-10T06:00:00Z') : o.deliveredAt,
        archivedAt: o.archived ? new Date() : null,
        subtotalMinor: sub,
        discountMinor: 0,
        deliveryChargeMinor: o.delivery ?? 0,
        totalMinor: sub + (o.delivery ?? 0),
        paymentMethod: 'COD',
        idempotencyKey: `l537-${n}`,
      },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, productId: l.product, sku: `SKU-537-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: l.total, lineTotalMinor: l.total, status: 'ACTIVE' } });
    return row.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-vat-report');
    [S, O] = await seedSampleStores(t.prisma);
    const shirts = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-shirts', nameEn: 'Shirts' } });
    const caps = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-caps', nameEn: 'Caps' } });
    ids.shirts = shirts.id;
    ids.caps = caps.id;
    ids.shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-shirt', nameEn: 'Shirt', categoryId: shirts.id } })).id;
    ids.cap = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-cap', nameEn: 'Cap', categoryId: caps.id } })).id;
    ids.loose = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-loose', nameEn: 'No category' } })).id;
    await order({ delivery: 11_500, lines: [{ product: ids.shirt, total: 115_000 }, { product: ids.cap, total: 20_000 }] }); // 10 Oct
    await order({ deliveredAt: new Date('2026-10-11T19:00:00Z'), lines: [{ product: ids.loose, total: 30_000 }] }); // 12 Oct in Dhaka
    await order({ deliveredAt: new Date('2026-10-20T06:00:00Z'), lines: [{ product: ids.shirt, total: 23_000 }] }); // outside
    await order({ status: 'CONFIRMED', deliveredAt: null, lines: [{ product: ids.shirt, total: 99_000 }] }); // not delivered
    await order({ archived: true, lines: [{ product: ids.shirt, total: 99_000 }] });
    await order({ store: O, lines: [{ product: null, total: 50_000 }] });
  });
  afterAll(async () => t?.drop());

  const rates = (defaultBps: number | null = null) => ({ defaultBps, categories: [{ categoryId: ids.shirts!, bps: 1_500 }, { categoryId: ids.caps!, bps: 0 }], products: [] });
  const days = { from: '2026-10-10', to: '2026-10-12' };

  it('counts the delivered orders of the period only, with the same Sales as Profit & loss', async () => {
    const r = await vatReport(t.prisma, S, days, { timeZone: TZ, rates: rates(), onDelivery: false });
    expect(r.orders).toBe(2);
    expect(r.salesMinor).toBe(165_000);
    const pnl = await profitAndLoss(t.prisma, S, days, { timeZone: TZ, currency: 'BDT', packagingMinor: null, gatewayFee: () => null });
    expect(r.salesMinor).toBe(pnl.salesMinor);
    expect(r.goodsVatMinor).toBe(15_000); // 115,000 × 15/115; caps at 0 %
    expect(r.unratedMinor).toBe(30_000);
    expect(r.unratedSkus).toEqual(['SKU-537-2']);
    expect(r.deliveryMinor).toBe(11_500);
    expect(r.deliveryVatMinor).toBeNull();
    expect(r.totalVatMinor).toBe(15_000);
  });

  it('by rate (no rate last), by category and by the store’s day', async () => {
    const r = await vatReport(t.prisma, S, days, { timeZone: TZ, rates: rates(), onDelivery: false });
    expect(r.byRate).toEqual([
      { bps: 1_500, lines: 1, netMinor: 115_000, vatMinor: 15_000 },
      { bps: 0, lines: 1, netMinor: 20_000, vatMinor: 0 },
      { bps: null, lines: 1, netMinor: 30_000, vatMinor: null },
    ]);
    expect(r.byCategory.map((c) => [c.categoryId, c.netMinor, c.vatMinor, c.unratedMinor])).toEqual([
      [ids.shirts, 115_000, 15_000, 0],
      [null, 30_000, 0, 30_000],
      [ids.caps, 20_000, 0, 0],
    ]);
    expect(r.byDay).toEqual([
      { day: '2026-10-12', orders: 1, salesMinor: 30_000, vatMinor: 0 },
      { day: '2026-10-10', orders: 1, salesMinor: 135_000, vatMinor: 15_000 },
    ]);
  });

  it('the delivery charge carries VAT at the default rate only when switched on', async () => {
    const on = await vatReport(t.prisma, S, days, { timeZone: TZ, rates: rates(1_500), onDelivery: true });
    expect(on.deliveryVatMinor).toBe(1_500);
    expect(on.unratedMinor).toBe(0);
    expect(on.goodsVatMinor).toBe(15_000 + 3_913); // 30,000 × 15/115 = 3,913.04 at the default rate
    expect(on.totalVatMinor).toBe(15_000 + 3_913 + 1_500);
    expect(on.byDay[1]!.vatMinor).toBe(16_500);
  });

  it('with no rates every delivered goods line is unrated; an empty period is all zero', async () => {
    const none = await vatReport(t.prisma, S, days, { timeZone: TZ, rates: null, onDelivery: true });
    expect(none.goodsVatMinor).toBe(0);
    expect(none.unratedMinor).toBe(165_000);
    expect(none.byRate).toEqual([{ bps: null, lines: 3, netMinor: 165_000, vatMinor: null }]);
    const empty = await vatReport(t.prisma, S, { from: '2026-09-01', to: '2026-09-02' }, { timeZone: TZ, rates: rates(), onDelivery: false });
    expect(empty).toMatchObject({ orders: 0, salesMinor: 0, totalVatMinor: 0, byRate: [], byCategory: [], byDay: [] });
  });
});
