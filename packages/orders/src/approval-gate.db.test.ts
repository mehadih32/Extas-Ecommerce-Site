// PR 540 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the permission gate and the approval digest.
// The gate ships off. On, the engine acts on nothing by itself: a risk level's and the duplicate check's holds become
// proposed holds (a mark and a timeline line with the rule and the reason) that a person with `orders.hold` holds or
// lets go, each with a note; decided twice is refused; "one parcel by itself" stays a proposal and no advance is asked by
// itself. The digest counts a day's orders (moved on, to confirm, held by reason, another order running, duplicates) and
// lists what waits for a person. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { NO_RISK_ACTIONS, registry, riskSettings } from '@extas/settings';
import { approvalDigest, assessRisk, autoAdvance, BUNDLE_FLAG, bundleOnOrder, decideHoldProposal, HOLD_DECIDED_EVENT, HOLD_PROPOSED_EVENT, HOLD_PROPOSED_FLAG, holdProposalOf, RISK_LEVEL_EVENT, screenOrder, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 540 · the permission gate and the approval digest (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const row = (id: string) => db().order.findUniqueOrThrow({ where: { id }, select: { status: true, flags: true, holdReasonCode: true, orderGroupId: true } });
  const gate = (on: boolean) => f.overrides.set('risk.approval', { ...registry['risk.approval'].default, gate: on });
  const holdHigh = () => {
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
    f.overrides.set('risk.bands', [
      { key: 'low', en: 'Low', bn: 'কম', minScore: 0, tone: 'ok' as const },
      { key: 'high', en: 'High', bn: 'বেশি', minScore: 1, tone: 'bad' as const },
    ]);
    f.overrides.set('risk.levels', { ...registry['risk.levels'].default, enabled: true, levels: { low: NO_RISK_ACTIONS, high: { watch: false, hold: true, call: false, ask: 'full' } } });
  };

  beforeAll(async () => {
    f = await setUpOrders('approval_gate');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the gate ships off: a risk level holds as before', async () => {
    expect(registry['risk.approval'].default).toEqual({ gate: false, maxRows: 100 });
    holdHigh();
    const o = await f.place('ag-off', { phone: '01700000701' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    expect((await row(o.orderId)).status).toBe('ON_HOLD');
  });

  it('on: a level\'s hold is proposed; a person holds it with the reason and a note; decided twice refused; a reader refused', async () => {
    holdHigh();
    gate(true);
    const o = await f.place('ag-lv', { phone: '01700000702' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    expect(await row(o.orderId)).toMatchObject({ status: 'PLACED', flags: expect.arrayContaining([HOLD_PROPOSED_FLAG]) });
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: RISK_LEVEL_EVENT } })).data).toMatchObject({ hold: 'GATED' });
    expect((await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: HOLD_PROPOSED_EVENT } })).data).toEqual({ rule: 'levelHold', reasonKey: 'risk-check' });
    expect(await holdProposalOf(f.ordersDeps(), f.S, o.orderId)).toMatchObject({ rule: 'levelHold', reasonKey: 'risk-check' });
    expect(await code(decideHoldProposal(f.ordersDeps(), f.reader, o.orderId, { decision: 'hold', note: 'called, no answer' }))).toBe('FORBIDDEN');
    expect(await code(decideHoldProposal(f.ordersDeps(), f.staff, o.orderId, { decision: 'cancel', note: 'x' }))).toBe('INVALID_INPUT');
    expect(await decideHoldProposal(f.ordersDeps(), f.staff, o.orderId, { decision: 'hold', note: 'called, no answer' })).toEqual({ decision: 'hold' });
    const r = await row(o.orderId);
    expect(r).toMatchObject({ status: 'ON_HOLD', holdReasonCode: 'risk-check' });
    expect(r.flags).not.toContain(HOLD_PROPOSED_FLAG);
    const hold = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.hold' } });
    expect(hold).toMatchObject({ actorType: 'STAFF', message: 'called, no answer' });
    expect(hold.data).toMatchObject({ proposal: 'levelHold' });
    expect(await code(decideHoldProposal(f.ordersDeps(), f.staff, o.orderId, { decision: 'dismiss', note: 'again' }))).toBe('NOTHING_CHANGED');
    // no advance is asked by itself while the gate is on
    f.overrides.set('orders.advanceRequest', { ...registry['orders.advanceRequest'].default, auto: true });
    expect(await autoAdvance(f.ordersDeps(), ref(o.orderId), 'full', 'ag-adv', systemBy('risk-levels'))).toBe('GATED');
    f.overrides.delete('orders.advanceRequest');
  });

  it('on: the duplicate check\'s hold is proposed and let go with a note; "one parcel by itself" stays a proposal', async () => {
    gate(true);
    f.overrides.set('risk.levels', registry['risk.levels'].default);
    f.overrides.set('orders.duplicates', { enabled: true, lookbackDays: 5, reviewFrom: 'high', autoHold: true });
    await f.place('ag-d1', { phone: '01700000711', lines: [{ variantId: f.v.skyM }] });
    const b = await f.place('ag-d2', { phone: '01700000711', lines: [{ variantId: f.v.skyM }] });
    expect(await screenOrder(f.ordersDeps(), ref(b.orderId))).toMatchObject({ severity: 'high', held: false });
    expect(await row(b.orderId)).toMatchObject({ status: 'PLACED', flags: expect.arrayContaining([HOLD_PROPOSED_FLAG]) });
    expect(await decideHoldProposal(f.ordersDeps(), f.staff, b.orderId, { decision: 'dismiss', note: 'a gift for his brother, called' })).toEqual({ decision: 'dismiss' });
    expect(await row(b.orderId)).toMatchObject({ status: 'PLACED', flags: expect.not.arrayContaining([HOLD_PROPOSED_FLAG]) });
    expect(await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: HOLD_DECIDED_EVENT } })).toMatchObject({ actorType: 'STAFF', message: 'a gift for his brother, called', reasonCode: 'dismiss' });
    f.overrides.delete('orders.duplicates');
    f.overrides.set('risk.bundling', { ...registry['risk.bundling'].default, enabled: true, windowHours: 24, action: 'group' });
    await f.place('ag-b1', { phone: '01700000721' });
    const c = await f.place('ag-b2', { phone: '01700000721' });
    expect(await bundleOnOrder(f.ordersDeps(), ref(c.orderId))).toMatchObject({ action: 'propose', groupId: null });
    expect(await row(c.orderId)).toMatchObject({ orderGroupId: null, flags: expect.arrayContaining([BUNDLE_FLAG]) });
    f.overrides.delete('risk.bundling');
  });

  it('the digest: the day\'s counts, held by reason, another order running and duplicates, and what waits', async () => {
    gate(true);
    holdHigh();
    const waiting = await f.place('ag-w', { phone: '01700000731' });
    await assessRisk(f.ordersDeps(), ref(waiting.orderId));
    const g = await approvalDigest(f.ordersDeps(), f.reader, { from: new Date('2000-01-01T00:00:00Z'), to: new Date(f.clock.now.getTime() + 86_400_000) });
    const all = await db().order.count();
    expect(g.placed).toBe(all);
    expect(g.movedOn + g.toConfirm + g.awaitingAdvance + g.held.reduce((a, h) => a + h.count, 0) + g.cancelled.reduce((a, h) => a + h.count, 0)).toBe(all);
    expect(g.held.find((h) => h.key === 'risk-check')?.count).toBe(2);
    expect(g.running).toBeGreaterThanOrEqual(1);
    expect(g.duplicates).toBeGreaterThanOrEqual(1);
    expect(g.gate).toBe(true);
    expect(g.holds.total).toBe(1);
    expect(g.holds.rows[0]).toMatchObject({ orderId: waiting.orderId, what: 'levelHold', reasonKey: 'risk-check' });
    expect(g.reviews.total).toBeGreaterThanOrEqual(1);
    expect(g.bundles.rows.length).toBe(g.bundles.total);
    expect(g.blockProposals).toBe(0);
    // an empty day
    const none = await approvalDigest(f.ordersDeps(), f.staff, { from: new Date('2000-01-01T00:00:00Z'), to: new Date('2000-01-02T00:00:00Z') });
    expect(none).toMatchObject({ placed: 0, running: 0, duplicates: 0, held: [] });
  });
});
