// Follow-up 260 — the test pages' card fill on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): under the
// trial settings the sample customer's order page has the edit card, while the store's own setting stays off and
// untouched. The door and its cookie are shut on a live shop.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import { customerEditState } from '@extas/orders';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { trySignIn, TRY_ORDER_NUMBER } from './account-try';
import { cardsTrialSettings, TRY_CARDS_COOKIE, tryCardsOnRequest } from './try-cards';

describe.skipIf(!HAS_TEST_DB)('the order page cards fill for test pages on PostgreSQL (follow-up 260)', () => {
  let t: TestDatabase;
  let S = 0;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('try_cards');
    S = (await seedSample(t.prisma)).storeId;
    await disconnectPrisma();
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    await t?.drop();
  });

  it('the edit card is there only under the trial, and nothing is written to the settings', async () => {
    const a = { db: t.prisma, settings };
    await trySignIn(a, { storeId: S }, { source: 'test' });
    const order = await t.prisma.order.findUniqueOrThrow({ where: { storeId_number: { storeId: S, number: TRY_ORDER_NUMBER } }, select: { customerId: true } });
    const who = { storeId: S, customerId: order.customerId, visitorId: null };
    // the store's own setting: off, so the page offers nothing
    expect(await customerEditState({ db: t.prisma, settings }, who, TRY_ORDER_NUMBER)).toMatchObject({ open: false, closed: 'OFF' });
    // the trial: the card is drawn (open, or closed with its reason)
    const edit = await customerEditState({ db: t.prisma, settings: cardsTrialSettings(settings) }, who, TRY_ORDER_NUMBER);
    expect(edit.closed).not.toBe('OFF');
    expect(await t.prisma.storeSettingValue.count({ where: { key: 'orders.edit.customer' } })).toBe(0);
    expect(await t.prisma.installationSettingValue.count({ where: { key: 'orders.edit.customer' } })).toBe(0);
  });

  it('the cookie is read only on a test server', () => {
    const was = process.env.EXTAS_SHOP_TEST_PAGES;
    const req = new Request('http://shop.test/api/account/edit', { headers: { cookie: `${TRY_CARDS_COOKIE}=1` } });
    try {
      delete process.env.EXTAS_SHOP_TEST_PAGES;
      expect(tryCardsOnRequest(req)).toBe(false);
      process.env.EXTAS_SHOP_TEST_PAGES = '1';
      expect(tryCardsOnRequest(req)).toBe(true);
      expect(tryCardsOnRequest(new Request('http://shop.test/'))).toBe(false);
    } finally {
      if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
      else process.env.EXTAS_SHOP_TEST_PAGES = was;
    }
  });
});
