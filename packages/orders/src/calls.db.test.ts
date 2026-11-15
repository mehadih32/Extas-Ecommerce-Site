// S04 · PR 563 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): no order is ever held over an address.
// An address nothing settles — no Inside/Outside answer either — and a landmark-only village address (SIM-F-030) are
// placed, stay PLACED, are confirmed like any other order, and wait in the call queue for the AI or an agent, with
// what he typed as he typed it. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { callDesk, callQueue, confirmOrder } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 563 · no order is ever held over an address (PostgreSQL)', () => {
  let f: OrdersFixture;
  beforeAll(async () => {
    f = await setUpOrders('calls');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('an unclear address and a landmark-only one are placed, never held, and confirm like any other order', async () => {
    const unclear = await f.place('unclear', { address: 'Notun Para, Shahid Minar er pashe' });
    const landmark = await f.place('landmark', { address: 'bazar er pashe, Kurigram' });
    for (const o of [unclear, landmark]) {
      const row = await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, onHoldSince: true } });
      expect(row).toEqual({ status: 'PLACED', onHoldSince: null });
      const r = await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
      expect(r.status).toBe('CONFIRMED');
    }
  });

  it('the call queue lists every open call, the longest wait first, with the address as typed; reasons filter it', async () => {
    const all = await callQueue(f.ordersDeps(), f.reader);
    const mine = all.rows.filter((r) => r.order && ['Notun Para, Shahid Minar er pashe', 'bazar er pashe, Kurigram'].includes(r.order.shippingAddressText ?? ''));
    expect(mine.map((r) => r.reason)).toEqual(['ADDRESS_UNCLEAR', 'ADDRESS_CHECK']);
    expect(mine[0]!.order).toMatchObject({ addressUnclear: true, chargeFixed: false, status: 'CONFIRMED', flags: ['ADDRESS_UNCLEAR'] });
    expect(mine[1]!.order).toMatchObject({ addressUnclear: false, chargeFixed: true, flags: ['ADDRESS_CHECK'] });
    const check = await callQueue(f.ordersDeps(), f.reader, { reason: 'ADDRESS_CHECK' });
    expect(check.rows.every((r) => r.reason === 'ADDRESS_CHECK')).toBe(true);
    expect((await callQueue(f.ordersDeps(), f.reader, { status: 'closed' })).rows).toEqual([]);
    const one = await callQueue(f.ordersDeps(), f.reader, { limit: 1 });
    expect(one.rows).toHaveLength(1);
    expect(one.next).toBe(one.rows[0]!.taskId);
    expect((await callQueue(f.ordersDeps(), f.reader, { limit: 1, cursor: one.next! })).rows[0]!.taskId).not.toBe(one.next);
  });

  it('reading the queue needs orders.read in that store; a bad query names the field', async () => {
    const nobody = await f.t.prisma.staffUser.create({ data: { email: 'nobody-calls@example.com', displayName: 'No role', passwordHash: 'not-a-login' } });
    expect(await code(callQueue(f.ordersDeps(), { actor: { staffUserId: nobody.id }, storeId: f.S }))).not.toBe('ok');
    expect(await code(callQueue(f.ordersDeps(), f.reader, { status: 'later' }))).toBe('INVALID_INPUT');
  });

  // PR 828 (prototype v5): the call desk's Staff today and Call again now
  it('the call desk counts the confirmations of the day by the person, lists only the calls whose time has come, and needs orders.read', async () => {
    const before = await callDesk(f.ordersDeps(), f.reader);
    const o = await f.place('desk', { address: 'Notun Para, Shahid Minar er pashe 2' });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const after = await callDesk(f.ordersDeps(), f.reader);
    const mine = (d: typeof after) => d.staff.find((x) => x.staffUserId === f.staff.actor.staffUserId)?.confirmed ?? 0;
    expect(mine(after)).toBe(mine(before) + 1);
    const task = await f.t.prisma.callTask.findFirstOrThrow({ where: { orderId: o.orderId } });
    await f.t.prisma.callTask.update({ where: { id: task.id }, data: { dueAt: new Date(Date.now() + 3_600_000) } });
    const later = await callDesk(f.ordersDeps(), f.reader);
    expect(later.due.some((x) => x.taskId === task.id)).toBe(false);
    await f.t.prisma.callTask.update({ where: { id: task.id }, data: { dueAt: new Date(Date.now() - 3_600_000) } });
    const now = await callDesk(f.ordersDeps(), f.reader);
    expect(now.due.some((x) => x.taskId === task.id)).toBe(true);
    expect(now.dueTotal).toBeGreaterThanOrEqual(1);
    const nobody = await f.t.prisma.staffUser.create({ data: { email: 'nobody-desk@example.com', displayName: 'No role', passwordHash: 'not-a-login' } });
    expect(await code(callDesk(f.ordersDeps(), { actor: { staffUserId: nobody.id }, storeId: f.S }))).not.toBe('ok');
  });
});
