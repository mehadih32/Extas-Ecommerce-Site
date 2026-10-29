// PR 286 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// one customer's page — his orders over every profile and number, newest first, a page of the owner's size at a time
// (a gift sent to his number is not his); his exchanges; his support history; "Who looked at this customer" for the
// audit key only. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordPhoneAccess } from './access';
import { mergeCustomers } from './merge';
import { customerExchanges, customerLooks, customerOrders, customerSupport } from './profile';
import { setUpCustomers, type CustomersFixture } from './testing';
import { customerView } from './view';

const A = '+8801700002871'; // hardcode-ok: made-up test numbers
const B = '+8801700002872'; // hardcode-ok: made-up test numbers

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('one customer\'s page on PostgreSQL (PR 286)', () => {
  let f: CustomersFixture;
  let a = '';
  let b = '';
  const orderIds: string[] = [];
  let n = 0;

  async function order(customerId: string | null, phone: string, gift = false) {
    n += 1;
    const o = await f.t.prisma.order.create({
      data: { storeId: f.S, number: `P286-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date(Date.UTC(2026, 8, n)), deliveredAt: new Date(Date.UTC(2026, 8, n)), subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId, phone, isGift: gift, idempotencyKey: `p286-${n}` },
    });
    orderIds.push(o.id);
    return o.id;
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-profile');
    a = await f.profile({ phone: A, name: 'Rahim' });
    b = await f.profile({ phone: B, name: 'Rahim 2' });
    for (let i = 0; i < 4; i++) await order(a, A);
    await order(b, B);
    await order(null, A);
    await order(null, A, true);
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: a, mergedId: b });
    await f.t.prisma.exchange.create({ data: { storeId: f.S, orderId: orderIds[4]!, customerId: b, number: 'X286-1', reason: 'size', tier: 1 } });
    await f.t.prisma.ticket.create({ data: { storeId: f.S, customerId: b, subject: 'Where is my parcel?', status: 'OPEN' } });
  });
  afterAll(async () => f?.t.drop());

  it('every order of every profile and number, newest first, a page at a time; never the gift', async () => {
    const d = f.customersDeps();
    f.overrides.set('customers.profile', { ordersPerPage: 5, listsPerPage: 10, accessLogShown: 10 });
    const p1 = await customerOrders(d, f.viewer, b);
    expect(p1).toMatchObject({ page: 1, perPage: 5, total: 6, hasMore: true });
    expect(p1.rows[0]!.number).toBe('P286-6');
    expect(p1.rows[0]!.profileId).toBeNull();
    const p2 = await customerOrders(d, f.viewer, a, { page: 2 });
    expect(p2.rows.map((r) => r.number)).toEqual(['P286-1']);
    expect(p2.hasMore).toBe(false);
    f.overrides.delete('customers.profile');
    await expect(customerOrders(d, f.viewer, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(customerOrders(d, f.viewer, a, { page: 0 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('his exchanges and his support history over both profiles', async () => {
    const d = f.customersDeps();
    expect(await customerExchanges(d, f.viewer, a)).toMatchObject([{ number: 'X286-1', order: { number: 'P286-5' } }]);
    expect(await customerSupport(d, f.viewer, a)).toMatchObject([{ kind: 'ticket', title: 'Where is my parcel?', status: 'OPEN' }]);
    const lone = await f.profile({ phone: '+8801700002879', name: 'Nobody' }); // hardcode-ok: made-up test number
    expect(await customerSupport(d, f.viewer, lone)).toEqual([]);
    expect(await customerExchanges(d, f.viewer, lone)).toEqual([]);
  });

  it('"Who looked at this customer" only for the audit key, newest first, as many as the owner shows', async () => {
    const d = f.customersDeps();
    await customerView(d, f.viewer, a);
    await recordPhoneAccess(d, f.manager, b, { action: 'phone.copy' });
    await expect(customerLooks(d, f.viewer, a)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const looks = await customerLooks(d, f.manager, a);
    expect(looks.map((l) => [l.action, l.by])).toEqual([
      ['phone.copy', 'Customers Staff'],
      ['profile.open', 'Customer Reader'],
    ]);
    f.overrides.set('customers.profile', { ordersPerPage: 20, listsPerPage: 10, accessLogShown: 0 });
    expect(await customerLooks(d, f.manager, a)).toEqual([]);
    f.overrides.delete('customers.profile');
  });
});
