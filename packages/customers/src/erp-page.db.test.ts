// PR 620 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the ERP's live "Customers" list — one row per person who ordered (a merged profile counted under its survivor), his
// address, his number, Sales (delivered only) as the total spent, his placed orders, his first and last order; search by
// name or any number however written; pages; never an erased profile, never another store's customer. Every value is
// a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { erpCustomerPage } from './erp-page';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700006201', a2: '+8801900006201', b: '+8801700006202', c: '+8801700006203', x: '+8801700006209' };
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 6));

describe.skipIf(!HAS_TEST_DB)('PR 620 · the ERP customer list on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const id: Record<string, string> = {};

  async function order(o: { customerId: string | null; phone: string; status: 'PLACED' | 'DELIVERED' | 'RETURNED'; total: number; at: Date; store?: number; address?: string }) {
    n += 1;
    await t.prisma.order.create({
      data: {
        storeId: o.store ?? S,
        number: `E620-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: o.at,
        deliveredAt: o.status === 'DELIVERED' ? o.at : null,
        subtotalMinor: o.total,
        totalMinor: o.total,
        paymentMethod: 'COD',
        customerId: o.customerId,
        phone: o.phone,
        shippingAddressText: o.address ?? null,
        idempotencyKey: `e620-${n}`,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('customers-erp');
    [S, O] = await seedSampleStores(t.prisma);
    id.a = (await t.prisma.customer.create({ data: { storeId: S, phone: N.a, name: 'Sample Rahim' } })).id;
    id.a2 = (await t.prisma.customer.create({ data: { storeId: S, phone: N.a2, name: 'Sample Rahim (old)', mergedIntoId: id.a } })).id;
    id.b = (await t.prisma.customer.create({ data: { storeId: S, phone: N.b, name: 'Sample Karim' } })).id;
    id.c = (await t.prisma.customer.create({ data: { storeId: S, phone: N.c, name: 'Sample never ordered' } })).id;
    id.x = (await t.prisma.customer.create({ data: { storeId: S, phone: N.x, name: 'Sample erased', erasedAt: day(1) } })).id;
    id.o = (await t.prisma.customer.create({ data: { storeId: O, phone: N.a, name: 'Other store Rahim' } })).id;
    await t.prisma.customerAddress.create({ data: { storeId: S, customerId: id.a, name: 'Sample Rahim', phone: N.a, addressLine: 'House 1, Road 2, Sample Town', isDefault: true } });
    await order({ customerId: id.a, phone: N.a, status: 'DELIVERED', total: 150_000, at: day(2) });
    await order({ customerId: id.a2, phone: N.a2, status: 'DELIVERED', total: 50_000, at: day(5) });
    await order({ customerId: id.a, phone: N.a, status: 'RETURNED', total: 99_000, at: day(8) });
    await order({ customerId: id.b, phone: N.b, status: 'PLACED', total: 70_000, at: day(3), address: 'Flat 4, Sample Lane' });
    await order({ customerId: id.x, phone: N.x, status: 'DELIVERED', total: 70_000, at: day(9) });
    await order({ customerId: id.o, phone: N.a, status: 'DELIVERED', total: 990_000, at: day(9), store: O });
  });
  afterAll(async () => t?.drop());

  it('one row per person who ordered, newest order first: address, number, total spent (delivered), orders, first and last order', async () => {
    const p = await erpCustomerPage(t.prisma, S, { page: 1, pageSize: 50, search: '' });
    expect(p.total).toBe(2);
    expect(p.rows).toEqual([
      { id: id.a, name: 'Sample Rahim', phone: N.a, address: 'House 1, Road 2, Sample Town', salesMinor: 200_000, orders: 3, firstOrderAt: day(2), lastOrderAt: day(8) },
      // No saved address: the address of his latest order.
      { id: id.b, name: 'Sample Karim', phone: N.b, address: 'Flat 4, Sample Lane', salesMinor: 0, orders: 1, firstOrderAt: day(3), lastOrderAt: day(3) },
    ]);
  });

  it('search by name, or by any of his numbers however written (a merged profile’s number finds the survivor)', async () => {
    expect((await erpCustomerPage(t.prisma, S, { page: 1, pageSize: 50, search: 'karim' })).rows.map((r) => r.id)).toEqual([id.b]);
    expect((await erpCustomerPage(t.prisma, S, { page: 1, pageSize: 50, search: '01900-006201' })).rows.map((r) => r.id)).toEqual([id.a]);
    expect((await erpCustomerPage(t.prisma, S, { page: 1, pageSize: 50, search: 'erased' })).total).toBe(0);
  });

  it('pages', async () => {
    const p2 = await erpCustomerPage(t.prisma, S, { page: 2, pageSize: 1, search: '' });
    expect([p2.total, p2.rows.map((r) => r.id)]).toEqual([2, [id.b]]);
    expect((await erpCustomerPage(t.prisma, S, { page: 3, pageSize: 1, search: '' })).rows).toEqual([]);
  });

  it("another store's customers are its own", async () => {
    const p = await erpCustomerPage(t.prisma, O, { page: 1, pageSize: 50, search: '' });
    expect(p.rows.map((r) => [r.id, r.salesMinor])).toEqual([[id.o, 990_000]]);
  });
});
