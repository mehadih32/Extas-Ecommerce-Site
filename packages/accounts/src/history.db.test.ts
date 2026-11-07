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
  it('follow-up 303: with the courier\'s news on, his parcel\'s own steps; never an exchange\'s parcel, and nothing read while it is off', async () => {
    const db = f.t.prisma;
    const o = await f.order({ customerId: me.id, number: 'H-303', status: 'IN_TRANSIT', placedAt: new Date('2026-10-24T06:00:00Z'), times: { handedOverAt: new Date('2026-10-24T11:00:00Z') } });
    const courier = await db.courierAccount.create({ data: { storeId: f.A, providerKey: 'mock', name: 'Test courier 303', enabled: true } });
    const ship = (key: string, exchange: boolean) =>
      db.shipment.create({ data: { storeId: f.A, orderId: o.id, courierAccountId: courier.id, status: 'OUT_FOR_DELIVERY', bookedAt: new Date('2026-10-24T10:00:00Z'), idempotencyKey: key, isExchangeLeg: exchange } });
    const s = await ship('h303-a', false);
    const x = await ship('h303-x', true);
    for (const [sh, status, at, note] of [
      [s, 'IN_TRANSIT', '2026-10-24T12:00:00Z', null],
      [s, 'OUT_FOR_DELIVERY', '2026-10-25T08:00:00Z', 'rider: gate locked'],
      [s, 'ATTEMPT_FAILED', '2026-10-25T13:00:00Z', 'rider: customer did not pick up'],
      [x, 'OUT_FOR_DELIVERY', '2026-10-25T09:00:00Z', null],
    ] as const)
      await db.shipmentEvent.create({ data: { storeId: f.A, shipmentId: sh.id, status, occurredAt: new Date(at), riderNote: note } });
    const of = (courierRule?: { enabled: boolean; exceptions: boolean }) => orderLifecycle(f.deps(), { storeId: f.A, number: 'H-303', customerId: me.id, visitorId: null, courier: courierRule });
    expect((await of({ enabled: true, exceptions: true }))?.map((r) => [r.kind, r.at])).toEqual([
      ['placed', '2026-10-24T06:00:00.000Z'],
      ['courierBooked', '2026-10-24T10:00:00.000Z'],
      ['courier', '2026-10-24T11:00:00.000Z'],
      ['outForDelivery', '2026-10-25T08:00:00.000Z'],
      ['tryFailed', '2026-10-25T13:00:00.000Z'],
    ]);
    expect(JSON.stringify(await of({ enabled: true, exceptions: true }))).not.toMatch(/rider|gate/);
    expect((await of({ enabled: true, exceptions: false }))?.map((r) => r.kind)).toEqual(['placed', 'courierBooked', 'courier', 'outForDelivery']);
    expect((await of({ enabled: false, exceptions: true }))?.map((r) => r.kind)).toEqual(['placed', 'courier']);
    expect((await of())?.map((r) => r.kind)).toEqual(['placed', 'courier']);
  });
  it('follow-up 300: on the Bengali page the pieces in "What happened" carry the product and colour names in Bengali', async () => {
    const db = f.t.prisma;
    const navy = await db.colour.create({ data: { storeId: f.A, key: 'navy-300', nameEn: 'Navy', nameBn: 'নেভি', hex: '#1F2A44' } });
    const [m, l] = [await db.size.create({ data: { storeId: f.A, key: 'm-300', label: 'M', sortOrder: 1 } }), await db.size.create({ data: { storeId: f.A, key: 'l-300', label: 'L', sortOrder: 2 } })];
    const polo = await db.product.create({ data: { storeId: f.A, slug: 'sample-polo-300', nameEn: 'Sample Polo', nameBn: 'স্যাম্পল পোলো' } });
    const vm = await db.productVariant.create({ data: { storeId: f.A, productId: polo.id, colourId: navy.id, sizeId: m.id, sku: 'SP300-M', priceMinor: 100_000 } });
    await db.productVariant.create({ data: { storeId: f.A, productId: polo.id, colourId: navy.id, sizeId: l.id, sku: 'SP300-L', priceMinor: 100_000 } });
    const o = await f.order({ customerId: me.id, number: 'H-BN', status: 'CONFIRMED', placedAt: new Date('2026-10-23T06:00:00Z') });
    // the line now holds the L the team changed it to; the timeline row keeps the M it was
    const line = await db.orderItem.create({ data: { storeId: f.A, orderId: o.id, variantId: vm.id, sku: 'SP300-L', productName: 'Sample Polo', colourName: 'Navy', sizeLabel: 'L', quantity: 1, unitPriceMinor: 100_000, lineTotalMinor: 100_000 } });
    const added = await db.orderItem.create({ data: { storeId: f.A, orderId: o.id, variantId: vm.id, sku: 'SP300-M', productName: 'Sample Polo', colourName: 'Navy', sizeLabel: 'M', quantity: 1, unitPriceMinor: 100_000, lineTotalMinor: 100_000, isAddOn: true } });
    const row = (type: string, at: string, data: object) => db.orderEvent.create({ data: { storeId: f.A, orderId: o.id, type, actorType: 'STAFF', source: 'test', data, createdAt: new Date(at) } });
    await row('order.addLine', '2026-10-23T07:00:00Z', { itemId: added.id, sku: 'SP300-M' });
    await row('order.edit', '2026-10-23T08:00:00Z', { fields: [], lines: [{ lineId: line.id, kind: 'size', sku: 'SP300-M', label: 'Sample Polo · Navy · M', toSku: 'SP300-L', toLabel: 'Sample Polo · Navy · L', quantity: 1, lineTotalMinor: 100_000 }] });
    const of = async (lang?: 'en' | 'bn') => (await orderLifecycle(f.deps(), { storeId: f.A, number: 'H-BN', customerId: me.id, visitorId: null, lang }))!.flatMap((s) => s.lines ?? []);
    expect(await of('bn')).toEqual([
      { from: 'স্যাম্পল পোলো · নেভি · M', to: null },
      { from: 'স্যাম্পল পোলো · নেভি · M', to: 'স্যাম্পল পোলো · নেভি · L' },
    ]);
    // English (and no language) reads as the order stored it
    const en = [
      { from: 'Sample Polo · Navy · M', to: null },
      { from: 'Sample Polo · Navy · M', to: 'Sample Polo · Navy · L' },
    ];
    expect(await of('en')).toEqual(en);
    expect(await of()).toEqual(en);
    // a product without a Bengali name keeps the stored English one on the Bengali page
    await db.product.update({ where: { id: polo.id }, data: { nameBn: null } });
    expect((await of('bn'))[0]).toEqual({ from: 'Sample Polo · নেভি · M', to: null });
  });
});
