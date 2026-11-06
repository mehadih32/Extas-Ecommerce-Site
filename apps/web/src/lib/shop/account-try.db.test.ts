// PR 131 (follow-up 179) — the test pages' sample sign-in on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): two device-gate pages filling at once on a fresh database both get a session for the one
// sample customer with his one sample order, never a unique-key error (CI saw HTTP 500 on the first phone size).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { orderHistory } from '@extas/accounts';
import { TRY_ACCOUNT_PHONE, TRY_HISTORY_PREFIX, TRY_ORDER_NUMBER, tryHistoryOrders, trySignIn } from './account-try';

describe.skipIf(!HAS_TEST_DB)('the sample sign-in for test pages on PostgreSQL (follow-up 179)', () => {
  let t: TestDatabase;
  let S = 0;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('account_try');
    S = (await seedSample(t.prisma)).storeId;
    await disconnectPrisma();
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    await t?.drop();
  });

  it('makes the sample customer and order once when four fills race, and signs every one in', async () => {
    const a = { db: t.prisma, settings };
    const runs = await Promise.allSettled(Array.from({ length: 4 }, () => trySignIn(a, { storeId: S }, { source: 'test' })));
    expect(runs.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect(await t.prisma.customer.count({ where: { storeId: S, phone: TRY_ACCOUNT_PHONE } })).toBe(1);
    expect(await t.prisma.order.count({ where: { storeId: S, number: TRY_ORDER_NUMBER } })).toBe(1);
  });
  it('follow-up 301: the history fill gives him one page more than a full one, once, so the pager is measured', async () => {
    const a = { db: t.prisma, settings };
    await trySignIn(a, { storeId: S }, { source: 'test' });
    await Promise.all([tryHistoryOrders(a, S), tryHistoryOrders(a, S)]);
    const perPage = registry['account.lists'].default.orders;
    expect(await t.prisma.order.count({ where: { storeId: S, number: { startsWith: TRY_HISTORY_PREFIX } } })).toBe(perPage + 1);
    const me = await t.prisma.customer.findUniqueOrThrow({ where: { storeId_phone: { storeId: S, phone: TRY_ACCOUNT_PHONE } }, select: { id: true } });
    const h = await orderHistory({ db: t.prisma, settings } as never, { storeId: S, customerId: me.id });
    expect(h.pages).toBeGreaterThan(1);
    expect(h.cards).toHaveLength(perPage);
    // the sample orders the other gate pages open stay the newest
    expect(h.cards[0]?.number).toMatch(/^TRY-(131|65)$/);
  });
});
