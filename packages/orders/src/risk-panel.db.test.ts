// PR 160 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the risk panel says why the score is what it is
// from what was stored — never recomputed silently: a change of the owner's weights leaves the score as it was and says
// the rules changed; the team's edit and "score again" add dated ones, the earlier kept. The panel needs
// `orders.risk.read` ("score again" `orders.risk.decide`). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskSettings } from '@extas/settings';
import { assessRisk, editOrder, orderRisk, reassessOrder } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 160 · the risk panel (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const on = () => f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
  /** The test address (Dhanmondi) names a place the sample gazetteer has twice: the band is sure, the place is not. */
  const UNSURE = riskSettings['risk.signals'].default.addressUnsure.weight;
  const NEW = riskSettings['risk.signals'].default.newPhone.weight;

  beforeAll(async () => {
    f = await setUpOrders('risk_panel');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the panel says why — never recomputed silently; the team edit and "score again" add dated ones', async () => {
    on();
    const o = await f.place('risk-p1', { phone: '01700000207' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    // the reader may see the history but not the risk panel
    await expect(orderRisk(f.ordersDeps(), f.reader, o.orderId)).rejects.toMatchObject({ code: expect.any(String) });
    let p = await orderRisk(f.ordersDeps(), f.staff, o.orderId);
    expect(p!.current).toMatchObject({ score: NEW + UNSURE, after: 'placed', fired: [{ key: 'newPhone', weight: NEW, values: {} }, { key: 'addressUnsure', weight: UNSURE }] });
    expect(p!.current!.band).toMatchObject({ key: 'low', en: 'Low', bn: 'কম' });
    expect(p!.canRescore).toBe(true);
    expect(p!.rulesChanged).toBe(false);
    // the owner raises a weight: the stored score stays as it was, the panel says the rules changed
    const s = structuredClone(riskSettings['risk.signals'].default);
    s.newPhone.weight = 40;
    f.overrides.set('risk.signals', s);
    p = await orderRisk(f.ordersDeps(), f.staff, o.orderId);
    expect(p!.current!.score).toBe(NEW + UNSURE);
    expect(p!.rulesChanged).toBe(true);
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { riskScore: true } })).riskScore).toBe(NEW + UNSURE);
    // a person scores it again: a new assessment with the new weights, the old one kept
    const again = await reassessOrder(f.ordersDeps(), f.staff, o.orderId);
    expect(again.score).toBe(40 + UNSURE);
    p = await orderRisk(f.ordersDeps(), f.staff, o.orderId);
    expect(p!.current).toMatchObject({ score: 40 + UNSURE, after: 'manual' });
    expect(p!.current!.band.key).toBe('medium');
    expect(p!.earlier.map((x) => x.score)).toEqual([NEW + UNSURE]);
    expect(p!.rulesChanged).toBe(false);
    // the team changes the phone: scored again after the edit
    const v = (await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { version: true } })).version;
    await editOrder(f.ordersDeps(), f.staff, o.orderId, { reasonKey: 'wrong-phone', phone: '01700000208' }, { version: v });
    p = await orderRisk(f.ordersDeps(), f.staff, o.orderId);
    expect(p!.current!.after).toBe('edit');
    expect(p!.earlier).toHaveLength(2);
    expect(await db().riskAssessment.count({ where: { orderId: o.orderId } })).toBe(3);
    f.overrides.delete('risk.signals');
  });

  it('never scored: no current score; the owner hides the card or switches the model off; another store reads nothing', async () => {
    f.overrides.delete('risk.score');
    const o = await f.place('risk-p2', { phone: '01700000212' });
    let p = await orderRisk(f.ordersDeps(), f.staff, o.orderId);
    expect(p).toMatchObject({ enabled: false, current: null, earlier: [], rulesChanged: false, canRescore: false });
    expect(p!.phone.summary.orders).toBe(0);
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, showOnOrder: false });
    p = await orderRisk(f.ordersDeps(), f.staff, o.orderId);
    expect(p!.showOnOrder).toBe(false);
    f.overrides.delete('risk.score');
    expect(await orderRisk(f.ordersDeps(), f.staff, 'not-an-id')).toBeNull();
    expect(await orderRisk(f.ordersDeps(), f.staff, '01a16af2-30f0-7462-aab8-719bb3ce51b1')).toBeNull();
  });
});
