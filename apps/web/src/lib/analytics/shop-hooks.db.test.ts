// S15 · PR 338 — the bag-add and purchase analytics hooks on a real PostgreSQL (a throwaway database; skipped
// without TEST_DATABASE_ADMIN_URL), called the way bag-api.ts / checkout-api.ts call them: with an explicit visitor
// cookie, never a browser's own say-so for identity. Mirrors lib/tracking/tracking.db.test.ts's own trackAddToBag
// tests (same call shape, a sibling record).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { BAG_COOKIE } from '../shop/bag-model';
import { recordAddToBagAnalytics, recordPurchaseAnalytics, type ShopAnalyticsDeps } from './shop-hooks';

const VISITOR = 'visitor-pr338-aaaaaaaaaaaaaaaa';

describe.skipIf(!HAS_TEST_DB)('the bag-add and purchase analytics hooks (PR 338)', () => {
  let t: TestDatabase;
  let A = 0;
  const overrides = new Map<string, unknown>();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): ShopAnalyticsDeps => ({ analytics: { db: t.prisma }, accounts: null, resolver: settings });
  const req = (cookie?: string) => new Request('https://shop.example.test/api/bag/lines', { method: 'POST', headers: cookie ? { cookie } : {} });

  beforeAll(async () => {
    t = await createTestDatabase('analytics_shop_hooks_338');
    [A] = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());
  afterAll(() => overrides.clear());

  it('records add_to_bag with the variant and quantity, guest (no accounts deps)', async () => {
    await recordAddToBagAnalytics(req(`${BAG_COOKIE}=${VISITOR}`), { storeId: A, variantId: 'v-pr338-1', quantity: 3 }, deps());
    const row = await t.prisma.analyticsEvent.findFirstOrThrow({ where: { storeId: A, visitorId: VISITOR, name: 'add_to_bag' } });
    expect(row).toMatchObject({ isLoggedIn: false, customerId: null, sourceButton: 'bag_api', props: { variantId: 'v-pr338-1', quantity: 3 } });
  });

  it('records purchase with the order id and number', async () => {
    await recordPurchaseAnalytics(req(`${BAG_COOKIE}=${VISITOR}`), { storeId: A, orderId: 'ord-pr338-1', number: 'EX-338001' }, deps());
    const row = await t.prisma.analyticsEvent.findFirstOrThrow({ where: { storeId: A, visitorId: VISITOR, name: 'purchase' } });
    expect(row.props).toMatchObject({ orderId: 'ord-pr338-1', number: 'EX-338001' });
  });

  it('with no visitor cookie at all: nothing is recorded (there is no one to attach it to)', async () => {
    const before = await t.prisma.analyticsEvent.count({ where: { storeId: A } });
    await recordAddToBagAnalytics(req(), { storeId: A, variantId: 'v-pr338-2', quantity: 1 }, deps());
    expect(await t.prisma.analyticsEvent.count({ where: { storeId: A } })).toBe(before);
  });

  it('the master switch off: nothing is recorded', async () => {
    overrides.set('analytics.events', { on: false });
    const before = await t.prisma.analyticsEvent.count({ where: { storeId: A } });
    await recordAddToBagAnalytics(req(`${BAG_COOKIE}=${VISITOR}`), { storeId: A, variantId: 'v-pr338-3', quantity: 1 }, deps());
    await recordPurchaseAnalytics(req(`${BAG_COOKIE}=${VISITOR}`), { storeId: A, orderId: 'ord-pr338-2', number: 'EX-338002' }, deps());
    expect(await t.prisma.analyticsEvent.count({ where: { storeId: A } })).toBe(before);
    overrides.delete('analytics.events');
  });

  it('with no deps (no database configured): never throws', async () => {
    await expect(recordAddToBagAnalytics(req(`${BAG_COOKIE}=${VISITOR}`), { storeId: A, variantId: 'v', quantity: 1 }, null)).resolves.toBeUndefined();
  });
});
