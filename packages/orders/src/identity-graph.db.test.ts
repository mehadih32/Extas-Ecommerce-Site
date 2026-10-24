// S06 · PR 519 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — the Order Identity Graph: off by
// default; on, an order joins the identity of the same phone, the same device or an alike name and address (a name
// spelt a little off still matches, pg_trgm), transitively; two identities that meet are merged into the older one
// (the newer is marked, never deleted); the IP alone never joins; the graph fills from the history the day it is
// switched on. The risk score's identity and device signals read it (SIM-F-015: the person behind a new number is found
// through any of his orders, and his earlier refusal is named). Nothing is blocked, held or cancelled by it. Every
// value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskRulesSettings, riskSettings } from '@extas/settings';
import { assessRisk, clusterOrders, identityView, linkIdentity, rescreenAfterEdit, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 519 · the Order Identity Graph (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const graph = (over: Partial<(typeof riskRulesSettings)['risk.identity']['default']> = {}) => f.overrides.set('risk.identity', { ...riskRulesSettings['risk.identity'].default, enabled: true, ...over });
  /** An order with its own phone, name, address and (optionally) device. */
  const order = async (label: string, o: { phone: string; name: string; address: string; device?: string }) => {
    const p = await f.place(label, { phone: o.phone, address: o.address });
    await db().order.update({ where: { id: p.orderId }, data: { customerName: o.name, ...(o.device ? { deviceId: o.device } : {}) } });
    return p;
  };
  const clusterOf = async (orderId: string) => (await db().identityLink.findFirst({ where: { orderId }, select: { clusterId: true } }))?.clusterId ?? null;

  beforeAll(async () => {
    f = await setUpOrders('identity_graph');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default: nothing is linked', async () => {
    expect(riskRulesSettings['risk.identity'].default.enabled).toBe(false);
    const a = await order('off-a', { phone: '01700000901', name: 'Karim Off', address: 'House 1, Road 1, Mirpur, Dhaka' });
    expect(await linkIdentity(d(), ref(a.orderId))).toBeNull();
    expect(await db().identityLink.count({ where: { orderId: a.orderId } })).toBe(0);
  });

  it('a new number with the name spelt a little off and the same address is the same person; the history fills in; once only', async () => {
    graph();
    const a = await order('typo-a', { phone: '01700000911', name: 'Rahim Uddin', address: 'House 12, Road 7, Mohammadpur, Dhaka 1207' });
    const b = await order('typo-b', { phone: '01700000912', name: 'Rahim Udin', address: 'House 12 Road 7 Mohammadpur Dhaka-1207' });
    // A landed while the graph was off: B's step links it from the history
    const r = await linkIdentity(d(), ref(b.orderId));
    expect(r).toMatchObject({ created: true, joined: { nameAddress: [a.number], phone: [], device: [] }, filled: 1, merged: 0 });
    expect(await clusterOf(a.orderId)).toBe(r!.clusterId);
    const kinds = (await db().identityLink.findMany({ where: { orderId: b.orderId }, select: { kind: true, valueNorm: true } })).map((l) => l.kind).sort();
    expect(kinds).toEqual(['ADDRESS', 'IP', 'NAME', 'PHONE']);
    expect((await db().identityLink.findFirstOrThrow({ where: { orderId: b.orderId, kind: 'PHONE' } })).valueNorm).toBe('+8801700000912');
    // a retry links nothing more
    expect(await linkIdentity(d(), ref(b.orderId))).toBeNull();
    expect(await db().orderEvent.count({ where: { orderId: b.orderId, type: 'order.identityLinked' } })).toBe(1);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: 'order.identityLinked' } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', toStatus: null });
    // the order itself is untouched
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId }, select: { status: true, version: true } })).toMatchObject({ status: 'PLACED', version: 0 });
    const c = await clusterOrders(d(), f.S, b.orderId, 50);
    expect(c!.orders).toMatchObject([{ id: a.orderId, via: ['nameAddress'] }]);
  });

  it('the same device joins, and through it the earlier orders are the same person too (transitive); the IP alone never joins', async () => {
    graph();
    const a = await order('dev-a', { phone: '01700000921', name: 'Selim Mia', address: 'Flat 3B, Lake Road, Dhanmondi, Dhaka' });
    const b = await order('dev-b', { phone: '01700000922', name: 'Selim Mia', address: 'Flat 3B Lake Road Dhanmondi Dhaka', device: 'device-dev-b' });
    const c = await order('dev-c', { phone: '01700000923', name: 'Another Name', address: 'Somewhere else, Khulna', device: 'device-dev-b' });
    await linkIdentity(d(), ref(a.orderId));
    await linkIdentity(d(), ref(b.orderId));
    const rc = await linkIdentity(d(), ref(c.orderId));
    expect(rc).toMatchObject({ created: false, joined: { device: [b.number] } });
    const seen = (await clusterOrders(d(), f.S, c.orderId, 50))!.orders;
    expect(seen.find((x) => x.id === b.orderId)!.via).toEqual(['device']);
    expect(seen.find((x) => x.id === a.orderId)!.via).toEqual(['linked']);
    // the same connection (the checkout's IP is the same for every test order) but nothing else: a new identity
    const lone = await order('ip-only', { phone: '01700000924', name: 'Unrelated Person', address: 'Village Road, Rangpur' });
    expect(await linkIdentity(d(), ref(lone.orderId))).toMatchObject({ created: true, joined: { phone: [], device: [], nameAddress: [] } });
    expect(await clusterOf(lone.orderId)).not.toBe(await clusterOf(a.orderId));
    // the device joins only while the owner lets it
    graph({ joinOnDevice: false });
    const e = await order('dev-e', { phone: '01700000925', name: 'Third Name', address: 'Port Road, Chattogram', device: 'device-dev-b' });
    expect(await linkIdentity(d(), ref(e.orderId))).toMatchObject({ created: true });
  });

  it('two identities that meet are merged into the older one; the newer is marked merged, never deleted', async () => {
    graph();
    const a = await order('merge-a', { phone: '01700000931', name: 'Merge One', address: 'Road 2, Uttara, Dhaka' });
    const b = await order('merge-b', { phone: '01700000932', name: 'Merge Two', address: 'Road 9, Banani, Dhaka', device: 'device-merge' });
    const ra = await linkIdentity(d(), ref(a.orderId));
    const rb = await linkIdentity(d(), ref(b.orderId));
    expect(ra!.clusterId).not.toBe(rb!.clusterId);
    // a third order with A's phone and B's device: one person
    const c = await order('merge-c', { phone: '01700000931', name: 'Merge Three', address: 'Somewhere, Sylhet', device: 'device-merge' });
    const rc = await linkIdentity(d(), ref(c.orderId));
    expect(rc).toMatchObject({ clusterId: ra!.clusterId, merged: 1 });
    expect(await clusterOf(b.orderId)).toBe(ra!.clusterId);
    expect(await db().identityCluster.findUniqueOrThrow({ where: { id: rb!.clusterId } })).toMatchObject({ mergedIntoId: ra!.clusterId, archivedAt: expect.any(Date) });
    expect(await db().auditLog.count({ where: { entityId: ra!.clusterId, action: 'identity.merge' } })).toBe(1);
  });

  it("SIM-F-015 through the graph: the refuser's new number, a new name and a new address, found through his device; the refusal is named", async () => {
    graph();
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
    const signals = riskSettings['risk.signals'].default;
    f.overrides.set('risk.signals', { ...signals, identityMatch: { ...signals.identityMatch, enabled: true }, deviceMatch: { ...signals.deviceMatch, enabled: true } });
    const refused = await order('sim15-a', { phone: '01700000941', name: 'Order Thirtyfive', address: 'House 35, Road 3, Shyamoli, Dhaka' });
    await db().order.update({ where: { id: refused.orderId }, data: { status: 'RETURNED' } });
    const second = await order('sim15-b', { phone: '01700000942', name: 'Order Thirtyfive', address: 'House 35 Road 3 Shyamoli Dhaka', device: 'device-sim15' });
    const third = await order('sim15-c', { phone: '01700000943', name: 'Somebody New', address: 'Bazar Road, Bogura', device: 'device-sim15' });
    for (const o of [second, third]) await linkIdentity(d(), ref(o.orderId));
    const r = await assessRisk(d(), ref(third.orderId));
    const fired = Object.fromEntries(r!.fired.map((x) => [x.key, x.values]));
    // the same device names the second order; the person (through it) names the refusal of the first
    expect(fired.deviceMatch).toMatchObject({ number: second.number });
    expect(fired.identityMatch).toMatchObject({ refusedNumber: refused.number, refused: 1 });
    // the score only informs: the order is as it was
    expect(await db().order.findUniqueOrThrow({ where: { id: third.orderId }, select: { status: true } })).toMatchObject({ status: 'PLACED' });
    // the graph off: the old look-ups (the same name only) do not see the first order behind the new name
    f.overrides.set('risk.identity', riskRulesSettings['risk.identity'].default);
    const again = await assessRisk(d(), ref(third.orderId), { after: 'manual', by: systemBy('test') });
    expect(again!.fired.find((x) => x.key === 'identityMatch')).toBeUndefined();
    f.overrides.set('risk.score', riskSettings['risk.score'].default);
    f.overrides.set('risk.signals', signals);
  });

  it("the team's edit of the phone adds the new number to the same identity; the order page's view (orders.risk.read)", async () => {
    graph();
    const a = await order('edit-a', { phone: '01700000951', name: 'Edit Person', address: 'Road 4, Gulshan, Dhaka' });
    const b = await order('edit-b', { phone: '01700000951', name: 'Edit Person', address: 'Road 4, Gulshan, Dhaka' });
    await linkIdentity(d(), ref(a.orderId));
    await linkIdentity(d(), ref(b.orderId));
    await db().order.update({ where: { id: b.orderId }, data: { phone: '+8801700000952' } });
    await rescreenAfterEdit(d(), ref(b.orderId), systemBy('test'), { phone: '01700000952' });
    const phones = (await db().identityLink.findMany({ where: { orderId: b.orderId, kind: 'PHONE' }, select: { valueNorm: true } })).map((l) => l.valueNorm).sort();
    expect(phones).toEqual(['+8801700000951', '+8801700000952']);
    const v = await identityView(d(), f.staff, b.orderId);
    expect(v).toMatchObject({ enabled: true, clusterId: await clusterOf(a.orderId), orders: [{ id: a.orderId }], summary: { orders: 1 } });
    expect(v!.otherPhones).toEqual(['+8801700000951']);
    expect(await code(identityView(d(), f.reader, b.orderId))).toBe('FORBIDDEN');
    expect(await identityView(d(), f.staff, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
