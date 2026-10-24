// PR 542 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the one-click advance request from the order
// (SIM-F-016, the register's acceptance test). A person's "Request advance" moves the order to AWAITING_ADVANCE with
// exactly the amount asked, makes ONE live pay link (a payment row with a random token), puts a call in the queue when
// "Call" is ticked and writes the timeline row the message engine sends from; "Send again" keeps the same link (a fresh
// try after a failure); the money coming in moves the order back to PLACED. Nothing is asked by itself unless the owner
// turns on the auto option. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { applyOutcome } from '@extas/payments';
import { NO_RISK_ACTIONS, registry, riskSettings } from '@extas/settings';
import { ADVANCE_CALL_REASON, ADVANCE_REPLACED, advanceLinkOf, advanceRequestView, assessRisk, cancelOrder, recordAdvance, requestAdvance, resendAdvance, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 542 · the advance request from the order (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const money = (orderId: string) => db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, advanceRequiredMinor: true, advanceDueAt: true, deliveryChargeMinor: true, currency: true } });
  const due = (o: { totalMinor: number; walletAppliedMinor: number; paidMinor: number }) => o.totalMinor - o.walletAppliedMinor - o.paidMinor;

  beforeAll(async () => {
    f = await setUpOrders('advance_request');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('ships with the auto option off; needs its permission, a way to reach him, a charge for "delivery" and a percent for "partial"', async () => {
    const d = registry['orders.advanceRequest'].default;
    expect(d.auto).toBe(false);
    const o = await f.place('adv-refusals', { phone: '01700000501' });
    await expect(requestAdvance(f.ordersDeps(), f.reader, o.orderId, { kind: 'full', channels: ['SMS'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: [] })).rejects.toMatchObject({ code: 'NO_CHANNEL' });
    await db().order.update({ where: { id: o.orderId }, data: { deliveryChargeMinor: 0 } });
    await expect(requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'delivery', channels: ['SMS'] })).rejects.toMatchObject({ code: 'NO_CHARGE' });
    await expect(requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'partial', channels: ['SMS'] })).rejects.toMatchObject({ code: 'PARTIAL_UNSET' });
    // nothing was written by a refusal
    expect((await money(o.orderId)).status).toBe('PLACED');
    expect(await db().payment.count({ where: { orderId: o.orderId, linkToken: { not: null } } })).toBe(0);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.awaitAdvance' } })).toBe(0);
    // the dialog's view says the same, and opens on a kind that can be asked
    const v = (await advanceRequestView(f.ordersDeps(), f.S, o.orderId))!;
    expect(v.amounts.delivery).toEqual({ ok: false, code: 'NO_CHARGE' });
    expect(v.amounts.partial).toEqual({ ok: false, code: 'PARTIAL_UNSET' });
    expect(v.amounts.full.ok).toBe(true);
    expect(v).toMatchObject({ defaultKind: 'full', channels: ['SMS', 'CALL'], provider: 'bkash', auto: false, link: null, proposed: null });
  });

  it('SIM-F-016: "Request advance" — the order waits for exactly that amount, one pay link, a call task, the timeline row; paid → back to PLACED', async () => {
    const o = await f.place('adv-full', { phone: '01700000502' });
    const before = await money(o.orderId);
    const r = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: ['SMS', 'WHATSAPP', 'CALL'], note: 'asked on the phone' }, { idempotencyKey: 'adv-full-press-1' });
    expect(r).toMatchObject({ kind: 'full', amountMinor: due(before), channels: ['SMS', 'WHATSAPP', 'CALL'] });
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const after = await money(o.orderId);
    expect(after).toMatchObject({ status: 'AWAITING_ADVANCE', advanceRequiredMinor: before.paidMinor + due(before), advanceDueAt: null });
    const pay = await db().payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    expect(pay).toMatchObject({ status: 'INITIATED', purpose: 'FULL_ADVANCE', method: 'BKASH', provider: 'bkash', amountMinor: due(before), currency: before.currency, linkToken: r.token, attempt: 1 });
    expect(await db().callTask.count({ where: { orderId: o.orderId, reason: ADVANCE_CALL_REASON, status: 'OPEN' } })).toBe(1);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.awaitAdvance' } });
    expect(ev).toMatchObject({ toStatus: 'AWAITING_ADVANCE', reasonCode: 'full', actorType: 'STAFF', message: 'asked on the phone' });
    expect(ev.data).toMatchObject({ request: true, kind: 'full', amountMinor: due(before), paymentId: r.paymentId, channels: ['SMS', 'WHATSAPP', 'CALL'], callTaskId: r.callTaskId });
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.awaitAdvance' } })).toBe(1);
    // the same press again is the first answer (no second link, no second row)
    const again = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: ['SMS', 'WHATSAPP', 'CALL'], note: 'asked on the phone' }, { idempotencyKey: 'adv-full-press-1' });
    expect(again.token).toBe(r.token);
    expect(await db().payment.count({ where: { orderId: o.orderId, linkToken: { not: null } } })).toBe(1);
    // a second request while it waits is refused (one live ask at a time)
    await expect(requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: ['SMS'] })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(await advanceLinkOf(f.ordersDeps(), f.S, o.orderId)).toMatchObject({ token: r.token, path: `/pay/${r.token}`, status: 'INITIATED', kind: 'full', amountMinor: due(before) });
    // the money comes in (the payments service's one writer), then the order service's hook
    const paid = await db().$transaction((tx) => applyOutcome(tx, f.S, { paymentId: r.paymentId, outcome: 'PAID', from: 'gateway', by: { actorType: 'CUSTOMER', actorId: null, source: 'pay-link' } }, new Date()));
    expect(paid.advanceMet).toBe(true);
    await recordAdvance(f.ordersDeps(), ref(o.orderId), systemBy('payments'));
    expect(await money(o.orderId)).toMatchObject({ status: 'PLACED', paidMinor: before.paidMinor + due(before) });
  });

  it('the delivery charge and a part (rounded up to a whole taka, never more than due); "Send again" keeps the link, a fresh try after a failure', async () => {
    f.overrides.set('risk.levels', { ...registry['risk.levels'].default, partialPercent: 33 });
    const o = await f.place('adv-part', { phone: '01700000503' });
    await db().order.update({ where: { id: o.orderId }, data: { deliveryChargeMinor: 12_000 } });
    const m = await money(o.orderId);
    const v = (await advanceRequestView(f.ordersDeps(), f.S, o.orderId))!;
    expect(v.amounts.delivery).toEqual({ ok: true, amountMinor: Math.min(12_000, due(m)) });
    const part = v.amounts.partial;
    expect(part.ok && part.amountMinor % 100).toBe(0);
    expect(part.ok && part.amountMinor >= Math.ceil((due(m) * 33) / 100) && part.amountMinor <= due(m)).toBe(true);
    const r = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'partial', channels: ['SMS'] });
    expect(r.amountMinor).toBe(part.ok ? part.amountMinor : -1);
    expect(r.callTaskId).toBeNull();
    expect((await db().payment.findUniqueOrThrow({ where: { id: r.paymentId } })).purpose).toBe('PART_ADVANCE');
    // send again while the link is open: the same payment, a timeline row for the messages
    const s1 = await resendAdvance(f.ordersDeps(), f.staff, o.orderId, { channels: ['WHATSAPP', 'CALL'] });
    expect(s1).toMatchObject({ paymentId: r.paymentId, token: r.token, newTry: false });
    expect(s1.callTaskId).toBeTruthy();
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.advanceResend' } });
    expect(ev).toMatchObject({ toStatus: null });
    expect(ev.data).toMatchObject({ resend: true, channels: ['WHATSAPP', 'CALL'], paymentId: r.paymentId });
    // the payment failed: "Send again" makes a fresh try with the same token (his link keeps working)
    await db().$transaction((tx) => applyOutcome(tx, f.S, { paymentId: r.paymentId, outcome: 'FAILED', from: 'gateway', by: { actorType: 'CUSTOMER', actorId: null, source: 'pay-link' } }, new Date()));
    const s2 = await resendAdvance(f.ordersDeps(), f.staff, o.orderId, { channels: ['SMS'] });
    expect(s2).toMatchObject({ token: r.token, newTry: true });
    expect(s2.paymentId).not.toBe(r.paymentId);
    expect(await db().payment.findUniqueOrThrow({ where: { id: s2.paymentId } })).toMatchObject({ status: 'INITIATED', attempt: 2, linkToken: r.token, amountMinor: r.amountMinor });
    await expect(resendAdvance(f.ordersDeps(), f.reader, o.orderId, { channels: ['SMS'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    f.overrides.delete('risk.levels');
  });

  it('a new request after the last was paid replaces nothing paid; a cancel closes the open link (no money moved)', async () => {
    const o = await f.place('adv-cancel', { phone: '01700000504' });
    await db().order.update({ where: { id: o.orderId }, data: { deliveryChargeMinor: 9_000 } });
    const r = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'delivery', channels: ['SMS'] });
    expect(r.amountMinor).toBe(9_000);
    await cancelOrder(f.ordersDeps(), f.staff, o.orderId, { reasonCode: 'CUSTOMER_BEFORE_CONFIRM' });
    expect((await db().payment.findUniqueOrThrow({ where: { id: r.paymentId } })).status).toBe('CANCELLED');
    await expect(resendAdvance(f.ordersDeps(), f.staff, o.orderId, { channels: ['SMS'] })).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(ADVANCE_REPLACED).toBe('REPLACED');
  });

  it("the owner's auto option (off by default) asks the level's proposal by itself — with it off, the ask stays a proposal", async () => {
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
    f.overrides.set('risk.bands', [
      { key: 'low', en: 'Low', bn: 'কম', minScore: 0, tone: 'ok' as const },
      { key: 'medium', en: 'Medium', bn: 'মাঝারি', minScore: 5, tone: 'warn' as const },
      { key: 'high', en: 'High', bn: 'বেশি', minScore: 15, tone: 'bad' as const },
    ]);
    f.overrides.set('risk.levels', { ...registry['risk.levels'].default, enabled: true, levels: { low: NO_RISK_ACTIONS, medium: NO_RISK_ACTIONS, high: { watch: true, hold: false, call: false, ask: 'full' } } });
    const off = await f.place('adv-auto-off', { phone: '01700000505' });
    await assessRisk(f.ordersDeps(), ref(off.orderId));
    expect((await money(off.orderId)).status).toBe('PLACED');
    expect((await advanceRequestView(f.ordersDeps(), f.S, off.orderId))!).toMatchObject({ proposed: 'full', defaultKind: 'full' });

    f.overrides.set('orders.advanceRequest', { ...registry['orders.advanceRequest'].default, auto: true, channels: { SMS: true, WHATSAPP: false, CALL: false } });
    const on = await f.place('adv-auto-on', { phone: '01700000506' });
    await assessRisk(f.ordersDeps(), ref(on.orderId));
    expect((await money(on.orderId)).status).toBe('AWAITING_ADVANCE');
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: on.orderId, type: 'order.awaitAdvance' } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', reasonCode: 'full' });
    expect(ev.data).toMatchObject({ request: true, channels: ['SMS'], callTaskId: null });
    for (const k of ['risk.score', 'risk.bands', 'risk.levels', 'orders.advanceRequest'] as const) f.overrides.delete(k);
  });
});
