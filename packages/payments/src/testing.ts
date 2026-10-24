// The PostgreSQL tests' shared set-up (never imported by app code): a throwaway database with the real migrations, two
// sample stores, the permission catalogue, a settings reader on the registry's defaults with per-test overrides, a
// clock, a staff member with every payments permission and one who may only look, and stored orders with made-up
// lines and money in the state given (as the checkout and the order service store them). PR 166: a courier account and
// a booked parcel (no code books parcels before S08, so the tests store them as S08 will). Every value is made up.
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { PAYMENT_PERMISSIONS, type PaymentsDeps, type SettingsReader, type Who } from './context';

export interface PaymentsFixture {
  t: TestDatabase;
  A: number;
  B: number;
  overrides: Map<string, unknown>;
  clock: { now: Date };
  deps: (extra?: Partial<PaymentsDeps>) => PaymentsDeps;
  advance: (ms: number) => void;
  /** Staff with every payments permission, and staff who may only look. */
  staff: Who;
  viewer: Who;
  staffId: string;
  /** A stored order (cash on delivery unless said), with an optional open payment waiting for the gateway. */
  order: (o: OrderSpec) => Promise<{ id: string; number: string }>;
  /** A payment row on an order, as the checkout makes it (INITIATED, attempt 1). */
  payment: (orderId: string, p?: Partial<{ amountMinor: number; method: 'BKASH' | 'NAGAD' | 'CARD'; provider: string; purpose: 'ORDER' | 'ADVANCE_DELIVERY_CHARGE'; key: string; storeId: number; createdAt: Date }>) => Promise<{ id: string }>;
  /** PR 166: a courier account in store A. */
  courier: (name: string) => Promise<{ id: string }>;
  /** PR 171: a customer of a store (store A unless given). */
  customer: (name: string, storeId?: number) => Promise<{ id: string }>;
  /** PR 171: a delivery band with its promise in hours (store A). */
  band: (key: string, hoursMax: number | null) => Promise<{ id: string }>;
  /** PR 166: a booked parcel of an order (COD as the order's, unless given). */
  shipment: (orderId: string, s: { courierAccountId: string; consignmentId: string; status?: 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'RETURNED'; codAmountMinor?: number; chargeMinor?: number | null; deliveredAt?: Date | null }) => Promise<{ id: string }>;
}

export interface OrderSpec {
  number: string;
  storeId?: number;
  status?: 'PLACED' | 'AWAITING_ADVANCE' | 'CONFIRMED' | 'PACKED' | 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'RETURNED' | 'CANCELLED';
  paymentMethod?: 'COD' | 'BKASH' | 'NAGAD' | 'CARD' | 'WALLET';
  /** The lines' amounts (each one piece); default one piece of 150,000. */
  lines?: number[];
  deliveryChargeMinor?: number;
  walletAppliedMinor?: number;
  paidMinor?: number;
  advanceRequiredMinor?: number | null;
  flags?: string[];
  visitorId?: string;
  /** PR 171: the order's customer, placed and delivered moments and its delivery band. */
  customerId?: string;
  placedAt?: Date;
  deliveredAt?: Date | null;
  deliveryBandId?: string;
}

export async function setUpPayments(label: string): Promise<PaymentsFixture> {
  const t = await createTestDatabase(label);
  const [A, B] = await seedSampleStores(t.prisma);
  await syncAuth(t.prisma);
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const clock = { now: new Date('2026-10-24T06:00:00Z') };
  const p = t.prisma;
  const role = await createRole(p, SYSTEM, { key: 'test-payments', nameEn: 'payments', nameBn: 'payments', permissions: [...PAYMENT_PERMISSIONS] });
  const viewRole = await createRole(p, SYSTEM, { key: 'test-payments-view', nameEn: 'viewer', nameBn: 'viewer', permissions: ['payments.view'] });
  const u = await p.staffUser.create({ data: { email: 'payments@example.com', displayName: 'Payments Staff', passwordHash: 'not-a-login' } });
  const v = await p.staffUser.create({ data: { email: 'viewer@example.com', displayName: 'Viewer', passwordHash: 'not-a-login' } });
  await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
  await p.staffRoleAssignment.create({ data: { staffUserId: v.id, roleId: viewRole.id, storeId: A } });
  const staffActor: Actor = { staffUserId: u.id };
  let seq = 0;
  return {
    t,
    A,
    B,
    overrides,
    clock,
    deps: (extra = {}) => ({ db: p, settings, now: () => clock.now, ...extra }),
    advance: (ms) => {
      clock.now = new Date(clock.now.getTime() + ms);
    },
    staff: { actor: staffActor, storeId: A },
    viewer: { actor: { staffUserId: v.id }, storeId: A },
    staffId: u.id,
    async order(o) {
      const lines = o.lines ?? [150_000]; // hardcode-ok: test fixture, made-up amounts
      const subtotal = lines.reduce((s, x) => s + x, 0);
      const delivery = o.deliveryChargeMinor ?? 0;
      const total = subtotal + delivery;
      const wallet = o.walletAppliedMinor ?? 0;
      const paid = o.paidMinor ?? 0;
      const method = o.paymentMethod ?? 'COD';
      const storeId = o.storeId ?? A;
      return p.order.create({
        data: {
          storeId,
          number: o.number,
          status: o.status ?? 'PLACED',
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: o.placedAt ?? clock.now,
          deliveredAt: o.deliveredAt ?? null,
          customerId: o.customerId ?? null,
          deliveryBandId: o.deliveryBandId ?? null,
          customerName: 'Test Customer',
          phone: '+8801700000165', // hardcode-ok: test fixture, a made-up number
          shippingAddressText: 'House 4, Road 5, Sample Area',
          visitorId: o.visitorId ?? null,
          subtotalMinor: subtotal,
          deliveryChargeMinor: delivery,
          walletAppliedMinor: wallet,
          paidMinor: paid,
          totalMinor: total,
          codAmountMinor: method === 'COD' ? Math.max(0, total - wallet - paid) : 0,
          paymentMethod: method,
          advanceRequiredMinor: o.advanceRequiredMinor ?? null,
          flags: o.flags ?? [],
          idempotencyKey: `test-${o.number}`,
          items: {
            create: lines.map((amount, i) => ({
              storeId,
              sku: `SKU-${i}`,
              productName: `Sample piece ${i + 1}`,
              colourName: 'Navy',
              sizeLabel: 'M',
              quantity: 1,
              unitPriceMinor: amount,
              lineTotalMinor: amount,
              createdAt: new Date(clock.now.getTime() + i),
            })),
          },
        },
        select: { id: true, number: true },
      });
    },
    async customer(name, storeId = A) {
      seq += 1;
      return p.customer.create({ data: { storeId, name, phone: `+88017000${String(10_000 + seq).slice(-5)}` }, select: { id: true } }); // hardcode-ok: test fixture, made-up numbers
    },
    async band(key, hoursMax) {
      return p.deliveryBand.create({ data: { storeId: A, key, nameEn: key, chargeMinor: 0, hoursMax, enabled: true }, select: { id: true } }); // hardcode-ok: test fixture, a made-up band
    },
    async courier(name) {
      return p.courierAccount.create({ data: { storeId: A, providerKey: 'mock', name, enabled: true }, select: { id: true } });
    },
    async shipment(orderId, s) {
      const o = await p.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true, codAmountMinor: true } });
      return p.shipment.create({
        data: {
          storeId: o.storeId,
          orderId,
          courierAccountId: s.courierAccountId,
          consignmentId: s.consignmentId,
          status: s.status ?? 'IN_TRANSIT',
          codAmountMinor: s.codAmountMinor ?? o.codAmountMinor,
          chargeMinor: s.chargeMinor === undefined ? null : s.chargeMinor,
          deliveredAt: s.deliveredAt ?? null,
          bookedAt: clock.now,
          idempotencyKey: `test-ship-${s.consignmentId}`,
        },
        select: { id: true },
      });
    },
    async payment(orderId, x = {}) {
      seq += 1;
      return p.payment.create({
        data: {
          storeId: x.storeId ?? A,
          orderId,
          method: x.method ?? 'BKASH',
          provider: x.provider ?? 'bkash',
          purpose: x.purpose ?? 'ORDER',
          status: 'INITIATED',
          amountMinor: x.amountMinor ?? 150_000,
          currency: 'BDT',
          idempotencyKey: x.key ?? `test-pay-${seq}`,
          statusAt: x.createdAt ?? clock.now,
          createdAt: x.createdAt ?? clock.now,
        },
        select: { id: true },
      });
    },
  };
}
