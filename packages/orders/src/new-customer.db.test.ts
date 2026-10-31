// S06 · PR 545 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the new-customer verification queue. Off
// as shipped (nothing happens); on, a first order from a number nobody ordered with gets a NEW_CUSTOMER call task, the
// "New customer" mark and a timeline line — once, never a hold, a decline or an advance, and no score added; a second
// order from the same number (or the same account) is a returning customer; a prepaid order skips the call (SIM-F-020)
// unless the owner turns `prepaid` on. A person records the call (`orders.confirm`): an outcome from the owner's list
// closes the task or keeps it for the next try, the order's timeline gets the line, the order itself is untouched.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskSettings } from '@extas/settings';
import { assessRisk, callQueue, callReasonCounts, CALL_OUTCOME_EVENT, NEW_CUSTOMER_EVENT, NEW_CUSTOMER_FLAG, NEW_CUSTOMER_REASON, newCustomerOnOrder, recordCall } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 545 · the new-customer call queue (PostgreSQL)', () => {
  let f: OrdersFixture;
  beforeAll(async () => {
    f = await setUpOrders('new-customer');
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  const land = (orderId: string) => newCustomerOnOrder(f.ordersDeps(), { storeId: f.S, orderId });
  const order = (id: string) => f.t.prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true, flags: true, riskScore: true, holdReasonCode: true, advanceRequirement: true } });
  const tasks = (orderId: string) => f.t.prisma.callTask.findMany({ where: { orderId, reason: NEW_CUSTOMER_REASON } });

  it('off as shipped: a first order gets nothing', async () => {
    const o = await f.place('nc-off', { phone: '01700000501' });
    expect(await land(o.orderId)).toBeNull();
    expect(await tasks(o.orderId)).toEqual([]);
    expect((await order(o.orderId)).flags).not.toContain(NEW_CUSTOMER_FLAG);
  });

  it('on: a first order gets the call, the mark and the line once — never a hold or an advance; the second order is a returning customer', async () => {
    f.overrides.set('risk.newCustomer', { enabled: true, prepaid: false });
    const first = await f.place('nc-first', { phone: '01700000502' });
    const before = await order(first.orderId);
    const r = await land(first.orderId);
    expect(r).toMatchObject({ callTaskId: expect.any(String) });
    expect(await land(first.orderId)).toMatchObject({ callTaskId: r!.callTaskId });
    expect(await tasks(first.orderId)).toHaveLength(1);
    const after = await order(first.orderId);
    expect(after).toMatchObject({ status: before.status, holdReasonCode: before.holdReasonCode, riskScore: before.riskScore, advanceRequirement: before.advanceRequirement });
    expect(after.flags).toContain(NEW_CUSTOMER_FLAG);
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: first.orderId, type: NEW_CUSTOMER_EVENT } })).toBe(1);
    // the same number again (written another way): a returning customer
    const again = await f.place('nc-again', { phone: '+8801700000502' });
    expect(await land(again.orderId)).toBeNull();
    expect(await tasks(again.orderId)).toEqual([]);
    const counts = await callReasonCounts(f.ordersDeps(), f.reader);
    expect(counts[NEW_CUSTOMER_REASON]).toBe(1);
    const q = await callQueue(f.ordersDeps(), f.reader, { reason: NEW_CUSTOMER_REASON });
    expect(q.rows.map((x) => x.order?.id)).toEqual([first.orderId]);
  });

  it('no history is not a risk score: the same first order scores the same with the queue off and on', async () => {
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
    f.overrides.set('risk.newCustomer', { enabled: false, prepaid: false });
    const off = await f.place('nc-score-off', { phone: '01700000513' });
    const a = await assessRisk(f.ordersDeps(), { storeId: f.S, orderId: off.orderId });
    f.overrides.set('risk.newCustomer', { enabled: true, prepaid: false });
    const on = await f.place('nc-score-on', { phone: '01700000514' });
    expect(await land(on.orderId)).not.toBeNull();
    const b = await assessRisk(f.ordersDeps(), { storeId: f.S, orderId: on.orderId });
    expect(b!.score).toBe(a!.score);
    expect(b!.fired.map((x) => x.key)).toEqual(a!.fired.map((x) => x.key));
    f.overrides.delete('risk.score');
  });

  it('SIM-F-020: a prepaid first order skips the call unless the owner turns prepaid on', async () => {
    const paid = await f.place('nc-paid', { phone: '01700000504', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    expect(await land(paid.orderId)).toBeNull();
    f.overrides.set('risk.newCustomer', { enabled: true, prepaid: true });
    expect(await land(paid.orderId)).toMatchObject({ callTaskId: expect.any(String) });
    f.overrides.set('risk.newCustomer', { enabled: true, prepaid: false });
  });

  it('a person records the call: "no answer" keeps it, "spoke" closes it; the order is untouched; a reader and a bad outcome are refused', async () => {
    const o = await f.place('nc-call', { phone: '01700000505' });
    const { callTaskId } = (await land(o.orderId))!;
    const before = await order(o.orderId);
    expect(await code(recordCall(f.ordersDeps(), f.reader, callTaskId, { outcome: 'SPOKE_OK' }))).not.toBe('ok');
    expect(await code(recordCall(f.ordersDeps(), f.staff, callTaskId, { outcome: 'NOPE' }))).toBe('INVALID_INPUT');
    expect(await code(recordCall(f.ordersDeps(), f.staff, 'x', { outcome: 'SPOKE_OK' }))).toBe('NOT_FOUND');
    expect(await recordCall(f.ordersDeps(), f.staff, callTaskId, { outcome: 'NO_ANSWER' })).toEqual({ taskId: callTaskId, outcome: 'NO_ANSWER', status: 'IN_PROGRESS' });
    expect((await callQueue(f.ordersDeps(), f.reader, { reason: NEW_CUSTOMER_REASON })).rows.find((x) => x.taskId === callTaskId)).toMatchObject({ status: 'IN_PROGRESS', outcome: 'NO_ANSWER' });
    expect(await recordCall(f.ordersDeps(), f.staff, callTaskId, { outcome: 'SPOKE_OK', note: 'his own order, a gift' })).toMatchObject({ status: 'DONE' });
    expect(await code(recordCall(f.ordersDeps(), f.staff, callTaskId, { outcome: 'SPOKE_OK' }))).toBe('NOTHING_CHANGED');
    const t = await f.t.prisma.callTask.findUniqueOrThrow({ where: { id: callTaskId } });
    expect(t).toMatchObject({ status: 'DONE', outcome: 'SPOKE_OK', assignedToId: f.staffId });
    expect(t.notes).toContain('SPOKE_OK: his own order, a gift');
    expect(t.closedAt).not.toBeNull();
    const lines = await f.t.prisma.orderEvent.findMany({ where: { orderId: o.orderId, type: CALL_OUTCOME_EVENT }, orderBy: { createdAt: 'asc' } });
    expect(lines.map((e) => e.reasonCode)).toEqual(['NO_ANSWER', 'SPOKE_OK']);
    expect(lines[1]!.message).toBe('his own order, a gift');
    const after = await order(o.orderId);
    expect(after).toMatchObject({ status: before.status, holdReasonCode: before.holdReasonCode });
    expect(await f.t.prisma.auditLog.count({ where: { action: 'orders.call.record', entityId: callTaskId } })).toBe(2);
    const closed = await callQueue(f.ordersDeps(), f.reader, { status: 'closed' });
    expect(closed.rows.map((x) => x.taskId)).toContain(callTaskId);
  });
});
