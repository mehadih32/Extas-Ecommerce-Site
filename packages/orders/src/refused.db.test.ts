// PR 191 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): refused-parcel handling and the list it feeds.
// A refusal the shop caused is marked and never counted (SIM-F-044); the charge paid at the door is kept on the return;
// the list is off by default; when on, a number reaching the owner's count is only PROPOSED — a person lists it,
// dismisses it, or takes it off with a note — and a re-ship after a try-on is not counted. Nothing blocks the number:
// it can still order with Cash on Delivery. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, decideRefusedEntry, listRefusedEntries, listReturns, openExchange, orderStep, refusedExclusionPhones, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 191 · refused parcels and the refused-parcel list (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');

  async function refused(name: string, phone: string, input: Record<string, unknown> = {}) {
    const o = await f.place(name, { phone });
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    await orderStep(d(), r, by, 'returned', input);
    return o;
  }

  beforeAll(async () => {
    f = await setUpOrders('refused_list');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the shop’s fault is marked and never counted; the charge paid at the door is kept; the list is off by default', async () => {
    const late = await refused('rf-late', '01711000101', { refusalKey: 'late' });
    expect(await db().returnRecord.findFirstOrThrow({ where: { orderId: late.orderId } })).toMatchObject({ kind: 'REFUSED_AT_DOOR', ourFault: true });
    const paid = await refused('rf-paid', '01711000101', { refusalKey: 'changed-mind', chargePaidMinor: 6_000 });
    expect(await db().returnRecord.findFirstOrThrow({ where: { orderId: paid.orderId } })).toMatchObject({ kind: 'CHARGE_PAID_RETURN', chargePaidMinor: 6_000, ourFault: false });
    const parcels = await listReturns(d(), f.staff, { kind: ['CHARGE_PAID_RETURN'] });
    expect(parcels.map((p) => p.orderId)).toEqual([paid.orderId]);
    expect(parcels[0]).toMatchObject({ chargePaidMinor: 6_000 });
    await refused('rf-again', '01711000101', { refusalKey: 'changed-mind' });
    // off: two counted refusals, nothing proposed
    expect(await db().refusedParcelEntry.count()).toBe(0);
    const step = await f.place('rf-badstep');
    expect(await code(orderStep(d(), { storeId: f.S, orderId: step.orderId }, by, 'pack', { chargePaidMinor: 100 }))).toBe('INVALID_INPUT');
  });

  it('on: proposed once the counted refusals reach the owner’s number; a person decides; a try-on re-ship is not counted', async () => {
    f.overrides.set('orders.refused.list', { enabled: true, minRefusals: 2 });
    const phone = '01711000202';
    await refused('rf-1', phone, { refusalKey: 'changed-mind' });
    expect(await db().refusedParcelEntry.count({ where: { phone: '+8801711000202' } })).toBe(0);
    // a try-on (a re-ship reason: the size did not fit at the door) does not count, re-shipped in another size or not
    const tryon = await refused('rf-tryon', phone, { refusalKey: 'size-fit' });
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: tryon.orderId } });
    await openExchange(d(), f.staff, tryon.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL }] });
    // the shop's fault does not count
    await refused('rf-ours', phone, { refusalKey: 'wrong-item' });
    expect(await db().refusedParcelEntry.count({ where: { phone: '+8801711000202' } })).toBe(0);
    const last = await refused('rf-2', phone, { refusalKey: 'bought-elsewhere' });
    const [entry] = await listRefusedEntries(d(), f.staff, { state: ['PROPOSED'] });
    expect(entry).toMatchObject({ phone: '+8801711000202', state: 'PROPOSED', refusals: 2, lastOrderId: last.orderId, lastReasonCode: 'bought-elsewhere' });
    expect(await refusedExclusionPhones(db(), f.S)).toEqual([]);

    // a person decides; nothing is listed without one
    expect(await code(decideRefusedEntry(d(), f.reader, entry!.id, { state: 'LISTED' }))).toBe('FORBIDDEN');
    expect(await code(decideRefusedEntry(d(), f.staff, entry!.id, { state: 'REMOVED', note: 'no' }))).toBe('RETURN_STATE');
    expect(await code(decideRefusedEntry(d(), f.staff, entry!.id, { state: 'LISTED' }, { version: entry!.version + 3 }))).toBe('STALE');
    expect(await decideRefusedEntry(d(), f.staff, entry!.id, { state: 'LISTED' }, { version: entry!.version })).toEqual({ id: entry!.id, state: 'LISTED' });
    expect(await refusedExclusionPhones(db(), f.S)).toEqual(['+8801711000202']);
    expect(await code(decideRefusedEntry(d(), f.staff, entry!.id, { state: 'REMOVED' }))).toBe('INVALID_INPUT');
    await decideRefusedEntry(d(), f.staff, entry!.id, { state: 'REMOVED', note: 'he paid in advance since' });
    expect(await refusedExclusionPhones(db(), f.S)).toEqual([]);
    const audit = await db().auditLog.findMany({ where: { entityId: entry!.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(['refused.listed', 'refused.removed']);
    // a new refusal proposes it again (a person decides again); the number can still order with Cash on Delivery
    await refused('rf-3', phone, { refusalKey: 'changed-mind' });
    expect((await db().refusedParcelEntry.findUniqueOrThrow({ where: { id: entry!.id } })).state).toBe('PROPOSED');
    const next = await f.place('rf-next', { phone });
    expect(await db().order.findUniqueOrThrow({ where: { id: next.orderId } })).toMatchObject({ status: 'PLACED', paymentMethod: 'COD' });
    f.overrides.delete('orders.refused.list');
  });
});
