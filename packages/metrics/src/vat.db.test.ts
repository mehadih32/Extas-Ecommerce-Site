// S16 · PR 350 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the VAT inside each order — the goods
// figure (subtotal − order discount) spread over the counted lines and each line's VAT at its product's, category's,
// parent's or the default rate; a line taken off the order not counted; no rate shown as unrated; the delivery charge
// only when the owner says so; another store's order never read. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { ordersVat } from './vat';

describe.skipIf(!HAS_TEST_DB)('PR 350 · VAT inside orders on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const ids: Record<string, string> = {};

  async function order(o: { store?: number; discount?: number; delivery?: number; lines: { product: string | null; total: number; status?: 'ACTIVE' | 'REMOVED' }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.filter((l) => (l.status ?? 'ACTIVE') === 'ACTIVE').reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: { storeId, number: `L350-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date(), deliveredAt: new Date(), subtotalMinor: sub, discountMinor: o.discount ?? 0, deliveryChargeMinor: o.delivery ?? 0, totalMinor: sub - (o.discount ?? 0) + (o.delivery ?? 0), paymentMethod: 'COD', idempotencyKey: `l350-${n}` },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, productId: l.product, sku: `SKU-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: l.total, lineTotalMinor: l.total, status: l.status ?? 'ACTIVE' } });
    return row.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-vat');
    [S, O] = await seedSampleStores(t.prisma);
    const shirts = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-shirts', nameEn: 'Shirts' } });
    const formal = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-formal', nameEn: 'Formal', parentId: shirts.id } });
    const caps = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-caps', nameEn: 'Caps' } });
    ids.shirts = shirts.id;
    ids.caps = caps.id;
    ids.formalShirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-formal-shirt', nameEn: 'Formal shirt', categoryId: formal.id } })).id;
    ids.cap = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-cap', nameEn: 'Cap', categoryId: caps.id } })).id;
    ids.gift = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-gift', nameEn: 'Gift box', categoryId: caps.id } })).id;
    ids.loose = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-loose', nameEn: 'No category' } })).id;
    ids.a = await order({ discount: 10_000, delivery: 11_500, lines: [{ product: ids.formalShirt, total: 115_000 }, { product: ids.cap, total: 35_000 }, { product: ids.gift, total: 50_000, status: 'REMOVED' }] });
    ids.b = await order({ lines: [{ product: ids.gift, total: 21_000 }, { product: ids.loose, total: 23_000 }, { product: null, total: 10_000 }] });
    ids.other = await order({ store: O, lines: [{ product: null, total: 50_000 }] });
  });
  afterAll(async () => t?.drop());

  const rates = () => ({ defaultBps: null, categories: [{ categoryId: ids.shirts!, bps: 1_500 }, { categoryId: ids.caps!, bps: 0 }], products: [{ productId: ids.gift!, bps: 500 }] });

  it('spreads the goods figure over the counted lines and takes the VAT out of each at its rate', async () => {
    const v = await ordersVat(t.prisma, S, [ids.a!], rates(), { onDelivery: false });
    const a = v.get(ids.a!)!;
    expect(a.goodsMinor).toBe(140_000); // 150,000 − 10,000; the removed gift box is not counted
    expect(a.lines.map((l) => l.netMinor)).toEqual([107_333, 32_667]);
    expect(a.lines.map((l) => l.rate.source)).toEqual(['parent', 'category']);
    expect(a.lines[0]!.vatMinor).toBe(14_000); // 107,333 × 15/115 = 13,999.96
    expect(a.lines[1]!.vatMinor).toBe(0); // caps at 0 % — a real rate, not "unrated"
    expect(a.goodsVatMinor).toBe(14_000);
    expect(a.unratedMinor).toBe(0);
    expect(a.deliveryVatMinor).toBeNull();
  });

  it('a product rate wins; a line with no rate anywhere is unrated, never 0 %', async () => {
    const b = (await ordersVat(t.prisma, S, [ids.b!], rates(), { onDelivery: true })).get(ids.b!)!;
    expect(b.lines.map((l) => l.rate.source)).toEqual(['product', 'none', 'none']);
    expect(b.lines[0]!.vatMinor).toBe(1_000);
    expect(b.goodsVatMinor).toBe(1_000);
    expect(b.unratedMinor).toBe(33_000);
    expect(b.deliveryVatMinor).toBeNull(); // on, but no default rate to use
  });

  it('the delivery charge carries VAT at the default rate only when switched on', async () => {
    const withDefault = { ...rates(), defaultBps: 1_500 };
    expect((await ordersVat(t.prisma, S, [ids.a!], withDefault, { onDelivery: true })).get(ids.a!)!.deliveryVatMinor).toBe(1_500);
    expect((await ordersVat(t.prisma, S, [ids.a!], withDefault, { onDelivery: false })).get(ids.a!)!.deliveryVatMinor).toBeNull();
    const b = (await ordersVat(t.prisma, S, [ids.b!], withDefault, { onDelivery: false })).get(ids.b!)!;
    expect(b.lines.map((l) => l.rate.source)).toEqual(['product', 'default', 'default']);
    expect(b.unratedMinor).toBe(0);
  });

  it('with no rates at all every line is unrated; another store and unknown ids are left out', async () => {
    const v = await ordersVat(t.prisma, S, [ids.a!, ids.other!, '0190a1b2-0000-7000-8000-00000000abcd'], null, { onDelivery: true });
    expect([...v.keys()]).toEqual([ids.a]);
    expect(v.get(ids.a!)!.unratedMinor).toBe(140_000);
    expect(v.get(ids.a!)!.goodsVatMinor).toBe(0);
    expect((await ordersVat(t.prisma, S, [], rates(), { onDelivery: false })).size).toBe(0);
  });
});
