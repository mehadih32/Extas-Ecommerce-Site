// PR 566 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the support explanation reads the order's own
// stored facts — the band and charge the checkout stored, the place it read, the advance the order service was asked
// to wait for (who, when, the level), the checkout's flag layer and the risk assessment — and a reader with only
// `orders.read` may see it. A gift paid ahead and Cash on Delivery off at checkout come from the placed event's own
// `codOff`. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { awaitAdvance, orderExplanation, staffBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 566 · support explanation (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;

  beforeAll(async () => {
    f = await setUpOrders('explain');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it("a Cash on Delivery order: no advance, and the band's charge as the customer was shown it", async () => {
    const o = await f.place('explain-cod');
    const placed = await db().orderEvent.findFirstOrThrow({
      where: { orderId: o.orderId, type: 'order.placed' },
    });
    expect(placed.data).toMatchObject({ codOff: null });
    const e = await orderExplanation(f.ordersDeps(), f.reader, o.orderId);
    expect(e?.advance).toMatchObject({ kind: 'none', say: null });
    expect(e?.charge).toMatchObject({ state: 'charge', amountMinor: 6_000 });
    expect(e?.charge.why[0]).toMatchObject({
      code: 'band',
      values: { charge: 6_000 },
    });
    expect(e?.charge.say).toMatchObject({
      key: 'chargeBand',
      values: { charge: 6_000 },
    });
    // SIM-F-003: the owner changes the band's charge later — the order still explains what it stored
    await db().deliveryBand.update({
      where: { storeId_key: { storeId: f.S, key: 'dhaka-city' } },
      data: { chargeMinor: 7_000 },
    });
    try {
      const again = await orderExplanation(f.ordersDeps(), f.reader, o.orderId);
      expect(again?.charge.amountMinor).toBe(6_000);
      expect(again?.charge.why).toContainEqual({
        code: 'bandNow',
        values: { now: 7_000, charge: 6_000 },
      });
    } finally {
      await db().deliveryBand.update({
        where: { storeId_key: { storeId: f.S, key: 'dhaka-city' } },
        data: { chargeMinor: 6_000 },
      });
    }
  });

  it('the team asked for the delivery charge ahead: who, the level (team only), the flag layer and the risk', async () => {
    const o = await f.place('explain-adv');
    await awaitAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.orderId }, staffBy(f.staff.actor), { requiredMinor: 6_000, level: 'soft' });
    const layer = await db().checkoutParameterLayer.create({
      data: {
        storeId: f.S,
        name: 'Test layer',
        position: 1,
        conditions: {},
        requirement: 'DELIVERY_CHARGE',
      },
    });
    await db().checkoutFlagEvent.create({
      data: {
        storeId: f.S,
        layerId: layer.id,
        orderId: o.orderId,
        requirement: 'DELIVERY_CHARGE',
        outcome: 'ORDERED',
      },
    });
    await db().riskAssessment.create({
      data: {
        storeId: f.S,
        orderId: o.orderId,
        score: 61,
        bandKey: 'soft',
        signals: [],
      },
    });
    const e = await orderExplanation(f.ordersDeps(), f.reader, o.orderId);
    expect(e?.advance).toMatchObject({
      kind: 'delivery',
      amountMinor: 6_000,
      paidMinor: 0,
    });
    expect(e?.advance.why.map((w) => w.code)).toEqual(['layer', 'asked', 'level', 'deliveryNotFull', 'risk', 'paidSoFar']);
    expect(e?.advance.why.find((w) => w.code === 'asked')?.values).toMatchObject({ amount: 6_000, by: 'Orders Staff', actor: 'STAFF' });
    expect(e?.advance.why.find((w) => w.code === 'risk')).toMatchObject({
      values: { score: 61, band: 'soft' },
      staffOnly: true,
    });
    expect(e?.advance.say).toEqual({
      key: 'advanceDelivery',
      values: { amount: 6_000, paid: 0 },
    });
  });

  it('no such order in this store is null; a person without orders.read is refused', async () => {
    expect(await orderExplanation(f.ordersDeps(), f.reader, '00000000-0000-7000-8000-000000000000')).toBeNull();
    const o = await f.place('explain-nobody');
    const nobody = await db().staffUser.create({
      data: {
        email: 'nobody-566@example.com',
        displayName: 'Nobody',
        passwordHash: 'not-a-login',
      },
    });
    await expect(orderExplanation(f.ordersDeps(), { actor: { staffUserId: nobody.id }, storeId: f.S }, o.orderId)).rejects.toMatchObject({ code: expect.any(String) });
  });
});
