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
  };
}
