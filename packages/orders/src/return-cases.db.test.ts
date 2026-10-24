// PR 189 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): return handling. A parcel the courier brings
// back opens its return in the same transaction (refused → REFUSED_AT_DOOR, the refused part of a partial delivery
// only its lines); no returns after receipt is the default policy (RETURN_CLOSED, POLICY); the shop's own mistake may
// come back when that switch is on, inside the window; every reason when the policy allows returns after delivery;
// pieces already coming back are refused; a person closes a checked return (an unchecked one only with a note). No
// money moves: what was paid is only noted. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { closeReturn, confirmOrder, openExchange, openReturn, orderStep, qcReturn, returnChoices, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 189 · return handling, no returns after receipt (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const by = systemBy('test');

  async function shipped(name: string, lines?: { variantId: string; quantity?: number }[]) {
    const o = await f.place(name, lines ? { lines } : {});
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(d(), f.staff, o.orderId);
    await orderStep(d(), r, by, 'pack');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(d(), r, by, 'handover');
    return { o, r };
  }
  async function delivered(name: string, lines?: { variantId: string; quantity?: number }[]) {
    const s = await shipped(name, lines);
    await orderStep(d(), s.r, by, 'delivered');
    return s.o;
  }

  beforeAll(async () => {
    f = await setUpOrders('return_cases');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the courier brings it back: the return opens with the order step — refused at the door, or only the refused part', async () => {
    const a = await shipped('rc-refused');
    await orderStep(d(), a.r, by, 'returned', { refusalKey: 'after-eid' });
    const ra = await db().returnRecord.findFirstOrThrow({ where: { orderId: a.o.orderId }, include: { items: true } });
    const lineA = await db().orderItem.findFirstOrThrow({ where: { orderId: a.o.orderId } });
    expect(ra).toMatchObject({ kind: 'REFUSED_AT_DOOR', reasonCode: 'after-eid', status: 'EXPECTED', ourFault: false });
    expect(ra.items).toMatchObject([{ orderItemId: lineA.id, expectedSku: lineA.sku, quantity: lineA.quantity }]);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: a.o.orderId, type: 'order.returned' } });
    expect(ev.data).toMatchObject({ returnId: ra.id });

    const b = await shipped('rc-failed');
    await orderStep(d(), b.r, by, 'courierPickedUp');
    await orderStep(d(), b.r, by, 'returned');
    expect(await db().returnRecord.findFirstOrThrow({ where: { orderId: b.o.orderId } })).toMatchObject({ kind: 'REFUSED_AT_DOOR', reasonCode: null });

    const c = await shipped('rc-partial', [{ variantId: f.v.skyM }, { variantId: f.v.teeM }]);
    await orderStep(d(), c.r, by, 'courierPickedUp');
    const [kept, refused] = await db().orderItem.findMany({ where: { orderId: c.o.orderId }, orderBy: { createdAt: 'asc' } });
    await orderStep(d(), c.r, by, 'partiallyDelivered', { keptItemIds: [kept!.id], refusalKey: 'after-eid' });
    const rc = await db().returnRecord.findFirstOrThrow({ where: { orderId: c.o.orderId }, include: { items: true } });
    expect(rc.items.map((i) => i.orderItemId)).toEqual([refused!.id]);
  });

  it('no returns after receipt by default; our own mistake when switched on, in the window; every reason when the policy allows', async () => {
    const o = await delivered('rc-after');
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const ch = await returnChoices(d(), f.staff, o.orderId);
    expect(ch).toMatchObject({ closed: 'POLICY', reasons: [] });
    expect(ch.lines).toMatchObject([{ id: line.id, returnable: line.quantity }]);
    const body = (reason: string, note?: string) => ({ reason, ...(note ? { note } : {}), items: [{ orderItemId: line.id }] });
    expect(await code(openReturn(d(), f.staff, o.orderId, body('changed-mind')))).toBe('RETURN_CLOSED');
    expect(await code(openReturn(d(), f.reader, o.orderId, body('defect')))).toBe('FORBIDDEN');

    // the shop's own mistake may come back once the owner switches it on — only for a defect or a wrong item
    f.overrides.set('orders.returns.handling', { ourFaultReturns: true, windowHours: 24 });
    expect((await returnChoices(d(), f.staff, o.orderId)).reasons.map((r) => r.code)).toEqual(['defect', 'wrong']);
    expect(await code(openReturn(d(), f.staff, o.orderId, body('changed-mind')))).toBe('RETURN_CLOSED');
    const saved = f.clock.now;
    f.clock.now = new Date(saved.getTime() + 25 * 3_600_000);
    expect(await code(openReturn(d(), f.staff, o.orderId, body('defect')))).toBe('RETURN_CLOSED');
    f.clock.now = saved;
    const key = `rc-${randomUUID()}`;
    const opened = await openReturn(d(), f.staff, o.orderId, body('defect', 'seam open'), { idempotencyKey: key });
    expect(opened).toMatchObject({ kind: 'DEFECT_RETURN', status: 'EXPECTED', refundDueMinor: line.lineTotalMinor, replay: false });
    expect(await openReturn(d(), f.staff, o.orderId, body('defect', 'seam open'), { idempotencyKey: key })).toMatchObject({ returnId: opened.returnId, replay: true });
    const rec = await db().returnRecord.findUniqueOrThrow({ where: { id: opened.returnId } });
    expect(rec).toMatchObject({ ourFault: true, reasonCode: 'defect', note: 'seam open' });
    // the same pieces are coming back already
    expect(await code(openReturn(d(), f.staff, o.orderId, body('wrong')))).toBe('RETURN_LIMIT');
    expect((await returnChoices(d(), f.staff, o.orderId)).lines[0]!.returnable).toBe(0);
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(order.status).toBe('DELIVERED');
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.returnCase' } })).toBe(1);
    // nothing was paid back
    expect(await db().refund.count({ where: { orderId: o.orderId } })).toBe(0);

    // the policy allows returns after delivery: every reason (other needs a note); a piece in an open exchange is taken
    f.overrides.set('policy.returns.afterDelivery', true);
    const o2 = await delivered('rc-policy');
    const l2 = await db().orderItem.findFirstOrThrow({ where: { orderId: o2.orderId } });
    expect((await returnChoices(d(), f.staff, o2.orderId)).reasons.map((r) => r.code)).toEqual(['changed-mind', 'defect', 'wrong', 'other']);
    expect(await code(openReturn(d(), f.staff, o2.orderId, { reason: 'other', items: [{ orderItemId: l2.id }] }))).toBe('INVALID_INPUT');
    await openExchange(d(), f.staff, o2.orderId, { reason: 'size', items: [{ orderItemId: l2.id, newVariantId: f.v.skyL }] });
    expect(await code(openReturn(d(), f.staff, o2.orderId, { reason: 'changed-mind', items: [{ orderItemId: l2.id }] }))).toBe('RETURN_LIMIT');
    f.overrides.delete('policy.returns.afterDelivery');
    f.overrides.delete('orders.returns.handling');
  });

  it('a person closes it: a checked return, or one never checked only with a note; closed stays closed', async () => {
    const a = await shipped('rc-close');
    await orderStep(d(), a.r, by, 'returned');
    const ret = await db().returnRecord.findFirstOrThrow({ where: { orderId: a.o.orderId }, include: { items: true } });
    expect(await code(closeReturn(d(), f.staff, ret.id, {}))).toBe('INVALID_INPUT');
    expect(await code(closeReturn(d(), f.reader, ret.id, {}))).toBe('FORBIDDEN');
    f.overrides.set('erp.defaultMode', 'NONE');
    await qcReturn(d(), f.staff, ret.id, { items: [{ returnItemId: ret.items[0]!.id, scannedSku: ret.items[0]!.expectedSku, disposition: 'SELLABLE' }] });
    f.overrides.delete('erp.defaultMode');
    expect(await closeReturn(d(), f.staff, ret.id, {})).toEqual({ returnId: ret.id, status: 'CLOSED' });
    expect(await code(closeReturn(d(), f.staff, ret.id, { note: 'again' }))).toBe('RETURN_STATE');
    const closed = await db().returnRecord.findUniqueOrThrow({ where: { id: ret.id } });
    expect(closed).toMatchObject({ status: 'CLOSED', closedById: f.staffId });
    expect(closed.closedAt).not.toBeNull();

    const b = await shipped('rc-lost');
    await orderStep(d(), b.r, by, 'returned');
    const lost = await db().returnRecord.findFirstOrThrow({ where: { orderId: b.o.orderId } });
    expect(await closeReturn(d(), f.staff, lost.id, { note: 'the courier lost it; claim opened' })).toMatchObject({ status: 'CLOSED' });
    expect(await db().orderEvent.count({ where: { orderId: b.o.orderId, type: 'return.closed' } })).toBe(1);
  });
});
