// PR 155 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL).
// Sample orders in every state the schema has, two stores, two zones and two payment methods; every value is a made-up
// test value. PLACED is never in Sales; until the order state machine exists nothing reaches DELIVERED, so the checkout's
// own orders give Sales 0 — the delivered rows below are written straight into the table only to prove the rule.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { daysPeriod, sumLines } from './pure';
import { kpi, kpiByDay, kpiByPaymentMethod, kpiByZone, lines, linesBoth } from './metrics';

const TZ = 'Asia/Dhaka';
/** A moment on a shop day: hour is the local (UTC+6) hour. */
const at = (ymd: string, hour = 12) => new Date(Date.parse(`${ymd}T00:00:00Z`) + (hour - 6) * 3_600_000);

describe.skipIf(!HAS_TEST_DB)('metrics on PostgreSQL (PR 155)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let n = 0;
  const zones: Record<string, string> = {};
  let variantId = '';
  let productId = '';

  type Status = 'DRAFT' | 'PLACED' | 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'RETURNED' | 'CANCELLED';
  async function order(o: { status: Status; placed: Date; delivered?: Date; total: number; delivery?: number; discount?: number; zone?: string; pay?: 'COD' | 'BKASH'; store?: number; archived?: boolean; lines?: { q: number; unit: number; total: number; combo?: boolean; removed?: boolean }[] }) {
    n += 1;
    const storeId = o.store ?? A;
    const delivery = o.delivery ?? 0;
    const discount = o.discount ?? 0;
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `M155-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: o.placed,
        deliveredAt: o.delivered ?? null,
        subtotalMinor: o.total - delivery + discount,
        discountMinor: discount,
        deliveryChargeMinor: delivery,
        totalMinor: o.total,
        paymentMethod: o.pay ?? 'COD',
        deliveryBandId: o.zone ? zones[o.zone] : null,
        idempotencyKey: `m155-${n}`,
        archivedAt: o.archived ? o.placed : null,
      },
    });
    for (const [i, l] of (o.lines ?? []).entries()) {
      await t.prisma.orderItem.create({
        data: {
          storeId,
          orderId: row.id,
          variantId,
          productId,
          sku: `M155-${n}-${i}`,
          productName: 'Sample piece',
          quantity: l.q,
          unitPriceMinor: l.unit,
          lineTotalMinor: l.total,
          comboId: null,
          comboGroupKey: l.combo ? `set-${n}` : null,
          status: l.removed ? 'REMOVED' : 'ACTIVE',
        },
      });
    }
    return row.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics');
    [A, B] = await seedSampleStores(t.prisma);
    for (const key of ['inside', 'outside']) {
      zones[key] = (await t.prisma.deliveryBand.create({ data: { storeId: A, key, nameEn: `Sample ${key}`, chargeMinor: 0 } })).id;
    }
    const p = await t.prisma.product.create({ data: { storeId: A, slug: 'sample-metrics-tee', nameEn: 'Sample tee' } });
    productId = p.id;
    variantId = (await t.prisma.productVariant.create({ data: { storeId: A, productId: p.id, sku: 'SAMPLE-M155', priceMinor: 100_000 } })).id;

    // 20 Oct: placed and delivered on 22 Oct (in Sales on the 22nd, in Ordered value on the 20th).
    await order({ status: 'DELIVERED', placed: at('2026-10-20'), delivered: at('2026-10-22'), total: 109_000, delivery: 9_000, zone: 'inside', pay: 'COD', lines: [{ q: 1, unit: 100_000, total: 100_000 }] });
    // 20 Oct, still open in several states: Ordered value only.
    await order({ status: 'PLACED', placed: at('2026-10-20'), total: 50_000, zone: 'outside', pay: 'BKASH', lines: [{ q: 2, unit: 30_000, total: 50_000, combo: true }] });
    await order({ status: 'CONFIRMED', placed: at('2026-10-21', 1), total: 20_000, zone: 'inside' }); // 01:00 local = still the 21st
    await order({ status: 'IN_TRANSIT', placed: at('2026-10-21'), total: 30_000 });
    // A placed order that wrongly carries a delivered time is still not Sales: the status decides.
    await order({ status: 'PLACED', placed: at('2026-10-21'), delivered: at('2026-10-22'), total: 1_000 });
    // Cancelled and returned: Ordered value (they were ordered), never Sales.
    await order({ status: 'CANCELLED', placed: at('2026-10-21'), total: 7_000 });
    await order({ status: 'RETURNED', placed: at('2026-10-21'), delivered: at('2026-10-22'), total: 8_000 });
    // Partly delivered: not Sales until the state machine says which part (CN-022).
    await order({ status: 'PARTIALLY_DELIVERED', placed: at('2026-10-21'), delivered: at('2026-10-22'), total: 4_000 });
    // Never placed, archived, another store: in nothing.
    await order({ status: 'DRAFT', placed: at('2026-10-21'), total: 900_000 });
    await order({ status: 'DELIVERED', placed: at('2026-10-21'), delivered: at('2026-10-22'), total: 900_000, archived: true });
    await order({ status: 'DELIVERED', placed: at('2026-10-21'), delivered: at('2026-10-22'), total: 900_000, store: B });
    // Delivered on the 23rd at 23:30 local (17:30 UTC) — still the 23rd in the shop; with a removed line that never counts.
    await order({ status: 'DELIVERED', placed: at('2026-10-22'), delivered: at('2026-10-23', 23.5), total: 60_000, discount: 10_000, zone: 'outside', pay: 'BKASH', lines: [{ q: 1, unit: 70_000, total: 60_000, combo: true }, { q: 1, unit: 5_000, total: 5_000, removed: true }] });
  });

  afterAll(async () => {
    await t?.drop();
  });

  const P = () => daysPeriod('2026-10-20', '2026-10-23', TZ);

  it('the headline pair: Sales = delivered only, Ordered value = every placed order, side by side', async () => {
    const k = await kpi(t.prisma, A, P());
    expect(k.sales).toEqual({ orders: 2, valueMinor: 169_000, itemsMinor: 160_000, deliveryMinor: 9_000 });
    // 109 000 + 50 000 + 20 000 + 30 000 + 1 000 + 7 000 + 8 000 + 4 000 + 60 000
    expect(k.ordered.orders).toBe(9);
    expect(k.ordered.valueMinor).toBe(289_000);
  });

  it('PLACED is never in Sales; only placed orders give Sales 0', async () => {
    const onlyOpen = await kpi(t.prisma, A, daysPeriod('2026-10-21', '2026-10-21', TZ));
    expect(onlyOpen.sales.orders).toBe(0);
    expect(onlyOpen.ordered.orders).toBe(6);
    expect(await kpi(t.prisma, A, daysPeriod('2025-01-01', '2025-01-02', TZ))).toEqual({
      sales: { orders: 0, valueMinor: 0, itemsMinor: 0, deliveryMinor: 0 },
      ordered: { orders: 0, valueMinor: 0, itemsMinor: 0, deliveryMinor: 0 },
    });
  });

  it('day by day: Ordered value on the placed day, Sales on the delivered day, in the shop time zone, every day present', async () => {
    const rows = await kpiByDay(t.prisma, A, { from: '2026-10-20', to: '2026-10-23' }, TZ);
    expect(rows.map((r) => [r.key, r.ordered.orders, r.ordered.valueMinor, r.sales.orders, r.sales.valueMinor])).toEqual([
      ['2026-10-20', 2, 159_000, 0, 0],
      ['2026-10-21', 6, 70_000, 0, 0],
      ['2026-10-22', 1, 60_000, 1, 109_000],
      ['2026-10-23', 0, 0, 1, 60_000],
    ]);
  });

  it('by delivery zone and by payment method, with both figures', async () => {
    const z = await kpiByZone(t.prisma, A, P());
    expect(z.map((r) => [r.key, r.ordered.orders, r.sales.valueMinor])).toEqual([
      ['', 5, 0],
      ['inside', 2, 109_000],
      ['outside', 2, 60_000],
    ]);
    const p = await kpiByPaymentMethod(t.prisma, A, P());
    expect(p.map((r) => [r.key, r.ordered.orders, r.sales.orders, r.sales.valueMinor])).toEqual([
      ['BKASH', 2, 1, 60_000],
      ['COD', 7, 1, 109_000],
    ]);
  });

  it('order lines: a product or the set lines, each line on its figure’s day; removed lines never count', async () => {
    const both = await linesBoth(t.prisma, A, P(), TZ, { productId });
    expect(sumLines(both.sales)).toEqual({ orders: 2, units: 2, valueMinor: 160_000, regularMinor: 170_000, savedMinor: 10_000 });
    expect(sumLines(both.ordered)).toMatchObject({ orders: 3, units: 4, valueMinor: 210_000 });
    expect(both.sales.map((l) => l.day)).toEqual(['2026-10-22', '2026-10-23']);
    const sets = await lines(t.prisma, 'ordered', A, P(), TZ, { combos: true });
    expect(sets).toHaveLength(0); // comboId is empty on these sample lines: a set needs its combo
    expect(await lines(t.prisma, 'sales', B, P(), TZ)).toEqual([]);
  });

  it('refuses a period that ends before it starts', async () => {
    await expect(kpi(t.prisma, A, { from: new Date('2026-10-23T00:00:00Z'), to: new Date('2026-10-20T00:00:00Z') })).rejects.toThrow(RangeError);
  });
});
