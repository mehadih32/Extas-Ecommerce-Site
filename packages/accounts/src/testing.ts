// The PostgreSQL tests' shared set-up (never imported by app code): a throwaway database with the real migrations, two
// sample stores, a settings reader on the registry's defaults with per-test overrides, a clock, and the mock SMS sender
// whose outbox the tests read. Every value is a made-up test value.
import { mockSmsAdapter, mockSmsOutbox } from '@extas/adapters';
import { createTestDatabase, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import type { AccountsDeps, SettingsReader } from './context';

export interface AccountsFixture {
  t: TestDatabase;
  A: number;
  B: number;
  overrides: Map<string, unknown>;
  clock: { now: Date };
  deps: () => AccountsDeps;
  advance: (ms: number) => void;
  /** The newest code the mock sent to a number (+880…), or null. */
  lastCode: (phone: string) => string | null;
  /** A customer as an order makes one (no credential). */
  customer: (phone: string, storeId?: number, name?: string) => Promise<{ id: string }>;
  /** A stored order with made-up lines, in the state and times given (as S05 will store them). */
  order: (o: OrderSpec) => Promise<{ id: string; number: string }>;
}

export interface OrderSpec {
  customerId: string | null;
  number: string;
  storeId?: number;
  status?: 'PLACED' | 'CONFIRMED' | 'PACKED' | 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
  placedAt?: Date;
  times?: Partial<Record<'confirmedAt' | 'packedAt' | 'handedOverAt' | 'deliveredAt' | 'cancelledAt' | 'returnedAt', Date>>;
  visitorId?: string | null;
  lines?: { name: string; quantity?: number; amountMinor: number; isAddOn?: boolean; setKey?: string; status?: 'ACTIVE' | 'REMOVED' }[];
  money?: Partial<Record<'deliveryChargeMinor' | 'discountMinor' | 'walletAppliedMinor' | 'paidMinor' | 'codAmountMinor', number>>;
  paymentMethod?: 'COD' | 'BKASH' | 'WALLET';
  bandId?: string | null;
  address?: string;
}

export async function setUpAccounts(label: string): Promise<AccountsFixture> {
  const t = await createTestDatabase(label);
  const [A, B] = await seedSampleStores(t.prisma);
  const overrides = new Map<string, unknown>();
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const clock = { now: new Date('2026-10-23T06:00:00Z') };
  const sender = await mockSmsAdapter.mock({ mode: 'MOCK', config: {}, storeId: null, secret: async () => null });
  const deps = (): AccountsDeps => ({ db: t.prisma, settings, now: () => clock.now, sms: async () => ({ sender, mode: 'MOCK' }) });
  return {
    t,
    A,
    B,
    overrides,
    clock,
    deps,
    advance: (ms) => {
      clock.now = new Date(clock.now.getTime() + ms);
    },
    lastCode: (phone) => mockSmsOutbox.lastTo(phone)?.text.match(/\d{4,8}/)?.[0] ?? null,
    customer: (phone, storeId = A, name = 'Test Customer') => t.prisma.customer.create({ data: { storeId, phone, name }, select: { id: true } }),
    async order(o) {
      const lines = o.lines ?? [{ name: 'Sample Polo', amountMinor: 150_000 }];
      const subtotal = lines.filter((l) => (l.status ?? 'ACTIVE') === 'ACTIVE').reduce((s, l) => s + l.amountMinor, 0);
      const m = { deliveryChargeMinor: 0, discountMinor: 0, walletAppliedMinor: 0, paidMinor: 0, ...o.money }; // hardcode-ok: test fixture, made-up amounts
      const total = subtotal + m.deliveryChargeMinor - m.discountMinor;
      return t.prisma.order.create({
        data: {
          storeId: o.storeId ?? A,
          number: o.number,
          customerId: o.customerId,
          status: o.status ?? 'PLACED',
          source: 'WEBSITE',
          currency: 'BDT',
          placedAt: o.placedAt ?? clock.now,
          ...o.times,
          visitorId: o.visitorId ?? null,
          customerName: 'Test Customer',
          phone: '+8801700000134', // hardcode-ok: test fixture, a made-up number
          shippingAddressText: o.address ?? 'House 4, Road 5, Sample Area',
          deliveryBandId: o.bandId ?? null,
          subtotalMinor: subtotal,
          ...m,
          codAmountMinor: m.codAmountMinor ?? (o.paymentMethod === 'COD' || !o.paymentMethod ? Math.max(0, total - m.walletAppliedMinor - m.paidMinor) : 0),
          totalMinor: total,
          paymentMethod: o.paymentMethod ?? 'COD',
          idempotencyKey: `test-${o.number}`,
          items: {
            create: lines.map((l, i) => ({
              storeId: o.storeId ?? A,
              sku: `SKU-${i}`,
              productName: l.name,
              colourName: 'Navy',
              sizeLabel: 'M',
              quantity: l.quantity ?? 1,
              unitPriceMinor: l.amountMinor,
              lineTotalMinor: l.amountMinor,
              isAddOn: l.isAddOn ?? false,
              comboGroupKey: l.setKey ?? null,
              status: l.status ?? 'ACTIVE',
              createdAt: new Date(clock.now.getTime() + i),
            })),
          },
        },
        select: { id: true, number: true },
      });
    },
  };
}
