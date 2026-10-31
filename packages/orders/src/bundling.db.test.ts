// PR 522 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): one parcel for one person's orders. Off as
// shipped, and nothing happens until the owner sets the window. On, a new order finds the same person's other open orders
// (the same number, or the same identity under another number) to the same address (case, spaces and punctuation aside)
// within the window; a gift, a booked order, another address or an older order stay out. "Propose" marks the order for
// a person; "One parcel" (`orders.merge`) groups them with a note, each order on its timeline and in the audit, the mark
// gone; "group" does it by itself and a later order joins the same parcel, never past the owner's most orders. Lines,
// prices, charges and the status never change. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry, riskRulesSettings } from '@extas/settings';
import { addressKey, BUNDLE_FLAG, BUNDLE_PROPOSED_EVENT, BUNDLED_EVENT, bundleOnOrder, bundleOrder, linkIdentity, parcelMates } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 522 · one parcel for one person (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const set = (v: Partial<(typeof registry)['risk.bundling']['default']>) => f.overrides.set('risk.bundling', { ...registry['risk.bundling'].default, ...v });
  const row = (id: string) => db().order.findUniqueOrThrow({ where: { id }, select: { flags: true, orderGroupId: true, status: true, totalMinor: true, version: true } });

  beforeAll(async () => {
    f = await setUpOrders('bundling');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the address key ignores case, spaces and punctuation', () => {
    expect(addressKey('House 4, Road 7,  Uttara  ')).toBe(addressKey('house 4 road 7 uttara'));
    expect(addressKey('House 4, Road 7')).not.toBe(addressKey('House 5, Road 7'));
    expect(addressKey('  ')).toBeNull();
  });

  it('off as shipped, and nothing until the window is set', async () => {
    expect(registry['risk.bundling'].default).toEqual({ enabled: false, windowHours: null, action: 'propose', maxOrders: 5 });
    await f.place('bn-off-1', { phone: '01700000801' });
    const b = await f.place('bn-off-2', { phone: '01700000801' });
    expect(await bundleOnOrder(f.ordersDeps(), ref(b.orderId))).toBeNull();
    set({ enabled: true });
    expect(await bundleOnOrder(f.ordersDeps(), ref(b.orderId))).toBeNull();
    expect((await row(b.orderId)).flags).not.toContain(BUNDLE_FLAG);
  });

  it('propose: the same number and address within the window; a person presses "One parcel"; money and status stay', async () => {
    set({ enabled: true, windowHours: 2 });
    const addr = 'House 9, Road 2, Mirpur 10, Dhaka';
    const old = await f.place('bn-p-old', { phone: '01700000811', address: addr });
    f.clock.now = new Date(f.clock.now.getTime() + 3 * 3_600_000); // the first one is now outside the window
    const a = await f.place('bn-p-a', { phone: '01700000811', address: addr });
    const gift = await f.place('bn-p-gift', { phone: '01700000811', address: addr });
    await db().order.update({ where: { id: gift.orderId }, data: { isGift: true } });
    const elsewhere = await f.place('bn-p-else', { phone: '01700000811', address: 'House 1, Road 1, Banani, Dhaka' });
    const booked = await f.place('bn-p-booked', { phone: '01700000811', address: addr });
    const courier = await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mockCourier', name: 'Test courier', enabled: true } });
    await db().shipment.create({ data: { storeId: f.S, orderId: booked.orderId, courierAccountId: courier.id, status: 'PENDING_PICKUP', idempotencyKey: randomUUID() } });
    const b = await f.place('bn-p-b', { phone: '+8801700000811', address: 'house 9 road 2 mirpur 10 dhaka' });
    const c = await f.place('bn-p-c', { phone: '01700000811', address: addr });

    const p = await bundleOnOrder(f.ordersDeps(), ref(c.orderId));
    expect(p).toMatchObject({ action: 'propose', groupId: null, with: [{ orderId: a.orderId }, { orderId: b.orderId }] });
    expect((await row(c.orderId)).flags).toContain(BUNDLE_FLAG);
    expect((await row(c.orderId)).orderGroupId).toBeNull();
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: c.orderId, type: BUNDLE_PROPOSED_EVENT } });
    expect(ev.data).toMatchObject({ with: [{ number: a.number }, { number: b.number }], windowHours: 2 });
    // once per order
    await bundleOnOrder(f.ordersDeps(), ref(c.orderId));
    expect(await db().orderEvent.count({ where: { orderId: c.orderId, type: BUNDLE_PROPOSED_EVENT } })).toBe(1);

    const before = await Promise.all([a, b, c].map((o) => row(o.orderId)));
    expect(await code(bundleOrder(f.ordersDeps(), f.reader, { orderId: c.orderId }))).toBe('FORBIDDEN');
    const g = await bundleOrder(f.ordersDeps(), f.staff, { orderId: c.orderId, note: 'pack together' });
    expect(g.orders.map((o) => o.orderId).sort()).toEqual([a.orderId, b.orderId, c.orderId].sort());
    const after = await Promise.all([a, b, c].map((o) => row(o.orderId)));
    for (const [i, r] of after.entries()) {
      expect(r).toMatchObject({ orderGroupId: g.groupId, status: before[i]!.status, totalMinor: before[i]!.totalMinor, version: before[i]!.version + 1 });
      expect(r.flags).not.toContain(BUNDLE_FLAG);
    }
    for (const o of [old, gift, elsewhere, booked]) expect((await row(o.orderId)).orderGroupId).toBeNull();
    expect(await db().orderGroup.findUniqueOrThrow({ where: { id: g.groupId } })).toMatchObject({ reason: 'BUNDLE', note: 'pack together' });
    expect(await db().orderEvent.count({ where: { type: BUNDLED_EVENT, orderId: { in: [a.orderId, b.orderId, c.orderId] } } })).toBe(3);
    expect(await db().auditLog.count({ where: { action: 'order.bundle' } })).toBe(3);
    expect(await parcelMates(f.ordersDeps(), f.S, a.orderId)).toMatchObject({ note: 'pack together', reason: 'BUNDLE', orders: [{ orderId: b.orderId }, { orderId: c.orderId }] });
    // nothing left to join
    expect(await code(bundleOrder(f.ordersDeps(), f.staff, { orderId: c.orderId }))).toBe('NOT_MERGEABLE');
  });

  it('group: made by itself with a note naming every order; a later order joins it, never past the most orders', async () => {
    set({ enabled: true, windowHours: 24, action: 'group', maxOrders: 3 });
    const a = await f.place('bn-g-a', { phone: '01700000821' });
    expect(await bundleOnOrder(f.ordersDeps(), ref(a.orderId))).toBeNull(); // alone
    const b = await f.place('bn-g-b', { phone: '01700000821' });
    const g = await bundleOnOrder(f.ordersDeps(), ref(b.orderId));
    expect(g).toMatchObject({ action: 'group', with: [{ orderId: a.orderId }] });
    const group = await db().orderGroup.findUniqueOrThrow({ where: { id: g!.groupId! } });
    expect(group.note).toContain(a.number);
    expect(group.note).toContain(b.number);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: BUNDLED_EVENT } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', data: expect.objectContaining({ auto: true }) });
    const c = await f.place('bn-g-c', { phone: '01700000821' });
    expect(await bundleOnOrder(f.ordersDeps(), ref(c.orderId))).toMatchObject({ groupId: g!.groupId });
    expect(await db().order.count({ where: { orderGroupId: g!.groupId } })).toBe(3);
    const d = await f.place('bn-g-d', { phone: '01700000821' });
    expect(await bundleOnOrder(f.ordersDeps(), ref(d.orderId))).toBeNull(); // the parcel is full
    expect((await row(d.orderId)).orderGroupId).toBeNull();
  });

  it('the same person under another number (the identity), to the same address', async () => {
    f.overrides.set('risk.identity', { ...riskRulesSettings['risk.identity'].default, enabled: true });
    set({ enabled: true, windowHours: 24, action: 'propose' });
    const addr = 'Flat 3B, House 12, Road 5, Dhanmondi, Dhaka';
    const a = await f.place('bn-i-a', { phone: '01700000831', address: addr });
    await linkIdentity(f.ordersDeps(), ref(a.orderId));
    const b = await f.place('bn-i-b', { phone: '01700000832', address: addr });
    await linkIdentity(f.ordersDeps(), ref(b.orderId));
    const linked = await db().identityLink.findMany({ where: { orderId: { in: [a.orderId, b.orderId] } }, select: { clusterId: true }, distinct: ['clusterId'] });
    expect(linked).toHaveLength(1);
    expect(await bundleOnOrder(f.ordersDeps(), ref(b.orderId))).toMatchObject({ action: 'propose', with: [{ orderId: a.orderId }] });
    f.overrides.delete('risk.identity');
  });
});
