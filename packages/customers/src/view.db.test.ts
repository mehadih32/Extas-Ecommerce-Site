// PR 284 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the single view of a person by phone — his merged profiles and every number, what his orders came to, his lifetime
// value as Sales (delivered only) beside Ordered value; a merged profile's view is its survivor's; the number is masked
// without `customers.phone`; every open and every copy of the number is logged. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessLogOf, recordPhoneAccess } from './access';
import { mergeCustomers } from './merge';
import { setUpCustomers, type CustomersFixture } from './testing';
import { customerByPhone, customerView } from './view';

const A = '+8801700002851'; // hardcode-ok: made-up test numbers
const B = '+8801700002852'; // hardcode-ok: made-up test numbers

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('the single customer view on PostgreSQL (PR 284)', () => {
  let f: CustomersFixture;
  let a = '';
  let b = '';
  let n = 0;

  async function order(customerId: string | null, phone: string, status: 'PLACED' | 'DELIVERED' | 'CANCELLED', total: number, gift = false) {
    n += 1;
    await f.t.prisma.order.create({
      data: {
        storeId: f.S,
        number: `V284-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date(Date.UTC(2026, 9, 1 + n)),
        deliveredAt: status === 'DELIVERED' ? new Date(Date.UTC(2026, 9, 2 + n)) : null,
        subtotalMinor: total,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: total,
        paymentMethod: 'COD',
        customerId,
        phone,
        isGift: gift,
        idempotencyKey: `v284-${n}`,
      },
    });
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-view');
    a = await f.profile({ phone: A, name: 'Rahim', whatsappNumber: '+8801800002851' });
    b = await f.profile({ phone: B, name: 'Rahim (2nd number)' });
    await order(a, A, 'DELIVERED', 12_000);
    await order(a, A, 'PLACED', 3_000);
    await order(b, B, 'DELIVERED', 7_000);
    await order(b, B, 'CANCELLED', 4_000);
    // a guest order with his number is his; a gift sent to his number is not
    await order(null, A, 'DELIVERED', 1_000);
    await order(null, A, 'DELIVERED', 90_000, true);
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: a, mergedId: b });
  });
  afterAll(async () => f?.t.drop());

  it('one person over both profiles: every number, Sales delivered only beside Ordered value, the order counts', async () => {
    const v = (await customerView(f.customersDeps(), f.manager, a))!;
    expect(v.id).toBe(a);
    expect(v.redirectedFrom).toBeNull();
    expect(v.members.map((m) => m.id)).toEqual([b]);
    expect(v.numbers.map((x) => x.dial)).toEqual(['01700002851', '01800002851', '01700002852']);
    expect(v.kpi.sales).toMatchObject({ orders: 3, valueMinor: 20_000 });
    expect(v.kpi.ordered).toMatchObject({ orders: 5, valueMinor: 27_000 });
    expect(v.history.orders).toBe(5);
    expect(v.history.delivered).toBe(3);
    expect(v.viewer).toEqual({ fullPhone: true, orders: true, merge: true, audit: true, segments: true });
  });

  it('a merged profile opens as its survivor; another store or an unknown id is nothing', async () => {
    const d = f.customersDeps();
    const v = (await customerView(d, f.manager, b))!;
    expect(v).toMatchObject({ id: a, redirectedFrom: b });
    expect(await customerView(d, f.manager, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await customerView(d, f.manager, 'not-an-id')).toBeNull();
    // another store: the manager holds no key there
    const other = (await f.t.prisma.store.create({ data: { slug: 'second-284', name: 'Second', defaultLocale: 'en', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await expect(customerView(d, { ...f.manager, storeId: other }, a)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('masked for a person without the full-number key, who can neither copy nor call it', async () => {
    const d = f.customersDeps();
    const v = (await customerView(d, f.viewer, a))!;
    expect(v.customer.phone).toEqual({ text: '017•••••851', dial: null, masked: true });
    expect(v.numbers.every((x) => x.masked && x.dial === null)).toBe(true);
    expect(v.viewer.fullPhone).toBe(false);
    await expect(recordPhoneAccess(d, f.viewer, a, { action: 'phone.copy' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(customerView(d, { actor: { staffUserId: f.staffId }, storeId: f.S }, a)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('every open and every copy or call of the number is in "Who looked at this customer"', async () => {
    const d = f.customersDeps();
    const before = await f.t.prisma.customerAccessLog.count({ where: { customerId: a } });
    await customerView(d, f.manager, b);
    await customerView(d, f.manager, a, { log: false });
    expect(await recordPhoneAccess(d, f.manager, b, { action: 'phone.call' })).toEqual({ logged: 'phone.call' });
    await expect(recordPhoneAccess(d, f.manager, a, { action: 'phone.erase' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await f.t.prisma.customerAccessLog.count({ where: { customerId: a } })).toBe(before + 1);
    const log = await accessLogOf(f.t.prisma, f.S, [a, b], 2);
    expect(log.map((r) => r.action)).toEqual(['phone.call', 'profile.open']);
    expect(log[0]!.by).toBe('Customers Staff');
  });

  it('finds the person a number belongs to, however it is written (his survivor)', async () => {
    const d = f.customersDeps();
    expect(await customerByPhone(d, f.viewer, '01700002852')).toEqual({ id: a, matchedId: b });
    expect(await customerByPhone(d, f.viewer, '+880 1700-002851')).toEqual({ id: a, matchedId: a });
    expect(await customerByPhone(d, f.viewer, '01800002851')).toEqual({ id: a, matchedId: a });
    expect(await customerByPhone(d, f.viewer, '01999999999')).toBeNull();
    expect(await customerByPhone(d, f.viewer, '')).toBeNull();
  });
});
