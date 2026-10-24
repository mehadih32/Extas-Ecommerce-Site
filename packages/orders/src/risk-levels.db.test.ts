// PR 161 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the actions per risk level. Off by default (the
// master and every action), a score does nothing more than before; switched on, the band the score reached writes its
// steps once — the watch mark, a confirmation call task, the advance it proposes (never asked by itself) — and its hold
// holds the order with the owner's reason, so a held order is never booked (SIM-F-014, the register's acceptance test).
// A score again in the same band does nothing again; a higher band writes its own steps. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { NO_RISK_ACTIONS, registry, riskSettings } from '@extas/settings';
import { assessRisk, bookWith, confirmOrder, listOrders, reassessOrder, releaseOrder, riskLevels, RISK_LEVEL_CALL_REASON, RISK_LEVEL_EVENT, RISK_WATCH_FLAG, orderRisk, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 161 · actions per risk level (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  // the test address scores newPhone + addressUnsure (10 + 5): these bands put a first order in "high", a known one lower
  const bands = (high: number) => [
    { key: 'low', en: 'Low', bn: 'কম', minScore: 0, tone: 'ok' as const },
    { key: 'medium', en: 'Medium', bn: 'মাঝারি', minScore: 5, tone: 'warn' as const },
    { key: 'high', en: 'High', bn: 'বেশি', minScore: high, tone: 'bad' as const },
  ];
  const scoreOn = () => f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
  const levels = (v: Partial<(typeof registry)['risk.levels']['default']>) => f.overrides.set('risk.levels', { ...registry['risk.levels'].default, ...v });

  beforeAll(async () => {
    f = await setUpOrders('risk_levels');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default (CN-018): the master and every action off; a scored order gets no level row, mark, hold or call', async () => {
    const d = registry['risk.levels'].default;
    expect(d.enabled).toBe(false);
    expect(Object.values(d.levels).every((l) => !l.watch && !l.hold && !l.call && l.ask === 'none')).toBe(true);
    expect(d.partialPercent).toBeNull();
    scoreOn();
    f.overrides.set('risk.bands', bands(15));
    const o = await f.place('lv-off', { phone: '01700000401' });
    expect((await assessRisk(f.ordersDeps(), ref(o.orderId)))!.band.key).toBe('high');
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } })).toBe(0);
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, flags: true } })).toEqual({ status: 'PLACED', flags: expect.not.arrayContaining([RISK_WATCH_FLAG]) });
    expect(await db().callTask.count({ where: { orderId: o.orderId, reason: RISK_LEVEL_CALL_REASON } })).toBe(0);
  });

  it('on: the high band holds with the owner reason, marks, calls and proposes the full advance — never asks by itself; SIM-F-014: never booked', async () => {
    scoreOn();
    f.overrides.set('risk.bands', bands(15));
    levels({ enabled: true, levels: { low: NO_RISK_ACTIONS, medium: NO_RISK_ACTIONS, high: { watch: true, hold: true, call: true, ask: 'full' } } });
    const o = await f.place('lv-high', { phone: '01700000402' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    const row = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true, flags: true, holdReasonCode: true, holdFromStatus: true, advanceRequiredMinor: true, riskBand: true } });
    expect(row).toMatchObject({ status: 'ON_HOLD', holdReasonCode: 'risk-check', holdFromStatus: 'PLACED', advanceRequiredMinor: null, riskBand: 'high' });
    expect(row.flags).toContain(RISK_WATCH_FLAG);
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } });
    expect(ev).toMatchObject({ reasonCode: 'high', actorType: 'SYSTEM', toStatus: null });
    expect(ev.data).toMatchObject({ band: 'high', watch: true, hold: 'held', call: true, ask: 'full', previous: null });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.hold' } })).toBe(1);
    expect(await db().callTask.count({ where: { orderId: o.orderId, reason: RISK_LEVEL_CALL_REASON, status: 'OPEN' } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.riskLevel' } })).toBe(1);
    // the ask is a proposal: nothing waits for an advance, no payment is asked, the panel shows it
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.awaitAdvance' } })).toBe(0);
    expect((await orderRisk(f.ordersDeps(), f.staff, o.orderId))!.level).toMatchObject({ band: 'high', ask: 'full', hold: 'held', watch: true, call: true });
    // SIM-F-014: a held order is not confirmed, not in "ready to book", and booking it is refused with nothing written
    await expect(confirmOrder(f.ordersDeps(), f.staff, o.orderId)).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    const ready = await listOrders(f.ordersDeps(), f.staff, { view: 'readyToBook' });
    expect(ready.rows.map((r) => r.id)).not.toContain(o.orderId);
    let wrote = false;
    await expect(
      bookWith(f.ordersDeps(), ref(o.orderId), systemBy('courier'), async () => {
        wrote = true;
        return { shipmentId: 'never' };
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(wrote).toBe(false);
    // a person releases it; then it goes the normal way
    await releaseOrder(f.ordersDeps(), f.staff, o.orderId, { note: 'called, all fine' });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true } })).status).toBe('PLACED');
  });

  it('once per band: a score again in the same band writes nothing again; a higher band writes its own steps', async () => {
    scoreOn();
    f.overrides.set('risk.bands', bands(30));
    levels({ enabled: true, levels: { low: NO_RISK_ACTIONS, medium: { watch: true, hold: false, call: false, ask: 'delivery' }, high: { watch: true, hold: true, call: false, ask: 'full' } } });
    const o = await f.place('lv-again', { phone: '01700000403' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } })).data).toMatchObject({ band: 'medium', ask: 'delivery', hold: null });
    await reassessOrder(f.ordersDeps(), f.staff, o.orderId);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } })).toBe(1);
    // the owner lowers the high threshold: "score again" puts it in high, which holds it now
    f.overrides.set('risk.bands', bands(15));
    await reassessOrder(f.ordersDeps(), f.staff, o.orderId);
    const evs = await db().orderEvent.findMany({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT }, orderBy: { createdAt: 'asc' } });
    expect(evs.map((e) => (e.data as { band: string }).band)).toEqual(['medium', 'high']);
    expect(evs[1]!.data).toMatchObject({ previous: 'medium', hold: 'held' });
    expect(evs[1]!.actorType).toBe('STAFF');
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true } })).status).toBe('ON_HOLD');
  });

  it('a hold reason the owner took off his list is said, never guessed; a band with nothing set does nothing', async () => {
    scoreOn();
    f.overrides.set('risk.bands', bands(15));
    levels({ enabled: true, holdReasonKey: 'no-such-reason', levels: { low: NO_RISK_ACTIONS, medium: NO_RISK_ACTIONS, high: { watch: false, hold: true, call: false, ask: 'none' } } });
    const o = await f.place('lv-noreason', { phone: '01700000404' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true } })).status).toBe('PLACED');
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } })).data).toMatchObject({ hold: 'NO_REASON' });
    // a partial ask without the owner's percent is no ask at all
    levels({ enabled: true, levels: { low: NO_RISK_ACTIONS, medium: NO_RISK_ACTIONS, high: NO_RISK_ACTIONS } });
    const p = await f.place('lv-nothing', { phone: '01700000405' });
    await assessRisk(f.ordersDeps(), ref(p.orderId));
    expect(await db().orderEvent.count({ where: { orderId: p.orderId, type: RISK_LEVEL_EVENT } })).toBe(0);
  });

  it('the Levels screen data: the bands, the hold reasons, the suggested set and a version; a reader of orders may not see it', async () => {
    f.overrides.set('risk.bands', bands(15));
    const v = await riskLevels(f.ordersDeps(), f.staff);
    expect(v.bands.map((b) => b.key)).toEqual(['low', 'medium', 'high']);
    expect(v.holdReasons.map((r) => r.key)).toContain('risk-check');
    expect(v.suggested).toMatchObject({ medium: { watch: true, call: true, ask: 'delivery' }, high: { hold: true, ask: 'full' } });
    expect(v.byDefault.enabled).toBe(false);
    expect(v.version).toMatch(/^[0-9a-f]{16}$/);
    await expect(riskLevels(f.ordersDeps(), f.reader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
