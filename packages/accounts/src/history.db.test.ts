// S05 · PR 150 — the whole order history and one order's life on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): every order reachable page by page, each group counted, his orders only; "What happened"
// only for the customer whose order it is, with the pieces named as the order stored them. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { orderCards, orderHistory, orderLifecycle } from './index';
import { setUpAccounts, type AccountsFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 150 · the whole order history', () => {
  let f: AccountsFixture;
  let me: { id: string };
  let other: { id: string };

  beforeAll(async () => {
    f = await setUpAccounts('accounts_history');
    me = await f.customer('+8801700000150', f.A, 'Karim Ahmed');
    other = await f.customer('+8801700000151');
    // seven of his orders, an hour apart: four on their way, two delivered, one cancelled; one of another customer's
    const states = ['CONFIRMED', 'DELIVERED', 'PLACED', 'CANCELLED', 'IN_TRANSIT', 'DELIVERED', 'PACKED'] as const;
    for (const [i, status] of states.entries()) await f.order({ customerId: me.id, number: `H-${i + 1}`, status, placedAt: new Date(Date.UTC(2026, 9, 20, i)) });
    await f.order({ customerId: other.id, number: 'H-OTHER', status: 'DELIVERED' });
  });
  afterAll(async () => f?.t.drop());

  it('a page at a time, newest first: every one of his orders is on exactly one page', async () => {
    f.overrides.set('account.lists', { orders: 3, walletEntries: 20, newIn: 8 });
    const pages = [];
    for (let page = 1; page <= 3; page++) pages.push(await orderHistory(f.deps(), { storeId: f.A, customerId: me.id, page }));
    expect(pages.map((p) => p.cards.map((c) => c.number))).toEqual([
      ['H-7', 'H-6', 'H-5'],
      ['H-4', 'H-3', 'H-2'],
      ['H-1'],
    ]);
    expect(pages[0]).toMatchObject({ show: 'all', page: 1, pages: 3, perPage: 3, counts: { all: 7, open: 4, delivered: 2, ended: 1 } });
    // a page past the end is the last one; the first page is the old order cards
    expect((await orderHistory(f.deps(), { storeId: f.A, customerId: me.id, page: 99 })).page).toBe(3);
    expect((await orderCards(f.deps(), { storeId: f.A, customerId: me.id })).map((c) => c.number)).toEqual(['H-7', 'H-6', 'H-5']);
    f.overrides.delete('account.lists');
  });

  it('one group at a time, from the stored state: on the way, delivered, cancelled & returned', async () => {
    const of = async (show: 'open' | 'delivered' | 'ended') => (await orderHistory(f.deps(), { storeId: f.A, customerId: me.id, show })).cards.map((c) => c.number);
    expect(await of('open')).toEqual(['H-7', 'H-5', 'H-3', 'H-1']);
    expect(await of('delivered')).toEqual(['H-6', 'H-2']);
    expect(await of('ended')).toEqual(['H-4']);
    // another customer's orders, another store's and a nobody's history are never in it
    const none = await orderHistory(f.deps(), { storeId: f.A, customerId: other.id, show: 'ended' });
    expect(none).toMatchObject({ cards: [], page: 1, pages: 1, counts: { all: 1, delivered: 1, ended: 0 } });
    expect(await orderHistory(f.deps(), { storeId: f.B, customerId: me.id })).toMatchObject({ cards: [], counts: { all: 0 } });
  });

  it('"What happened": only for his account or the browser that placed it, his and the team\'s changes, never the team\'s own rows', async () => {
    const o = await f.order({ customerId: me.id, number: 'H-LIFE', status: 'CONFIRMED', visitorId: 'v-150', placedAt: new Date('2026-10-22T06:00:00Z'), times: { confirmedAt: new Date('2026-10-22T08:00:00Z') } });
    const added = await f.t.prisma.orderItem.create({ data: { storeId: f.A, orderId: o.id, sku: 'SKU-B', productName: 'Leather Belt', colourName: 'Black', sizeLabel: null, quantity: 1, unitPriceMinor: 50_000, lineTotalMinor: 50_000, isAddOn: true }, select: { id: true } });
    const row = (type: string, at: string, actorType: 'CUSTOMER' | 'STAFF' | 'SYSTEM', data: object) =>
      f.t.prisma.orderEvent.create({ data: { storeId: f.A, orderId: o.id, type, actorType, source: 'test', data, createdAt: new Date(at) } });
    await row('order.addLine', '2026-10-22T06:30:00Z', 'CUSTOMER', { itemId: added.id, sku: 'SKU-B' });
    await row('order.note', '2026-10-22T06:40:00Z', 'STAFF', { noteId: 'n-1', isInternal: true });
    await row('order.hold', '2026-10-22T06:50:00Z', 'STAFF', { reason: 'made-up internal reason' });
    await row('order.edit', '2026-10-22T09:00:00Z', 'STAFF', { fields: [{ field: 'address', before: 'House 4', after: 'House 9' }], lines: [] });
    const life = await orderLifecycle(f.deps(), { storeId: f.A, number: 'H-LIFE', customerId: me.id, visitorId: null });
    expect(life?.map((s) => [s.kind, s.by])).toEqual([
      ['placed', null],
      ['added', 'you'],
      ['confirmed', 'shop'],
      ['edited', 'shop'],
    ]);
    expect(life?.[1]?.lines).toEqual([{ from: 'Leather Belt · Black', to: null }]);
    expect(JSON.stringify(life)).not.toMatch(/internal|House 9/);
    // the browser that placed it sees it too; another customer, another browser and another store do not
    expect(await orderLifecycle(f.deps(), { storeId: f.A, number: 'H-LIFE', customerId: null, visitorId: 'v-150' })).toHaveLength(4);
    expect(await orderLifecycle(f.deps(), { storeId: f.A, number: 'H-LIFE', customerId: other.id, visitorId: 'v-other' })).toBeNull();
    expect(await orderLifecycle(f.deps(), { storeId: f.A, number: 'H-LIFE', customerId: null, visitorId: null })).toBeNull();
    expect(await orderLifecycle(f.deps(), { storeId: f.B, number: 'H-LIFE', customerId: me.id, visitorId: null })).toBeNull();
    expect(await orderLifecycle(f.deps(), { storeId: f.A, number: 'NO-SUCH', customerId: me.id, visitorId: null })).toBeNull();
  });
});
