// Follow-up 372 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real
// checkout; skipped without TEST_DATABASE_ADMIN_URL): the couriers' own status calls go into the same applyEvents as a
// read — off as shipped, refused without the typed-in token or with a wrong one, the store found by its token, a call
// kept once (the same call again applies nothing), the order following its parcel, a practice parcel never moved by
// a real call, an unknown parcel answered and kept, and the parcel counted as read so the hourly read skips it.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, PATHAO_PROVIDER, STEADFAST_PROVIDER, type Connections } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { bookOrders, receiveCourierWebhook, trackParcels, type CourierWebhookDeps } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('follow-up 372 · courier webhooks (PostgreSQL)', () => {
  let f: ShippingFixture;
  let steadfast: string;
  let pathao: string;
  const sf = mockCourierWorld(STEADFAST_PROVIDER);
  const pt = mockCourierWorld(PATHAO_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const tokens: Record<string, string | null> = { webhookToken: 'sf-test-token', webhookSecret: 'pt-test-secret' };
  let integrationId = '';
  const deps = (): CourierWebhookDeps => {
    const base = f.shippingDeps();
    const secretOf: Connections['secretOf'] = async (_kind, field, where = {}) => {
      const v = tokens[field];
      return v && where.storeId === f.S ? { value: v, integrationId, provider: where.provider ?? '', mode: 'LIVE', storeId: f.S } : null;
    };
    return { ...base, connections: { use: base.connections.use, secretOf } };
  };
  const call = (provider: string, body: unknown, headers: Record<string, string>) =>
    receiveCourierWebhook(deps(), provider, { rawBody: typeof body === 'string' ? body : JSON.stringify(body), headers: { get: (k) => headers[k.toLowerCase()] ?? null } });
  const bearer = (t = 'sf-test-token') => ({ authorization: `Bearer ${t}` });
  /** A confirmed order booked with the courier, its parcel then made a real (LIVE) one. */
  const booked = async (name: string, courierAccountId: string, live = true) => {
    const o = await f.place(name, { phone: `0170000${String(3720 + ++n).padStart(4, '0')}` });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId }, orderBy: { attempt: 'desc' } });
    if (live) await db().shipment.update({ where: { id: s.id }, data: { mode: 'LIVE' } });
    return { ...o, shipment: s };
  };
  const on = () => f.overrides.set('delivery.courier.webhooks', { enabled: true, maxBodyKb: 8 });

  beforeAll(async () => {
    f = await setUpShipping('shipping_webhooks');
    steadfast = await f.courier(STEADFAST_PROVIDER, 'Steadfast hooks');
    pathao = await f.courier(PATHAO_PROVIDER, 'Pathao hooks');
    for (const w of [sf, pt]) {
      w.reset();
      w.useClock(() => f.clock.now.getTime());
    }
    await db().productVariant.updateMany({ data: { weightGrams: 300 } });
    const row = await db().integration.create({ data: { kind: 'COURIER', provider: PATHAO_PROVIDER, name: 'Pathao hooks', storeId: f.S, mode: 'MOCK', enabled: false, config: { storeId: '1', webhookReply: 'reply-test-value' } } });
    integrationId = row.id;
  });
  afterAll(async () => {
    sf.reset();
    pt.reset();
    await f?.t.drop();
  });

  it('off as shipped: every call is answered not found and nothing is read or kept', async () => {
    const o = await booked('wh-off', steadfast);
    const r = await call(STEADFAST_PROVIDER, { notification_type: 'delivery_status', consignment_id: o.shipment.consignmentId, status: 'delivered' }, bearer());
    expect(r).toMatchObject({ status: 404, code: 'OFF' });
    expect(await db().webhookEvent.count({ where: { source: 'courier:steadfast' } })).toBe(0);
  });

  it('refused without the token, with a wrong one, while none is typed in, unknown couriers and oversized bodies', async () => {
    on();
    const body = { notification_type: 'delivery_status', consignment_id: 'nope', status: 'delivered' };
    expect(await call(STEADFAST_PROVIDER, body, {})).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(await call(STEADFAST_PROVIDER, body, bearer('wrong'))).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(await call('mockCourier', body, bearer())).toMatchObject({ status: 404 });
    expect(await call(STEADFAST_PROVIDER, 'x'.repeat(9 * 1024), bearer())).toMatchObject({ status: 413, code: 'TOO_LARGE' });
    expect(await call(STEADFAST_PROVIDER, '{not json', bearer())).toMatchObject({ status: 400, code: 'BAD_JSON' });
    tokens.webhookToken = null;
    expect(await call(STEADFAST_PROVIDER, body, bearer())).toMatchObject({ status: 503, code: 'NOT_CONNECTED' });
    tokens.webhookToken = 'sf-test-token';
  });

  it('Steadfast: the parcel and its order follow the call; the same call again applies nothing; the hourly read skips it', async () => {
    on();
    const o = await booked('wh-sf', steadfast);
    const picked = { notification_type: 'delivery_status', consignment_id: o.shipment.consignmentId, invoice: o.shipment.merchantRef, status: 'pending', updated_at: '2026-11-07 10:00:00' };
    const r1 = await call(STEADFAST_PROVIDER, picked, bearer());
    expect(r1).toMatchObject({ status: 200, code: 'OK', shipmentId: o.shipment.id, changed: true });
    const p1 = await db().shipment.findUniqueOrThrow({ where: { id: o.shipment.id } });
    expect(p1).toMatchObject({ status: 'IN_TRANSIT', providerStatus: 'pending' });
    expect(p1.lastTrackedAt).not.toBeNull();
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('IN_TRANSIT');
    // the same call again: kept once, nothing more applied
    expect(await call(STEADFAST_PROVIDER, picked, bearer())).toMatchObject({ status: 200, code: 'DUPLICATE' });
    expect(await db().shipmentEvent.count({ where: { shipmentId: o.shipment.id, source: 'webhook' } })).toBe(1);
    // the hourly read does not read a parcel its courier just told the shop about
    const run = await trackParcels(f.shippingDeps(), f.S);
    const read = await db().shipment.findUniqueOrThrow({ where: { id: o.shipment.id } });
    expect(read.lastTrackedAt?.getTime()).toBe(p1.lastTrackedAt?.getTime());
    expect(run.off).toBe(false);
    const done = await call(STEADFAST_PROVIDER, { ...picked, status: 'delivered', cod_amount: 1200, delivery_charge: 60, updated_at: '2026-11-07 15:00:00' }, bearer());
    expect(done).toMatchObject({ code: 'OK', changed: true });
    const p2 = await db().shipment.findUniqueOrThrow({ where: { id: o.shipment.id } });
    expect(p2).toMatchObject({ status: 'DELIVERED', codCollectedMinor: 120000 });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('DELIVERED');
    const kept = await db().webhookEvent.findMany({ where: { source: 'courier:steadfast', storeId: f.S, status: 'PROCESSED' } });
    expect(kept).toHaveLength(2);
  });

  it('a practice parcel is never moved by a real call; an unknown parcel is answered and kept; a tracking message is kept only', async () => {
    on();
    const practice = await booked('wh-practice', steadfast, false);
    const r = await call(STEADFAST_PROVIDER, { notification_type: 'delivery_status', consignment_id: practice.shipment.consignmentId, status: 'delivered', updated_at: 'a' }, bearer());
    expect(r).toMatchObject({ status: 200, code: 'UNKNOWN_PARCEL' });
    expect((await db().shipment.findUniqueOrThrow({ where: { id: practice.shipment.id } })).status).toBe(practice.shipment.status);
    expect((await db().webhookEvent.findUniqueOrThrow({ where: { id: r.eventId! } })).status).toBe('IGNORED');
    const msg = await call(STEADFAST_PROVIDER, { notification_type: 'tracking_update', consignment_id: 77, tracking_message: 'At the hub', updated_at: 'b' }, bearer());
    expect(msg).toMatchObject({ status: 200, code: 'IGNORED' });
  });

  it("Pathao: the set-up check gets its reply header; a step found by the shop's reference moves the parcel", async () => {
    on();
    const head = { 'x-pathao-signature': 'pt-test-secret' };
    expect(await call(PATHAO_PROVIDER, { event: 'webhook_integration' }, head)).toEqual({ status: 202, code: 'HANDSHAKE', headers: { 'X-Pathao-Merchant-Webhook-Integration-Secret': 'reply-test-value' } });
    expect(await call(PATHAO_PROVIDER, { event: 'webhook_integration' }, { 'x-pathao-signature': 'sf-test-token' })).toMatchObject({ status: 401 });
    const o = await booked('wh-pt', pathao);
    const r = await call(PATHAO_PROVIDER, { event: 'order.picked', merchant_order_id: o.shipment.merchantRef, updated_at: '2026-11-07 11:00:00', timestamp: '2026-11-07T05:00:00+00:00' }, head);
    expect(r).toMatchObject({ status: 202, code: 'OK', shipmentId: o.shipment.id });
    const p = await db().shipment.findUniqueOrThrow({ where: { id: o.shipment.id } });
    expect(p).toMatchObject({ status: 'PICKED_UP' });
    expect(p.pickedAt?.toISOString()).toBe('2026-11-07T05:00:00.000Z');
    expect(await call(PATHAO_PROVIDER, { event: 'order.updated', consignment_id: o.shipment.consignmentId }, head)).toMatchObject({ status: 202, code: 'IGNORED' });
  });
});
