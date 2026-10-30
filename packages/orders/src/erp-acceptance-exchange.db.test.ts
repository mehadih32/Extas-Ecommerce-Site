// CN-029 Phase 2 · PR 621 — the ERP v6 acceptance drills of the exchange (a go-live gate; the books drills are in
// packages/inventory/test/erp-acceptance-books.db.test.ts), on PostgreSQL with the practice ERP behind the store's own
// connection. The owner's rules, written before the code they check:
// - the 72-hour exchange rule: from the courier's "delivered" as the ERP has it, 72 h − 1 ms may be approved and 72 h may
//   not, whatever the shop's own delivered mark says; the refusal sends nothing to the ERP;
// - an exchange never sent back: the ERP's night bills it after the 4-day watch and the shop's exchange is done;
// - store B can never approve store A's exchange (CN-029 §16).
// Every value is a made-up test value; the clock is fixed and moved by the tests.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveExchangeV6, openExchange, syncErpExchanges } from './index';
import { setUpErpOrders, type ErpFixture } from './test/erp-v6-fixture';

const HOUR = 3_600_000;

async function refusal(p: Promise<unknown>): Promise<{ code?: string; why?: unknown }> {
  try {
    await p;
    return {};
  } catch (e) {
    const x = e as { code?: string; data?: { why?: unknown } };
    return { code: x.code, why: x.data?.why };
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 621 · ERP v6 acceptance drills of the exchange (PostgreSQL, practice ERP)', () => {
  let f: ErpFixture;
  const db = () => f.t.prisma;
  const d = () => f.erpDeps();
  const erpOrderPosts = () => f.world.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/orders')).length;
  async function opened(name: string): Promise<{ orderId: string; exchangeId: string }> {
    const o = await f.shipped(name, [{ variantId: f.v.skyM, quantity: 1 }]);
    await f.delivered(o);
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId }, orderBy: { createdAt: 'asc' } });
    const ex = await openExchange(d(), f.staff, o.orderId, { reason: 'size', items: [{ orderItemId: line.id, newVariantId: f.v.skyL, quantity: 1 }] });
    return { orderId: o.orderId, exchangeId: ex.exchangeId };
  }

  beforeAll(async () => {
    f = await setUpErpOrders('accept_exchange');
    f.v6();
    f.v6(f.B);
    for (const id of Object.values(f.v)) f.world.setStock(await f.sku(id), 'SAMPLE-WH-1', { onHand: 50 });
  });
  afterAll(async () => {
    f?.restore();
    await f?.t.drop();
  });

  it('the 72-hour rule: 72 h after the courier`s "delivered" is closed (nothing sent), 72 h − 1 ms is open; the shop`s later mark does not stretch it; store B cannot approve it', async () => {
    const { orderId, exchangeId } = await opened('acc-72h');
    const start = f.clock.now;
    expect(await db().erpDeliveryResult.findFirstOrThrow({ where: { erpOrder: { orderId } } })).toMatchObject({ outcome: 'DELIVERED', at: start });
    await db().order.update({ where: { id: orderId }, data: { deliveredAt: new Date(start.getTime() + 24 * HOUR) } });
    try {
      f.clock.now = new Date(start.getTime() + 72 * HOUR);
      const posts = erpOrderPosts();
      expect((await refusal(approveExchangeV6(d(), f.staff, exchangeId))).why).toBe('WINDOW');
      expect(erpOrderPosts()).toBe(posts);
      expect((await refusal(approveExchangeV6(d(), f.staffB, exchangeId))).code).toBe('NOT_FOUND'); // qa-gate N4: store B never learns the exchange exists
      f.clock.now = new Date(start.getTime() + 72 * HOUR - 1);
      expect(await approveExchangeV6(d(), f.staff, exchangeId)).toMatchObject({ status: 'SENT' });
      expect(erpOrderPosts()).toBe(posts + 1);
    } finally {
      f.clock.now = new Date(start.getTime() + 72 * HOUR);
    }
  });

  it('an exchange never sent back: after the 4-day watch the ERP`s night bills it and the shop`s exchange is done', async () => {
    const { exchangeId } = await opened('acc-never-back');
    const r = await approveExchangeV6(d(), f.staff, exchangeId);
    await f.courierResult(r.newOrderId!, 'DELIVERED');
    await syncErpExchanges(d(), f.S);
    expect((await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } })).erpStatus).toBe('WAITING_RETURN');
    f.clock.now = new Date(f.clock.now.getTime() + 6 * 86_400_000);
    const billed = f.world.v6('SAMPLE-CO-1').runNight();
    expect(billed.filter((e) => e.type === 'exchange.billed').map((e) => e.data.reason)).toContain('DEADLINE_PASSED');
    await syncErpExchanges(d(), f.S);
    expect(await db().erpExchangeLink.findFirstOrThrow({ where: { exchangeId } })).toMatchObject({ erpStatus: 'BILLED' });
    expect((await db().exchange.findUniqueOrThrow({ where: { id: exchangeId } })).status).toBe('COMPLETED');
  });
});
