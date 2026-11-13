// S28 · PR 663 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off as shipped; on, a trusted old customer's
// cash order is confirmed by the rule with `confirmedBy: 'RULE'`, the case and the why on the event and nothing about the
// money changed; a brand-new number gets a call task and no status change; a suspicious order gets a red tag; a second run
// changes nothing; staff Confirm writes `confirmedBy: 'STAFF'`; the courier score kept on the order feeds the accuracy report.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { ORDERS_AUTO_CONFIRM_DEFAULT, RISK_COURIER_SCORE_DEFAULT, riskSettings } from '@extas/settings';
import {
  AUTO_CONFIRM_CALL_REASON,
  AUTO_CONFIRM_EVENT,
  AUTO_RED_FLAG,
  autoConfirmOrder,
  confirmOrder,
  COURIER_SCORE_EVENT,
  courierScoreAccuracy,
  noteCourierScore,
  orderCourierScore,
  systemBy,
} from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 662 and 663 · courier score and auto-confirm (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const on = (over: Record<string, unknown> = {}) => f.overrides.set('orders.autoConfirm', { ...ORDERS_AUTO_CONFIRM_DEFAULT, enabled: true, ...over });
  const row = (id: string) =>
    db().order.findUniqueOrThrow({ where: { id }, select: { status: true, flags: true, paidMinor: true, totalMinor: true, codAmountMinor: true, deliveryChargeMinor: true } });
  async function past(name: string, phone: string, status: 'DELIVERED' | 'RETURNED') {
    const o = await f.place(name, { phone });
    await db().order.update({ where: { id: o.orderId }, data: { status } });
    if (status === 'RETURNED')
      await db().orderEvent.create({
        data: { storeId: f.S, orderId: o.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: 'changed-mind', actorType: 'COURIER', source: 'courier' },
      });
    return o;
  }

  beforeAll(async () => {
    f = await setUpOrders('auto_confirm');
    f.clock.now = new Date();
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: false });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: nothing is decided and the order stays placed', async () => {
    const o = await f.place('ac-off', { phone: '01700000701' });
    expect(await autoConfirmOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ skip: 'OFF', decision: null });
    expect((await row(o.orderId)).status).toBe('PLACED');
  });

  it('on: a trusted old customer is confirmed by the rule — who, which case and why on the event, the money untouched, once only', async () => {
    on();
    await past('ac-t1', '01700000711', 'DELIVERED');
    const o = await f.place('ac-t2', { phone: '01700000711' });
    const before = await row(o.orderId);
    const r = await autoConfirmOrder(f.ordersDeps(), ref(o.orderId));
    expect(r).toMatchObject({ done: 'confirmed', decision: { case: 'trusted', action: 'auto', why: 'trusted' } });
    const after = await row(o.orderId);
    expect(after.status).toBe('CONFIRMED');
    expect({ ...after, status: 'x', flags: [] }).toEqual({ ...before, status: 'x', flags: [] });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.confirm' } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', toStatus: 'CONFIRMED', reasonCode: 'auto-confirm' });
    expect(ev.data).toMatchObject({ confirmedBy: 'RULE', rule: 'trusted', action: 'auto', why: 'trusted' });
    // again: the order is no longer placed; nothing changes
    expect(await autoConfirmOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ skip: 'NOT_PLACED' });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.confirm' } })).toBe(1);
  });

  it('a brand-new number goes to the call list: a call task, a note, the status stays', async () => {
    on();
    const o = await f.place('ac-new', { phone: '01700000721' });
    const r = await autoConfirmOrder(f.ordersDeps(), ref(o.orderId));
    expect(r).toMatchObject({ done: 'noted', decision: { case: 'brandNew', action: 'call' } });
    expect((await row(o.orderId)).status).toBe('PLACED');
    expect(await db().callTask.count({ where: { orderId: o.orderId, reason: AUTO_CONFIRM_CALL_REASON } })).toBe(1);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: AUTO_CONFIRM_EVENT } });
    expect(ev.data).toMatchObject({ confirmedBy: 'RULE', rule: 'brandNew', action: 'call', why: 'noRecord' });
    // a second run adds no second call task
    await autoConfirmOrder(f.ordersDeps(), ref(o.orderId));
    expect(await db().callTask.count({ where: { orderId: o.orderId, reason: AUTO_CONFIRM_CALL_REASON } })).toBe(1);
  });

  it('a suspicious order gets a red tag and stays for a person; nothing is blocked or cancelled', async () => {
    on();
    const o = await f.place('ac-sus', { phone: '01700000731' });
    await db().order.update({ where: { id: o.orderId }, data: { riskSection: 'high' } });
    expect(await autoConfirmOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ done: 'noted', decision: { case: 'suspicious', action: 'person' } });
    expect(await row(o.orderId)).toMatchObject({ status: 'PLACED', flags: expect.arrayContaining([AUTO_RED_FLAG]) });
  });

  it('a big cash order above the owner limit goes to the call list even for a trusted customer', async () => {
    await past('ac-b1', '01700000741', 'DELIVERED');
    const o = await f.place('ac-b2', { phone: '01700000741' });
    on({ bigCodMinor: 1 });
    expect(await autoConfirmOrder(f.ordersDeps(), ref(o.orderId))).toMatchObject({ done: 'noted', decision: { case: 'bigCod', action: 'call' } });
  });

  it('staff Confirm writes confirmedBy STAFF on the event', async () => {
    const o = await f.place('ac-staff', { phone: '01700000751' });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.confirm' } });
    expect(ev.data).toMatchObject({ confirmedBy: 'STAFF' });
  });

  it('PR 662: the score of a number from a courier check and its own orders; off as shipped; staff only', async () => {
    const o = await f.place('cs-1', { phone: '01700000761' });
    expect(await orderCourierScore(f.ordersDeps(), f.staff, o.orderId)).toMatchObject({ enabled: false, result: null });
    f.overrides.set('risk.courierScore', { ...RISK_COURIER_SCORE_DEFAULT, enabled: true });
    const now = f.clock.now;
    await db().courierFraudCheck.create({
      data: {
        storeId: f.S,
        phone: '+8801700000761',
        provider: 'steadfast',
        deliveredCount: 12,
        cancelledCount: 1,
        result: { fraudReports: 0 },
        ok: true,
        checkedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      },
    });
    const card = await orderCourierScore(f.ordersDeps(), f.staff, o.orderId);
    expect(card?.result).toMatchObject({ partial: false, band: 'auto' });
    expect(card?.result?.metrics.find((m) => m.key === 'parcels')).toMatchObject({ value: 13, sources: ['steadfast'] });
    await expect(orderCourierScore(f.ordersDeps(), { ...f.reader, actor: { staffUserId: 'nobody' } }, o.orderId)).rejects.toBeTruthy();
  });

  it('PR 662: the score kept on the order feeds the accuracy report by band', async () => {
    f.overrides.set('risk.courierScore', { ...RISK_COURIER_SCORE_DEFAULT, enabled: true });
    const a = await f.place('cs-acc-a', { phone: '01700000771' });
    const b = await f.place('cs-acc-b', { phone: '01700000772' });
    const now = f.clock.now;
    await db().courierFraudCheck.create({
      data: {
        storeId: f.S,
        phone: '+8801700000771',
        provider: 'steadfast',
        deliveredCount: 30,
        cancelledCount: 0,
        result: { fraudReports: 0 },
        ok: true,
        checkedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      },
    });
    const ra = await noteCourierScore(f.ordersDeps(), ref(a.orderId), systemBy('test'));
    const rb = await noteCourierScore(f.ordersDeps(), ref(b.orderId), systemBy('test'));
    expect(ra?.band).toBe('auto');
    expect(rb).toMatchObject({ score: null, band: 'call' });
    await db().order.update({ where: { id: a.orderId }, data: { status: 'RETURNED' } });
    const rep = await courierScoreAccuracy(f.ordersDeps(), f.staff);
    expect(await db().orderEvent.count({ where: { orderId: a.orderId, type: COURIER_SCORE_EVENT } })).toBe(1);
    expect(rep.rows.find((r) => r.band === 'auto')).toMatchObject({ orders: 1, returned: 1, returnedPct: 100 });
    expect(rep.rows.find((r) => r.band === 'unknown')?.orders).toBeGreaterThanOrEqual(1);
  });
});
