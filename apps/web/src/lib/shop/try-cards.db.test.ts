// Follow-ups 260, 261 — the test pages' card fill on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the
// sample customer's two-size order is made once (fills racing), checked once, and under the trial settings his order
// page has the edit card open and the two-size question asked — while the store's own settings stay off and untouched.
// The door and its cookie are shut on a live shop.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import { customerEditState, customerTwoSizeState } from '@extas/orders';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { trySignIn } from './account-try';
import { cardsTrialSettings, TRY_CARDS_COOKIE, TRY_TWO_SIZE_ORDER, tryCardsOnRequest, tryTwoSizeOrder } from './try-cards';

describe.skipIf(!HAS_TEST_DB)('the order page cards fill for test pages on PostgreSQL (follow-ups 260, 261)', () => {
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

  it('makes the two-size order once when fills race, asks its question once, and the cards open only under the trial', async () => {
    const a = { db: t.prisma, settings };
    await trySignIn(a, { storeId: S }, { source: 'test' });
    const runs = await Promise.allSettled(Array.from({ length: 3 }, () => tryTwoSizeOrder(a, S)));
    expect(runs.map((r) => (r.status === 'fulfilled' ? r.value : String(r.reason)))).toEqual([true, true, true]);
    const order = await t.prisma.order.findUniqueOrThrow({ where: { storeId_number: { storeId: S, number: TRY_TWO_SIZE_ORDER } }, select: { id: true, customerId: true, flags: true, twoSizeStatus: true } });
    expect(order).toMatchObject({ twoSizeStatus: 'ASKED', flags: expect.arrayContaining(['TWO_SIZES']) });
    expect(await t.prisma.orderEvent.count({ where: { orderId: order.id, type: 'order.twoSizeCheck' } })).toBe(1);
    const who = { storeId: S, customerId: order.customerId, visitorId: null };
    // the store's own settings: both off, so the page offers nothing
    const off = { db: t.prisma, settings };
    expect(await customerEditState(off, who, TRY_TWO_SIZE_ORDER)).toMatchObject({ open: false, closed: 'OFF' });
    expect(await customerTwoSizeState(off, who, TRY_TWO_SIZE_ORDER)).toEqual({ open: false, questions: [] });
    // the trial: the edit is open with a size row per piece, and the question has the two sizes
    const on = { db: t.prisma, settings: cardsTrialSettings(settings) };
    const edit = await customerEditState(on, who, TRY_TWO_SIZE_ORDER);
    expect(edit).toMatchObject({ open: true, closed: null, editsLeft: 2 });
    expect(edit.lines).toHaveLength(2);
    expect(edit.lines.every((l) => l.choices.filter((x) => x.current).length === 1)).toBe(true);
    const two = await customerTwoSizeState(on, who, TRY_TWO_SIZE_ORDER);
    expect(two.open).toBe(true);
    expect(two.questions[0]!.sizes).toHaveLength(2);
    // nothing was written to the store's settings
    expect(await t.prisma.storeSettingValue.count({ where: { key: { in: ['orders.edit.customer', 'orders.twoSize'] } } })).toBe(0);
    expect(await t.prisma.installationSettingValue.count({ where: { key: { in: ['orders.edit.customer', 'orders.twoSize'] } } })).toBe(0);
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
