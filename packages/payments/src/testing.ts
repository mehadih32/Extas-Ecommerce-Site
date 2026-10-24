// The PostgreSQL tests' shared set-up (never imported by app code): a throwaway database with the real migrations, two
// sample stores, the permission catalogue, a settings reader on the registry's defaults with per-test overrides, a
// clock, a staff member with every payments permission and one who may only look, and stored orders with made-up
// lines and money in the state given (as the checkout and the order service store them). Every value is made up.
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
          placedAt: clock.now,
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
