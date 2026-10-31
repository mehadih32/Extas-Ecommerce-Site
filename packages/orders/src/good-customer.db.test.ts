// PR 524 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): false-positive protection. Off as shipped, and
// nobody counts as a good customer until the owner sets the number. On, a customer with enough delivered orders and no
// more refusals than allowed is never held by a risk level by itself: the order stays as it was, carries the "good
// customer" mark and a timeline line naming the skipped hold. Too many refusals, and the hold happens as before. The stop
// report lists what the engine stopped in the window with its rule, confidence and outcome, tallies each rule and flags
// one whose stopped orders were delivered all the same too often; a reader without the right gets nothing. Every value
// is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { NO_RISK_ACTIONS, registry, riskSettings } from '@extas/settings';
import { assessRisk, GOOD_CUSTOMER_EVENT, GOOD_CUSTOMER_FLAG, RISK_LEVEL_EVENT, screenOrder, stopReport } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 524 · good customers and the stop report (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  // the test address always scores (addressUnsure), so every scored order lands in "high"
  const bands = [
    { key: 'low', en: 'Low', bn: 'কম', minScore: 0, tone: 'ok' as const },
    { key: 'high', en: 'High', bn: 'বেশি', minScore: 1, tone: 'bad' as const },
  ];
  const holdHigh = () => {
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
    f.overrides.set('risk.bands', bands);
    f.overrides.set('risk.levels', { ...registry['risk.levels'].default, enabled: true, levels: { low: NO_RISK_ACTIONS, high: { watch: false, hold: true, call: false, ask: 'none' } } });
  };
  const good = (v: Partial<(typeof registry)['risk.goodCustomer']['default']>) => f.overrides.set('risk.goodCustomer', { ...registry['risk.goodCustomer'].default, ...v });
  async function past(name: string, phone: string, status: 'DELIVERED' | 'RETURNED') {
    const o = await f.place(name, { phone });
    await db().order.update({ where: { id: o.orderId }, data: { status } });
    if (status === 'RETURNED') await db().orderEvent.create({ data: { storeId: f.S, orderId: o.orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: 'changed-mind', actorType: 'COURIER', source: 'courier' } });
    return o;
  }
  const row = (id: string) => db().order.findUniqueOrThrow({ where: { id }, select: { status: true, flags: true } });

  beforeAll(async () => {
    f = await setUpOrders('good_customer');
    // the timeline rows carry the database's own time; the reviews and the report's window carry the clock
    f.clock.now = new Date();
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off and unset as shipped: a known good number is held like anyone else', async () => {
    expect(registry['risk.goodCustomer'].default).toEqual({ enabled: false, minDelivered: null, maxRefused: 0 });
    holdHigh();
    await past('gc-off-1', '01700000601', 'DELIVERED');
    await past('gc-off-2', '01700000601', 'DELIVERED');
    const o = await f.place('gc-off-3', { phone: '01700000601' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    expect((await row(o.orderId)).status).toBe('ON_HOLD');
    // switched on without the number: still nobody
    good({ enabled: true });
    const o2 = await f.place('gc-off-4', { phone: '01700000601' });
    await assessRisk(f.ordersDeps(), ref(o2.orderId));
    expect((await row(o2.orderId)).status).toBe('ON_HOLD');
    expect(await db().orderEvent.count({ where: { type: GOOD_CUSTOMER_EVENT } })).toBe(0);
  });

  it('on: enough deliveries and no refusal → the level hold is skipped, marked and written; one refusal too many → held', async () => {
    holdHigh();
    good({ enabled: true, minDelivered: 2, maxRefused: 0 });
    await past('gc-a1', '01700000611', 'DELIVERED');
    await past('gc-a2', '01700000611', 'DELIVERED');
    const o = await f.place('gc-a3', { phone: '01700000611' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    const r = await row(o.orderId);
    expect(r.status).toBe('PLACED');
    expect(r.flags).toContain(GOOD_CUSTOMER_FLAG);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: GOOD_CUSTOMER_EVENT } });
    expect(ev).toMatchObject({ actorType: 'SYSTEM', reasonCode: 'levelHold', toStatus: null });
    expect(ev.data).toMatchObject({ skipped: 'levelHold', delivered: 2, refused: 0 });
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } })).data).toMatchObject({ hold: 'GOOD_CUSTOMER' });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.hold' } })).toBe(0);
    // the same history with one refusal: no longer good, held as the level says
    await past('gc-b1', '01700000612', 'DELIVERED');
    await past('gc-b2', '01700000612', 'DELIVERED');
    await past('gc-b3', '01700000612', 'RETURNED');
    const o2 = await f.place('gc-b4', { phone: '01700000612' });
    await assessRisk(f.ordersDeps(), ref(o2.orderId));
    expect(await row(o2.orderId)).toMatchObject({ status: 'ON_HOLD', flags: expect.not.arrayContaining([GOOD_CUSTOMER_FLAG]) });
    // the owner allows one refusal: a new order of that number is spared
    good({ enabled: true, minDelivered: 2, maxRefused: 1 });
    const o3 = await f.place('gc-b5', { phone: '01700000612' });
    await assessRisk(f.ordersDeps(), ref(o3.orderId));
    expect((await row(o3.orderId)).status).toBe('PLACED');
  });

  it('a risk level\'s automatic advance request is skipped too (the ask stays a proposal); with the auto option off nothing is written', async () => {
    holdHigh();
    good({ enabled: true, minDelivered: 2, maxRefused: 0 });
    f.overrides.set('risk.levels', { ...registry['risk.levels'].default, enabled: true, levels: { low: NO_RISK_ACTIONS, high: { watch: false, hold: false, call: false, ask: 'full' } } });
    await past('gc-v1', '01700000631', 'DELIVERED');
    await past('gc-v2', '01700000631', 'DELIVERED');
    // the auto option off: the ask is only a proposal anyway, nothing is skipped
    const o1 = await f.place('gc-v3', { phone: '01700000631' });
    await assessRisk(f.ordersDeps(), ref(o1.orderId));
    expect(await db().orderEvent.count({ where: { orderId: o1.orderId, type: GOOD_CUSTOMER_EVENT } })).toBe(0);
    f.overrides.set('orders.advanceRequest', { ...registry['orders.advanceRequest'].default, auto: true });
    const o2 = await f.place('gc-v4', { phone: '01700000631' });
    await assessRisk(f.ordersDeps(), ref(o2.orderId));
    expect(await db().orderEvent.count({ where: { orderId: o2.orderId, type: 'order.awaitAdvance' } })).toBe(0);
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: o2.orderId, type: GOOD_CUSTOMER_EVENT } })).data).toMatchObject({ skipped: 'levelAdvance', delivered: 2 });
    expect(await row(o2.orderId)).toMatchObject({ status: 'PLACED', flags: expect.arrayContaining([GOOD_CUSTOMER_FLAG]) });
    f.overrides.delete('orders.advanceRequest');
  });

  it('the duplicate check: a good customer\'s look-alike order still opens a review for a person, but is not held by itself', async () => {
    good({ enabled: true, minDelivered: 2, maxRefused: 0 });
    f.overrides.set('orders.duplicates', { enabled: true, lookbackDays: 5, reviewFrom: 'high', autoHold: true });
    await past('gc-d1', '01700000621', 'DELIVERED');
    await past('gc-d2', '01700000621', 'DELIVERED');
    await f.place('gc-d3', { phone: '01700000621', lines: [{ variantId: f.v.skyM }] });
    const b = await f.place('gc-d4', { phone: '01700000621', lines: [{ variantId: f.v.skyM }] });
    const r = await screenOrder(f.ordersDeps(), ref(b.orderId));
    expect(r).toMatchObject({ severity: 'high', held: false });
    expect(r.alertId).toBeTruthy();
    expect(await row(b.orderId)).toMatchObject({ status: 'PLACED', flags: expect.arrayContaining([GOOD_CUSTOMER_FLAG]) });
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: GOOD_CUSTOMER_EVENT } })).data).toMatchObject({ skipped: 'duplicateHold', delivered: 2 });
    f.overrides.delete('orders.duplicates');
  });

  it('the stop report: the engine\'s holds with rule, band, score and outcome; the tally flags a rule delivered too often; spared counted', async () => {
    f.clock.now = new Date(Math.max(Date.now(), f.clock.now.getTime()) + 60_000);
    const before = await stopReport(f.ordersDeps(), f.staff);
    expect(before.days).toBe(7);
    expect(before.warnWrongPercent).toBeNull();
    const held = before.rows.filter((r) => r.rule === 'levelHold');
    expect(held.length).toBeGreaterThanOrEqual(3);
    expect(held[0]).toMatchObject({ detail: 'high', outcome: 'open' });
    expect(typeof held[0]!.confidence).toBe('number');
    expect(before.spared).toBe(4);
    // the spared look-alike's review is listed (a person still decides it); its hold is not, there was none
    expect(before.rows.filter((r) => r.rule === 'duplicateReview')).toHaveLength(1);
    expect(before.rows.filter((r) => r.rule === 'duplicateHold')).toHaveLength(0);
    expect(before.rules.find((t) => t.rule === 'levelHold')).toMatchObject({ flagged: false, wrongRate: null });
    // two held orders delivered all the same, one refused: 2 of 3 ended → 67% wrong
    const [a, b, c] = held;
    await db().order.update({ where: { id: a!.orderId }, data: { status: 'DELIVERED' } });
    await db().order.update({ where: { id: b!.orderId }, data: { status: 'DELIVERED' } });
    await db().order.update({ where: { id: c!.orderId }, data: { status: 'RETURNED' } });
    f.overrides.set('risk.stopReport', { ...registry['risk.stopReport'].default, warnWrongPercent: 50, minStops: 3 });
    const after = await stopReport(f.ordersDeps(), f.staff);
    const t = after.rules.find((x) => x.rule === 'levelHold')!;
    expect(t).toMatchObject({ delivered: 2, refused: 1, flagged: true });
    expect(t.wrongRate).toBeCloseTo(2 / 3);
    // not enough ended stops for the owner's minimum: not flagged
    f.overrides.set('risk.stopReport', { ...registry['risk.stopReport'].default, warnWrongPercent: 50, minStops: 4 });
    expect((await stopReport(f.ordersDeps(), f.staff)).rules.find((x) => x.rule === 'levelHold')!.flagged).toBe(false);
    // the window: a week later the stops are gone
    f.clock.now = new Date(f.clock.now.getTime() + 8 * 86_400_000);
    expect((await stopReport(f.ordersDeps(), f.staff)).rows).toHaveLength(0);
    await expect(stopReport(f.ordersDeps(), f.reader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
