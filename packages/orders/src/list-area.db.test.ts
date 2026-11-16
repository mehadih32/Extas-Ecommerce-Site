// S29 · PR 754 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the order list filtered by a delivery area
// (the Geography map's "Open these orders") — the place itself and every place under it, nothing from another place,
// and the filter never shows another store's orders. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { listOrders } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 754 · the order list filtered by a delivery area (PostgreSQL)', () => {
  let f: OrdersFixture;
  const g: Record<string, string> = {};
  const db = () => f.t.prisma;

  async function place(key: string, level: 'DIVISION' | 'DISTRICT' | 'UPAZILA', nameEn: string, parent: string | null) {
    const up = parent ? await db().geoArea.findUniqueOrThrow({ where: { id: g[parent]! } }) : null;
    g[key] = (await db().geoArea.create({ data: { level, nameEn, code: `test754.${key}`, parentId: up?.id ?? null, ancestorIds: up ? [...up.ancestorIds, up.id] : [], aliases: [], postcodes: [] } })).id;
  }

  beforeAll(async () => {
    f = await setUpOrders('list-area');
    await place('dhkDiv', 'DIVISION', 'Dhaka', null);
    await place('dhk', 'DISTRICT', 'Dhaka', 'dhkDiv');
    await place('savar', 'UPAZILA', 'Savar', 'dhk');
    await place('rajDiv', 'DIVISION', 'Rajshahi', null);
    await place('bogura', 'DISTRICT', 'Bogura', 'rajDiv');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the place and every place under it; another place and an order with no area stay out', async () => {
    const inSavar = await f.place('la-savar', { phone: '01700000701' });
    const inDhaka = await f.place('la-dhk', { phone: '01700000702' });
    const inBogura = await f.place('la-bogura', { phone: '01700000703' });
    const none = await f.place('la-none', { phone: '01700000704' });
    await db().order.update({ where: { id: inSavar.orderId }, data: { areaId: g.savar! } });
    await db().order.update({ where: { id: inDhaka.orderId }, data: { areaId: g.dhk! } });
    await db().order.update({ where: { id: inBogura.orderId }, data: { areaId: g.bogura! } });
    const ids = async (area: string) => (await listOrders(f.ordersDeps(), f.staff, { view: 'all', limit: 100, area })).rows.map((r) => r.id).sort();
    expect(await ids(g.savar!)).toEqual([inSavar.orderId].sort());
    expect(await ids(g.dhk!)).toEqual([inSavar.orderId, inDhaka.orderId].sort());
    expect(await ids(g.dhkDiv!)).toEqual([inSavar.orderId, inDhaka.orderId].sort());
    expect(await ids(g.bogura!)).toEqual([inBogura.orderId]);
    const all = (await listOrders(f.ordersDeps(), f.staff, { view: 'all', limit: 100 })).rows.map((r) => r.id);
    expect(all).toContain(none.orderId);
  });
});
