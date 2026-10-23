// The PostgreSQL tests' shared set-up (never imported by app code): the checkout's fixture (a throwaway database with
// the real migrations, the sample catalogue and store, the permission catalogue, a priced delivery band), stock for a
// few sample variants, a staff member with every order permission and one who may only read, and a helper that places
// a real order through the checkout (so its stock holds, payment rows and timeline are the real ones). Every value is a
// made-up test value.
import { randomUUID } from 'node:crypto';
import { createRole, SYSTEM, type Actor } from '@extas/auth';
import { checkoutQuote, payAction, placeOrder, type PlaceInput } from '@extas/checkout';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { ORDER_PERMISSIONS } from './context';
import type { OrdersDeps, Who } from './context';

export const TEST_FORM = { name: 'Test Customer', phone: '01700000138', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' }; // hardcode-ok: a made-up test number, never a real customer

export interface OrdersFixture extends CheckoutFixture {
  ordersDeps: () => OrdersDeps;
  /** Staff with every order permission, and staff who may only read orders. */
  staff: Who;
  reader: Who;
  staffId: string;
  /** Places an order through the checkout (cash on delivery unless a prepaid method is given) and returns it. */
  place: (name: string, opts?: { lines?: { variantId: string; quantity?: number }[]; phone?: string; address?: string; customerId?: string; payment?: PlaceInput['payment']; pay?: boolean; gift?: PlaceInput['gift'] }) => Promise<{ orderId: string; number: string; visitorId: string }>;
  /** The variants the tests order (stock 100 each). */
  v: { skyM: string; skyL: string; whiteM: string; linenM: string; teeM: string };
}

export async function setUpOrders(label: string): Promise<OrdersFixture> {
  const f = await setUpCheckout(label);
  const p = f.t.prisma;
  await f.priceBand('dhaka-city', 6_000);
  await f.priceBand('outside-dhaka', 9_000);
  f.overrides.set('payment.cod.enabled', true);
  const v = {
    skyM: f.variant('oxford-cotton-shirt', 'sky', 'M').id,
    skyL: f.variant('oxford-cotton-shirt', 'sky', 'L').id,
    whiteM: f.variant('oxford-cotton-shirt', 'white', 'M').id,
    linenM: f.variant('linen-blend-shirt', 'white', 'M').id,
    teeM: f.variant('pocket-tee', 'sky', 'M').id,
  };
  await p.stockLevel.updateMany({ where: { variantId: { in: Object.values(v) } }, data: { onHand: 100, available: 100 } });

  const role = await createRole(p, SYSTEM, { key: 'test-orders', nameEn: 'orders', nameBn: 'orders', permissions: [...ORDER_PERMISSIONS] });
  const readRole = await createRole(p, SYSTEM, { key: 'test-orders-read', nameEn: 'reader', nameBn: 'reader', permissions: ['orders.read'] });
  const u = await p.staffUser.create({ data: { email: 'orders@example.com', displayName: 'Orders Staff', passwordHash: 'not-a-login' } });
  const r = await p.staffUser.create({ data: { email: 'reader@example.com', displayName: 'Reader', passwordHash: 'not-a-login' } });
  await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
  await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: readRole.id, storeId: f.S } });
  const staffActor: Actor = { staffUserId: u.id };

  const ordersDeps = (): OrdersDeps => ({ db: p, settings: f.deps().settings, now: () => f.clock.now });

  return {
    ...f,
    ordersDeps,
    staff: { actor: staffActor, storeId: f.S },
    reader: { actor: { staffUserId: r.id }, storeId: f.S },
    staffId: u.id,
    v,
    async place(name, opts = {}) {
      const lines = opts.lines ?? [{ variantId: v.skyM }];
      const bag = await f.bag(name, lines);
      const form = { ...TEST_FORM, phone: opts.phone ?? TEST_FORM.phone, address: opts.address ?? TEST_FORM.address };
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: opts.customerId ?? null, address: { line: form.address, confirmed: null }, payment: opts.payment ?? null, gift: !!opts.gift });
      const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form, confirmed: null, payment: opts.payment ?? null, gift: opts.gift ?? null, fingerprint: q.fingerprint };
      const placed = await placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: opts.customerId ?? null, ip: '192.0.2.138', input });
      if (opts.pay) await payAction(f.deps(), { storeId: f.S, visitorId: bag.visitorId, input: { number: placed.number, action: 'approve' } });
      f.clock.now = new Date(f.clock.now.getTime() + 60_000);
      return { orderId: placed.orderId, number: placed.number, visitorId: bag.visitorId };
    },
  };
}
