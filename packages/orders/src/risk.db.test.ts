// PR 156 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the risk score is off until the owner switches
// it on; then each order is scored ONCE when it lands — the score, its band and every signal with its weight stored on
// the order, in an append-only assessment and on its timeline (with an audit row), the status untouched — and never
// worked out again silently. Its facts: the number's history in any stored form (PR 157), a refusal the shop caused never
// counting (SIM-F-044), and the address against the gazetteer (PR 158). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskSettings } from '@extas/settings';
import { assessRisk, editOrder, reassessOrder, type StoredRisk } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 156 · the risk score (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const ref = (orderId: string) => ({ storeId: f.S, orderId });
  const on = () => f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true });
  /** The test address (Dhanmondi) names a place the sample gazetteer has twice: the band is sure, the place is not. */
  const UNSURE = riskSettings['risk.signals'].default.addressUnsure.weight;
  const NEW = riskSettings['risk.signals'].default.newPhone.weight;
  const later = (days: number) => (f.clock.now = new Date(f.clock.now.getTime() + days * 86_400_000));

  beforeAll(async () => {
    f = await setUpOrders('risk');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  /** Test data: an earlier order's outcome, as the later stages would leave it (the status and the courier's reason). */
  async function finish(orderId: string, status: 'DELIVERED' | 'RETURNED' | 'CANCELLED', reasonCode?: string) {
    await db().order.update({ where: { id: orderId }, data: { status, ...(status === 'CANCELLED' ? { cancelReasonCode: reasonCode ?? null } : {}) } });
    if (status === 'RETURNED') await db().orderEvent.create({ data: { storeId: f.S, orderId, type: 'order.returned', fromStatus: 'IN_TRANSIT', toStatus: 'RETURNED', reasonCode: reasonCode ?? null, actorType: 'COURIER', source: 'courier' } });
  }

  it('off by default (CN-018): a new order is not scored and nothing is written', async () => {
    const o = await f.place('risk-off', { phone: '01700000201' });
    expect(await assessRisk(f.ordersDeps(), ref(o.orderId))).toBeNull();
    expect(await db().riskAssessment.count({ where: { orderId: o.orderId } })).toBe(0);
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { riskScore: true } })).toEqual({ riskScore: null });
    await expect(reassessOrder(f.ordersDeps(), f.staff, o.orderId)).rejects.toMatchObject({ code: 'RISK_OFF' });
  });

  it('on: scored once when it lands — stored on the order, in the assessment and on the timeline; the status stays', async () => {
    on();
    const o = await f.place('risk-first', { phone: '01700000202' });
    const r = await assessRisk(f.ordersDeps(), ref(o.orderId));
    expect(r).not.toBeNull();
    expect(r!.fired.map((x) => x.key)).toEqual(['newPhone', 'addressUnsure']);
    expect(r!.score).toBe(NEW + UNSURE);
    expect(r!.band.key).toBe('low');
    const row = await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { riskScore: true, riskBand: true, status: true } });
    expect(row).toEqual({ riskScore: NEW + UNSURE, riskBand: 'low', status: 'PLACED' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.riskAssess' } });
    expect(ev).toMatchObject({ reasonCode: 'low', actorType: 'SYSTEM', fromStatus: 'PLACED', toStatus: null });
    expect(ev.data).toMatchObject({ after: 'placed', score: NEW + UNSURE, fired: [{ key: 'newPhone', weight: NEW }, { key: 'addressUnsure', weight: UNSURE }] });
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: 'order.riskAssess' } })).toBe(1);
    // a second call (a retry of the shop's request) finds the first and writes nothing more
    expect(await assessRisk(f.ordersDeps(), ref(o.orderId))).toBeNull();
    expect(await db().riskAssessment.count({ where: { orderId: o.orderId } })).toBe(1);
    // the support explanation (PR 566) reads the same assessment
    const a = await db().riskAssessment.findFirstOrThrow({ where: { orderId: o.orderId } });
    expect(a).toMatchObject({ score: NEW + UNSURE, bandKey: 'low', phone: '+8801700000202' });
  });

  it('the history of the number (PR 157) in any stored form; refusals and cancels count, SIM-F-044 our-fault refusals never do', async () => {
    on();
    const phone = '01700000203';
    const a = await f.place('risk-h1', { phone });
    const b = await f.place('risk-h2', { phone });
    const c = await f.place('risk-h3', { phone });
    const d = await f.place('risk-h4', { phone });
    await finish(a.orderId, 'RETURNED', 'changed-mind');
    await finish(b.orderId, 'RETURNED', 'late'); // the shop's fault: shown, never counted
    await finish(c.orderId, 'CANCELLED', 'CUSTOMER_BEFORE_CONFIRM');
    await finish(d.orderId, 'CANCELLED', 'NOT_ORDERED'); // never held against the number
    // an order the team typed in by hand, stored in the local form
    await db().order.update({ where: { id: d.orderId }, data: { phone } });
    const n = await f.place('risk-h5', { phone: '+880 1700-000203' });
    const r = await assessRisk(f.ordersDeps(), ref(n.orderId));
    const keys = r!.fired.map((x) => x.key);
    expect(keys).toContain('refusals');
    expect(keys).not.toContain('newPhone');
    expect(keys).not.toContain('cancels'); // one counted cancel; the owner's default asks for two
    expect(r!.fired.find((x) => x.key === 'refusals')!.values).toMatchObject({ count: 1, ourFault: 1 });
    const stored = (await db().riskAssessment.findFirstOrThrow({ where: { orderId: n.orderId } })).signals as unknown as StoredRisk;
    expect(stored.history).toMatchObject({ orders: 4, refused: 1, ourFault: 1, cancelled: 2, cancelsCounted: 1 });
  });

  it('the team changes the phone: scored again after the edit, a new dated assessment; switched off, not', async () => {
    on();
    const o = await f.place('risk-e1', { phone: '01700000209' });
    await assessRisk(f.ordersDeps(), ref(o.orderId));
    const v = (await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { version: true } })).version;
    await editOrder(f.ordersDeps(), f.staff, o.orderId, { reasonKey: 'wrong-phone', phone: '01700000210' }, { version: v });
    const rows = await db().riskAssessment.findMany({ where: { orderId: o.orderId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => (r.signals as unknown as StoredRisk).after)).toEqual(['placed', 'edit']);
    expect(rows[1]!.phone).toBe('+8801700000210');
    f.overrides.set('risk.score', { ...riskSettings['risk.score'].default, enabled: true, afterEdit: false });
    await editOrder(f.ordersDeps(), f.staff, o.orderId, { reasonKey: 'wrong-phone', phone: '01700000211' }, { version: (await db().order.findUniqueOrThrow({ where: { id: o.orderId }, select: { version: true } })).version });
    expect(await db().riskAssessment.count({ where: { orderId: o.orderId } })).toBe(2);
  });

  it('SIM-F-044: a number whose only refusal was our fault is not flagged on its next order', async () => {
    on();
    const phone = '01700000204';
    const a = await f.place('risk-f1', { phone });
    await finish(a.orderId, 'RETURNED', 'wrong-item');
    later(3);
    const n = await f.place('risk-f2', { phone });
    const r = await assessRisk(f.ordersDeps(), ref(n.orderId));
    expect(r!.fired.map((x) => x.key)).toEqual(['addressUnsure']);
    expect(r!.score).toBe(UNSURE);
  });

  it('the address (PR 158): one no place settles, and a district other than the one the number is known by', async () => {
    on();
    const lost = await f.place('risk-a1', { phone: '01700000205', address: 'Behind the big tree near the pond' });
    expect((await assessRisk(f.ordersDeps(), ref(lost.orderId)))!.fired.map((x) => x.key)).toEqual(expect.arrayContaining(['addressUnresolved']));
    const phone = '01700000206';
    const home = await f.place('risk-a2', { phone });
    await finish(home.orderId, 'DELIVERED');
    const away = await f.place('risk-a3', { phone, address: 'House 9, Sherpur Road, Bogura Sadar, Bogura' });
    const r = await assessRisk(f.ordersDeps(), ref(away.orderId));
    expect(r!.fired.find((x) => x.key === 'areaMismatch')?.values).toMatchObject({ known: 'Dhaka', now: 'Bogura', from: 'order' });
  });
});
