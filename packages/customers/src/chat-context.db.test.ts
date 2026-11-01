// PR 428 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the customer beside a support chat (B4.5).
// From the chat's customer or, with none linked, the chat's number: the order count, delivered / refused share, the
// latest scored order's risk band, the orders still on their way with their courier parcel; counts and risk only with
// `customers.read`; another store's orders never counted; nobody known is an empty card. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { chatContextOf } from './chat-context';
import { chatRatios } from './pure';
import { setUpCustomers, type CustomersFixture } from './testing';
import type { Who } from './context';

const A = '+8801700004281'; // hardcode-ok: made-up test numbers
const GUEST = '+8801700004282'; // hardcode-ok: made-up test numbers

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('the customer beside a support chat on PostgreSQL (PR 428)', () => {
  let f: CustomersFixture;
  let a = '';
  let other = 0;
  let n = 0;
  const who: Record<'full' | 'plain' | 'none', Who> = {} as never;
  const ids: Record<string, string> = {};
  async function order(storeId: number, customerId: string | null, phone: string, status: 'PLACED' | 'DELIVERED' | 'RETURNED' | 'IN_TRANSIT' | 'CANCELLED', risk?: [number, string]) {
    n += 1;
    const o = await f.t.prisma.order.create({
      data: {
        storeId,
        number: `C428-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date(Date.UTC(2026, 9, 1 + n)),
        subtotalMinor: 1_000 * n,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: 1_000 * n,
        paymentMethod: 'COD',
        customerId,
        phone,
        idempotencyKey: `c428-${n}`,
        ...(risk ? { riskScore: risk[0], riskBand: risk[1] } : {}),
      },
    });
    ids[`${status}-${n}`] = o.id;
    return o.id;
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-chat-context');
    const p = f.t.prisma;
    const role = (key: string, permissions: string[]) => createRole(p, SYSTEM, { key, nameEn: key, nameBn: key, permissions });
    const roles = { full: await role('t428-full', ['support.read', 'customers.read', 'orders.read']), plain: await role('t428-plain', ['support.read']), none: await role('t428-none', ['customers.read']) };
    for (const k of ['full', 'plain', 'none'] as const) {
      const u = await p.staffUser.create({ data: { email: `c428-${k}@example.com`, displayName: k, passwordHash: 'not-a-login' } });
      await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: roles[k].id, storeId: f.S } });
      who[k] = { actor: { staffUserId: u.id }, storeId: f.S };
    }
    a = await f.profile({ phone: A, name: 'Sample Rahim' });
    await order(f.S, a, A, 'DELIVERED', [10, 'low']);
    await order(f.S, a, A, 'DELIVERED');
    await order(f.S, a, A, 'RETURNED');
    await order(f.S, null, A, 'CANCELLED'); // a guest order with his number is his
    const transit = await order(f.S, a, A, 'IN_TRANSIT', [70, 'high']);
    await order(f.S, a, A, 'PLACED');
    other = (await p.store.create({ data: { slug: 'second-428', name: 'Second', defaultLocale: 'en', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
    await order(other, null, A, 'DELIVERED'); // another store's order: never his here
    await order(f.S, null, GUEST, 'PLACED');
    const courier = await p.courierAccount.create({ data: { storeId: f.S, providerKey: 'sample', name: 'Sample Courier' } });
    await p.shipment.create({ data: { storeId: f.S, orderId: transit, courierAccountId: courier.id, status: 'IN_TRANSIT', trackingCode: 'TRK-428', idempotencyKey: 'c428-ship' } });
  });
  afterAll(async () => f?.t.drop());

  it('the linked customer: counts, delivered share, the risk of the open scored order, live orders with their parcel', async () => {
    const c = await chatContextOf(f.customersDeps(), who.full, { customerId: a, phone: null }, { recent: 2 });
    expect(c.matchedBy).toBe('customer');
    expect(c.customer).toEqual({ id: a, name: 'Sample Rahim' });
    expect(c.orders).toBe(6);
    expect(c.history).toMatchObject({ orders: 6, delivered: 2, refused: 1, cancelled: 1, open: 2, inTransit: 1 });
    expect(c.ratios).toEqual({ finished: 3, deliveredPct: 67, refusedPct: 33, returnedPct: 0 });
    expect(c.risk).toMatchObject({ score: 70, band: { key: 'high', tone: 'bad' }, number: 'C428-5' });
    expect(c.live.map((o) => [o.number, o.status])).toEqual([
      ['C428-6', 'PLACED'],
      ['C428-5', 'IN_TRANSIT'],
    ]);
    expect(c.live[1]!.parcel).toEqual({ status: 'IN_TRANSIT', courier: 'Sample Courier', trackingCode: 'TRK-428' });
    expect(c.recent.map((o) => o.number)).toEqual(['C428-6', 'C428-5']);
    expect(c.you).toEqual({ history: true, customer: true, orders: true });
  });

  it('no customer linked: found by the chat number in any form; a guest number shows its orders only', async () => {
    const c = await chatContextOf(f.customersDeps(), who.full, { customerId: null, phone: '01700004281' }, { recent: 3 });
    expect(c).toMatchObject({ matchedBy: 'phone', customer: { id: a }, orders: 6 });
    const g = await chatContextOf(f.customersDeps(), who.full, { customerId: null, phone: GUEST }, { recent: 3 });
    expect(g).toMatchObject({ matchedBy: 'phone', customer: null, orders: 1 });
    expect(g.live.map((o) => o.number)).toEqual(['C428-8']);
    const none = await chatContextOf(f.customersDeps(), who.full, { customerId: null, phone: '+8801700004299' }, { recent: 3 });
    expect(none).toMatchObject({ customer: null, orders: 0, live: [], risk: null });
    const nobody = await chatContextOf(f.customersDeps(), who.full, { customerId: null, phone: null }, { recent: 3 });
    expect(nobody.matchedBy).toBeNull();
  });

  it('without customers.read: the order count and live orders, never the counts, ratios or risk', async () => {
    const c = await chatContextOf(f.customersDeps(), who.plain, { customerId: a, phone: null }, { recent: 3 });
    expect(c.orders).toBe(6);
    expect(c.live).toHaveLength(2);
    expect(c.history).toBeNull();
    expect(c.ratios).toBeNull();
    expect(c.risk).toBeNull();
    expect(c.you).toEqual({ history: false, customer: false, orders: false });
  });

  it('needs support.read; another store sees nothing of his', async () => {
    await expect(chatContextOf(f.customersDeps(), who.none, { customerId: a, phone: null }, { recent: 3 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(chatContextOf(f.customersDeps(), { ...who.full, storeId: other }, { customerId: a, phone: null }, { recent: 3 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('ratios from nothing are none', () => {
    expect(chatRatios({ delivered: 0, refused: 0, returns: 0 })).toEqual({ finished: 0, deliveredPct: null, refusedPct: null, returnedPct: null });
    expect(chatRatios({ delivered: 4, refused: 0, returns: 1 })).toEqual({ finished: 4, deliveredPct: 100, refusedPct: 0, returnedPct: 25 });
  });
});
