// PR 158 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the address facts read against the sample
// gazetteer — a settled place with its district, an address no place settles, the place a number is known by (its latest
// delivered order when it has no saved address) and the refused parcels to the same place. A read: nothing changes.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { ADDRESS_FACTS_SELECT, areaMismatch, phoneOrders, placeFactsOf } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 158 · address and zone facts (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const read = (orderId: string) => db().order.findUniqueOrThrow({ where: { id: orderId }, select: ADDRESS_FACTS_SELECT });

  beforeAll(async () => {
    f = await setUpOrders('address_facts');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the stored place in the gazetteer with its district; an address no place settles', async () => {
    const home = await f.place('af-1', { phone: '01700000401' });
    const o = await read(home.orderId);
    const here = await placeFactsOf(f.ordersDeps(), f.S, o, [], { refusals: false });
    expect(here.address).toMatchObject({ delivery: true, resolved: true, district: { name: { en: 'Dhaka' } } });
    expect(here.address.area).not.toBeNull();
    expect(here.known).toBeNull(); // a first order, no saved address
    const lost = await f.place('af-2', { phone: '01700000402', address: 'Behind the big tree near the pond' });
    const away = await placeFactsOf(f.ordersDeps(), f.S, await read(lost.orderId), [], { refusals: false });
    expect(away.address).toMatchObject({ delivery: true, resolved: false, area: null, district: null });
  });

  it('the place the number is known by (its latest delivered order), another district now, and refusals at the same place', async () => {
    const phone = '01700000403';
    const first = await f.place('af-3', { phone });
    await db().order.update({ where: { id: first.orderId }, data: { status: 'DELIVERED' } });
    const refused = await f.place('af-4', { phone: '01700000404', address: 'House 9, Sherpur Road, Bogura Sadar, Bogura' });
    await db().order.update({ where: { id: refused.orderId }, data: { status: 'RETURNED' } });
    await db().orderEvent.create({ data: { storeId: f.S, orderId: refused.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: 'changed-mind', actorType: 'COURIER', source: 'courier' } });
    const now = await f.place('af-5', { phone, address: 'House 9, Sherpur Road, Bogura Sadar, Bogura' });
    const o = await read(now.orderId);
    const past = await phoneOrders(f.ordersDeps(), f.S, phone, { excludeOrderId: o.id, before: o.placedAt, take: 50 });
    const p = await placeFactsOf(f.ordersDeps(), f.S, o, past, { refusals: true });
    expect(p.known).toMatchObject({ from: 'order', district: { name: { en: 'Dhaka' } } });
    expect(p.address.district).toMatchObject({ name: { en: 'Bogura' } });
    expect(areaMismatch(p.address, p.known, 'district')).toMatchObject({ known: 'Dhaka', now: 'Bogura', from: 'order' });
    expect(p.placeRefusals).toEqual([{ at: expect.any(Date), refusalKey: 'changed-mind' }]);
    // not asked for: not read
    expect((await placeFactsOf(f.ordersDeps(), f.S, o, past, { refusals: false })).placeRefusals).toEqual([]);
  });
});
