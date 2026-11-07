// S05 · PR 541 follow-up 320 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a prepaid order that nothing
// flagged confirms by itself once paid, only while the owner's switch is on (off as shipped); a COD order, an unpaid or
// flagged prepaid order, a cancel request and an open review are left for a person; nothing about the money changes.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { prepaidConfirmSettings, riskSettings } from '@extas/settings';
import { placeInSection, selfConfirmPrepaid, selfConfirmSkip, SELF_CONFIRM_SOURCE } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe('follow-up 320 · the pure check', () => {
  const base = { status: 'PLACED', paymentMethod: 'BKASH', riskSection: 'prepaid', totalMinor: 150_000, walletAppliedMinor: 0, paidMinor: 150_000, flags: [] as string[], cancelRequestedAt: null };
  it('only a placed, fully paid prepaid order in the "prepaid" section with no payment flag and no cancel request', () => {
    expect(selfConfirmSkip(base)).toBeNull();
    expect(selfConfirmSkip({ ...base, paidMinor: 0, walletAppliedMinor: 150_000 })).toBeNull();
    expect(selfConfirmSkip({ ...base, status: 'CONFIRMED' })).toBe('NOT_PLACED');
    expect(selfConfirmSkip({ ...base, paymentMethod: 'COD' })).toBe('NOT_PREPAID');
    expect(selfConfirmSkip({ ...base, paymentMethod: null })).toBe('NOT_PREPAID');
    for (const s of ['high', 'watch', 'reorder', 'identity', 'duplicate', 'clear', null]) expect(selfConfirmSkip({ ...base, riskSection: s }), String(s)).toBe('FLAGGED');
    for (const fl of ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_MISMATCH']) expect(selfConfirmSkip({ ...base, flags: [fl] }), fl).toBe('PAYMENT');
    expect(selfConfirmSkip({ ...base, paidMinor: 149_999 })).toBe('DUE');
    expect(selfConfirmSkip({ ...base, cancelRequestedAt: new Date() })).toBe('CANCEL_REQUESTED');
  });
});

describe.skipIf(!HAS_TEST_DB)('follow-up 320 · prepaid orders confirm by themselves once paid (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const on = (enabled: boolean) => f.overrides.set('orders.prepaid.selfConfirm', { enabled });
  const row = (orderId: string) => db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, paidMinor: true, totalMinor: true, codAmountMinor: true, deliveryChargeMinor: true, confirmedAt: true } });

  beforeAll(async () => {
    f = await setUpOrders('prepaid-confirm');
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: false });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: a paid prepaid order nothing flagged waits for the tap', async () => {
    expect(prepaidConfirmSettings['orders.prepaid.selfConfirm'].default).toEqual({ enabled: false });
    const o = await f.place('pc-off', { phone: '01700000501', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await placeInSection(f.ordersDeps(), ref(o.orderId));
    expect(await selfConfirmPrepaid(f.ordersDeps(), ref(o.orderId))).toMatchObject({ confirmed: false, skip: 'OFF' });
    expect((await row(o.orderId)).status).toBe('PLACED');
  });

  it('on: confirmed once by the system with its note — the money untouched; a second call changes nothing', async () => {
    on(true);
    const o = await f.place('pc-on', { phone: '01700000502', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await placeInSection(f.ordersDeps(), ref(o.orderId));
    const before = await row(o.orderId);
    const r = await selfConfirmPrepaid(f.ordersDeps(), ref(o.orderId));
    expect(r).toMatchObject({ confirmed: true, skip: null, command: { status: 'CONFIRMED' } });
    const after = await row(o.orderId);
    expect(after.status).toBe('CONFIRMED');
    expect(after.confirmedAt).not.toBeNull();
    expect({ ...after, status: before.status, confirmedAt: null }).toEqual({ ...before, confirmedAt: null });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.confirm' } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', source: SELF_CONFIRM_SOURCE, reasonCode: SELF_CONFIRM_SOURCE, toStatus: 'CONFIRMED' });
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.confirm' } })).toBe(1);
    expect((await selfConfirmPrepaid(f.ordersDeps(), ref(o.orderId))).confirmed).toBe(false);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.confirm' } })).toBe(1);
  });

  it('on: a COD order, an unpaid prepaid order and a flagged one are left for a person', async () => {
    on(true);
    const cod = await f.place('pc-cod', { phone: '01700000503' });
    await placeInSection(f.ordersDeps(), ref(cod.orderId));
    expect(await selfConfirmPrepaid(f.ordersDeps(), ref(cod.orderId))).toMatchObject({ confirmed: false, skip: 'NOT_PREPAID' });
    const unpaid = await f.place('pc-unpaid', { phone: '01700000504', payment: { method: 'mobile', option: 'bkash' } });
    await placeInSection(f.ordersDeps(), ref(unpaid.orderId));
    expect(['PAYMENT', 'DUE']).toContain((await selfConfirmPrepaid(f.ordersDeps(), ref(unpaid.orderId))).skip);
    const flagged = await f.place('pc-flag', { phone: '01700000505', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await placeInSection(f.ordersDeps(), ref(flagged.orderId));
    await db().order.update({ where: { id: flagged.orderId }, data: { riskSection: 'watch' } });
    expect(await selfConfirmPrepaid(f.ordersDeps(), ref(flagged.orderId))).toMatchObject({ confirmed: false, skip: 'FLAGGED' });
    for (const id of [cod.orderId, unpaid.orderId, flagged.orderId]) expect((await row(id)).status).toBe('PLACED');
  });

  it('on: an open review or a cancel request keeps it for a person (the confirm guards hold)', async () => {
    on(true);
    const rv = await f.place('pc-review', { phone: '01700000506', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await placeInSection(f.ordersDeps(), ref(rv.orderId));
    await db().fraudAlert.create({ data: { storeId: f.S, orderId: rv.orderId, matchedOrderIds: [], proposedAction: 'WARN', summary: { section: 'risk', kind: 'risk' } } });
    expect(await selfConfirmPrepaid(f.ordersDeps(), ref(rv.orderId))).toMatchObject({ confirmed: false, skip: 'IN_REVIEW' });
    const cr = await f.place('pc-cancel', { phone: '01700000507', payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await placeInSection(f.ordersDeps(), ref(cr.orderId));
    await db().order.update({ where: { id: cr.orderId }, data: { cancelRequestedAt: new Date() } });
    expect(await selfConfirmPrepaid(f.ordersDeps(), ref(cr.orderId))).toMatchObject({ confirmed: false, skip: 'CANCEL_REQUESTED' });
    for (const id of [rv.orderId, cr.orderId]) expect((await row(id)).status).toBe('PLACED');
  });
});
