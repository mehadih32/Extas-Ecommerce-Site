// S06 · PR 556 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the in-transit duplicate notice. Off as
// shipped (nothing, and no look-up counted); on, the very piece already on its way to this customer shows — with the
// earlier order's number and tracking link only when that order is tied to this browser, device or account (a stranger
// typing the number learns nothing unless the owner allows the number alone, and then no number or link). SIM-F-015: the
// customer is not the number alone — the same device with another number is found. A delivered or cancelled order, or
// another size of the piece, is not a duplicate here. Each firing is kept once with its campaign; the answer is kept
// once; the report counts by campaign. Past the look-up limit the check answers nothing. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskS06Settings } from '@extas/settings';
import { transitDuplicateAnswer, transitDuplicateCheck, transitDuplicateReport, type TransitContext } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const ON = { ...riskS06Settings['checkout.transitDuplicate'].default, enabled: true };

describe.skipIf(!HAS_TEST_DB)('PR 556 · the in-transit duplicate notice (PostgreSQL)', () => {
  let f: OrdersFixture;
  let earlier: { orderId: string; number: string; visitorId: string };
  let bag: { cartId: string; visitorId: string };
  const PHONE = '01700000556';
  beforeAll(async () => {
    f = await setUpOrders('transit-dup');
    earlier = await f.place('td-earlier', { phone: PHONE, lines: [{ variantId: f.v.skyM }] });
    await f.t.prisma.order.update({ where: { id: earlier.orderId }, data: { status: 'IN_TRANSIT', deviceId: 'device-td-1' } });
    bag = await f.bag('td-now', [{ variantId: f.v.skyM }, { variantId: f.v.teeM }]);
  });
  afterAll(async () => {
    await f?.t.drop();
  });
  const ctx = (over: Partial<TransitContext> = {}): TransitContext => ({ storeId: f.S, cartId: bag.cartId, visitorId: bag.visitorId, deviceId: null, customerId: null, ip: '192.0.2.56', ...over });
  const check = (over: Partial<TransitContext> = {}, phone = PHONE, campaign?: Record<string, string>) => transitDuplicateCheck(f.ordersDeps(), ctx(over), { phone, ...(campaign ? { campaign } : {}) });
  const fired = () => f.t.prisma.duplicateNoticeEvent.findMany({ where: { storeId: f.S }, orderBy: { createdAt: 'asc' } });

  it('off as shipped: nothing shows and nothing is counted', async () => {
    expect(await check({ visitorId: earlier.visitorId })).toEqual({ enabled: false, notices: [] });
    expect(await f.t.prisma.securityEvent.count({ where: { kind: 'checkout.transit.lookup' } })).toBe(0);
    expect(await fired()).toEqual([]);
  });

  it('on: the same piece already on its way from this browser shows with its number and tracking link; the other piece does not', async () => {
    f.overrides.set('checkout.transitDuplicate', ON);
    const r = await check({ visitorId: earlier.visitorId }, '+8801700000556', { source: 'facebook', campaign: 'oct-polo' });
    expect(r.enabled).toBe(true);
    expect(r.notices).toHaveLength(1);
    const line = await f.t.prisma.cartItem.findFirstOrThrow({ where: { cartId: bag.cartId, variantId: f.v.skyM } });
    expect(r.notices[0]).toMatchObject({ lineId: line.id, variantId: f.v.skyM, number: earlier.number, href: `/account/orders/${earlier.number}` });
    const rows = await fired();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ existingOrderId: earlier.orderId, variantId: f.v.skyM, action: 'shown', campaignRef: 'oct-polo', differentSize: false, utm: { source: 'facebook', medium: null, campaign: 'oct-polo' } });
    // the number typed again: the same firing, not a second one
    const again = await check({ visitorId: earlier.visitorId });
    expect(again.notices[0]!.eventId).toBe(r.notices[0]!.eventId);
    expect(await fired()).toHaveLength(1);
  });

  it('a stranger typing the number learns nothing; with "by the number alone" the notice shows without the number or link', async () => {
    expect((await check()).notices).toEqual([]);
    f.overrides.set('checkout.transitDuplicate', { ...ON, byPhoneAlone: true });
    const r = await check();
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatchObject({ number: null, href: null, variantId: f.v.skyM });
    f.overrides.set('checkout.transitDuplicate', ON);
  });

  it('SIM-F-015: the same device with another number is the same customer (not the number alone)', async () => {
    const r = await check({ deviceId: 'device-td-1' }, '01800000556');
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]!.number).toBe(earlier.number);
  });

  it('another size, a delivered order or one not yet handed over (unless any open order counts) is not a notice', async () => {
    const other = await f.bag('td-size', [{ variantId: f.v.skyL }]);
    expect((await check({ cartId: other.cartId, visitorId: earlier.visitorId })).notices).toEqual([]);
    await f.t.prisma.order.update({ where: { id: earlier.orderId }, data: { status: 'CONFIRMED' } });
    expect((await check({ visitorId: earlier.visitorId })).notices).toEqual([]);
    f.overrides.set('checkout.transitDuplicate', { ...ON, include: 'open' });
    expect((await check({ visitorId: earlier.visitorId })).notices).toHaveLength(1);
    await f.t.prisma.order.update({ where: { id: earlier.orderId }, data: { status: 'DELIVERED' } });
    expect((await check({ visitorId: earlier.visitorId })).notices).toEqual([]);
    await f.t.prisma.order.update({ where: { id: earlier.orderId }, data: { status: 'IN_TRANSIT' } });
    f.overrides.set('checkout.transitDuplicate', ON);
  });

  it('his answer is kept once beside the firing; an unknown notice is NOT_FOUND', async () => {
    const r = await check({ visitorId: earlier.visitorId });
    const eventId = r.notices[0]!.eventId;
    expect(await transitDuplicateAnswer(f.ordersDeps(), f.S, { eventId, action: 'kept' })).toEqual({ action: 'kept' });
    expect(await transitDuplicateAnswer(f.ordersDeps(), f.S, { eventId, action: 'removed' })).toEqual({ action: 'kept' });
    const kept = (await fired()).filter((x) => x.action === 'kept');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ existingOrderId: earlier.orderId, campaignRef: 'oct-polo' });
    expect(await code(transitDuplicateAnswer(f.ordersDeps(), f.S, { eventId: '00000000-0000-7000-8000-000000000556', action: 'kept' }))).toBe('NOT_FOUND');
    expect(await code(transitDuplicateAnswer(f.ordersDeps(), f.S, { eventId, action: 'cancel' }))).toBe('INVALID_INPUT');
  });

  it('the report counts the notices by campaign (risk.report); a reader without it is refused', async () => {
    const rep = await transitDuplicateReport(f.ordersDeps(), f.staff);
    expect(rep.days).toBe(ON.reportDays);
    expect(rep.rows.find((x) => x.campaign === 'oct-polo')).toMatchObject({ shown: 1, kept: 1, removed: 0 });
    expect(await code(transitDuplicateReport(f.ordersDeps(), f.reader))).toBe('FORBIDDEN');
  });

  it('past the look-up limit the check answers nothing (the form is never stopped)', async () => {
    f.overrides.set('delivery.phoneFirst.rateLimit', 1);
    const from = { visitorId: earlier.visitorId, ip: '192.0.2.99' };
    expect((await check(from)).notices).toHaveLength(1);
    expect(await check(from)).toEqual({ enabled: true, notices: [] });
    f.overrides.delete('delivery.phoneFirst.rateLimit');
  });
});
