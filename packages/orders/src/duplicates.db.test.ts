// S05 · PR 145 on a real PostgreSQL — the duplicate-order defence (Blueprint B1.12): the same-customer check when an
// order lands (high / medium / low by how alike the lines are), the review queue that holds the confirm, and every
// decision (not a duplicate, cancel as duplicate, hold, ask the customer, one parcel), each with its decision-log row
// (append-only), audit row and timeline row. Orders are placed through the real checkout; skipped without
// TEST_DATABASE_ADMIN_URL. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, decideReview, getOrder, listOrders, mergeOrders, reviewQueue, screenOrder } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('the duplicate-order defence on PostgreSQL (PR 145)', () => {
  let f: OrdersFixture;
  let n = 0;
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  /** A new customer (his own phone) placing a first order and then a second with the given line. */
  const pair = async (name: string, second: string, first?: string) => {
    const phone = `017000${String(++n).padStart(5, '0')}`;
    const a = await f.place(`${name}-a`, { phone, lines: [{ variantId: first ?? f.v.skyM }] });
    const b = await f.place(`${name}-b`, { phone, lines: [{ variantId: second }] });
    return { a, b, phone };
  };
  const screen = (orderId: string) => screenOrder(d(), { storeId: f.S, orderId });

  beforeAll(async () => {
    f = await setUpOrders('duplicates');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the same SKU again: a high match waits in the review queue and holds the confirm until a person decides', async () => {
    const { a, b } = await pair('high', f.v.skyM);
    const r = await screen(b.orderId);
    expect(r).toMatchObject({ severity: 'high', held: false, matches: [{ orderId: a.orderId, severity: 'high' }] });
    expect(await screen(b.orderId)).toMatchObject({ alertId: null }); // a second run does nothing more
    expect(await db().fraudAlert.count({ where: { orderId: b.orderId } })).toBe(1);
    expect(await code(confirmOrder(d(), f.staff, b.orderId))).toBe('IN_REVIEW');
    const q = await reviewQueue(d(), f.staff);
    const row = q.rows.find((x) => x.alertId === r.alertId)!;
    expect(row).toMatchObject({ status: 'OPEN', severity: 'high', order: { id: b.orderId }, matches: [{ orderId: a.orderId, number: a.number, severity: 'high' }] });
    expect((await listOrders(d(), f.staff, { view: 'inReview' })).rows.map((x) => x.id)).toContain(b.orderId);
    expect(await code(reviewQueue(d(), f.reader))).toBe('FORBIDDEN');
    expect(await code(decideReview(d(), f.reader, r.alertId!, { decision: 'approve' }))).toBe('FORBIDDEN');
    // not a duplicate (he wants two): the review closes and the confirm is open again
    expect(await decideReview(d(), f.staff, r.alertId!, { decision: 'approve', note: 'gift for his brother' })).toMatchObject({ alertStatus: 'APPROVED' });
    expect(await code(decideReview(d(), f.staff, r.alertId!, { decision: 'approve' }))).toBe('ILLEGAL_TRANSITION');
    expect(await confirmOrder(d(), f.staff, b.orderId)).toMatchObject({ status: 'CONFIRMED' });
    expect(await db().fraudDecision.findMany({ where: { alertId: r.alertId! } })).toMatchObject([{ decision: 'duplicate.approve', reason: 'gift for his brother', actorType: 'STAFF' }]);
    expect(await db().auditLog.count({ where: { entityId: r.alertId!, action: 'order.duplicate.approve' } })).toBe(1);
    // the decision log is append-only at the database
    const [dec] = await db().fraudDecision.findMany({ where: { alertId: r.alertId! } });
    expect(await code(db().fraudDecision.update({ where: { id: dec!.id }, data: { reason: 'changed' } }))).not.toBe('ok');
  });

  it('the same product in another colour is medium (reviewed by default); declined, it is cancelled as a duplicate', async () => {
    const { b } = await pair('medium', f.v.whiteM);
    const r = await screen(b.orderId);
    expect(r).toMatchObject({ severity: 'medium', alertId: expect.any(String) });
    const out = await decideReview(d(), f.staff, r.alertId!, { decision: 'decline' });
    expect(out).toMatchObject({ alertStatus: 'DECLINED', order: { status: 'CANCELLED' } });
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ cancelReasonCode: 'DUPLICATE_ORDER' });
    expect(await db().fraudAlert.findUniqueOrThrow({ where: { id: r.alertId! } })).toMatchObject({ status: 'DECLINED', decisionReason: 'decline', decidedById: f.staffId });
    expect(await db().stockReservation.count({ where: { orderId: b.orderId, releasedAt: null } })).toBe(0);
  });

  it('the same category only is low: a note on the timeline, no review; another product entirely: nothing', async () => {
    const { b } = await pair('low', f.v.linenM);
    expect(await screen(b.orderId)).toMatchObject({ severity: 'low', alertId: null });
    const ev = await db().orderEvent.findFirst({ where: { orderId: b.orderId, type: 'order.duplicateCheck' } });
    expect(ev).toMatchObject({ reasonCode: 'low', data: { review: false } });
    expect(await confirmOrder(d(), f.staff, b.orderId)).toMatchObject({ status: 'CONFIRMED' });
    const other = await pair('none', f.v.teeM);
    expect(await screen(other.b.orderId)).toMatchObject({ severity: null, matches: [] });
  });

  it("the owner's settings: switched off, a wider review, the auto-hold of a high match", async () => {
    f.overrides.set('orders.duplicates', { enabled: false, lookbackDays: 5, reviewFrom: 'medium', autoHold: false });
    const off = await pair('off', f.v.skyM);
    expect(await screen(off.b.orderId)).toMatchObject({ severity: null, alertId: null });
    f.overrides.set('orders.duplicates', { enabled: true, lookbackDays: 5, reviewFrom: 'high', autoHold: true });
    const held = await pair('auto', f.v.skyL);
    expect(await screen(held.b.orderId)).toMatchObject({ severity: 'high', held: true });
    expect(await db().order.findUniqueOrThrow({ where: { id: held.b.orderId } })).toMatchObject({ status: 'ON_HOLD', holdReasonCode: 'possible-duplicate' });
    const medium = await pair('narrow', f.v.whiteM);
    expect(await screen(medium.b.orderId)).toMatchObject({ severity: 'medium', alertId: null });
    f.overrides.delete('orders.duplicates');
  });

  it('the look-back: an order older than the setting is not a match', async () => {
    const phone = '01700099001';
    await f.place('old-a', { phone });
    f.clock.now = new Date(f.clock.now.getTime() + 6 * 86_400_000);
    const b = await f.place('old-b', { phone });
    expect(await screen(b.orderId)).toMatchObject({ severity: null });
  });

  it('hold or ask the customer: the review stays open, the hold carries its reason, a call task is made once', async () => {
    const { b } = await pair('ask', f.v.skyM);
    const r = await screen(b.orderId);
    const asked = await decideReview(d(), f.staff, r.alertId!, { decision: 'ask', note: 'call him' });
    expect(asked.callTaskId).toEqual(expect.any(String));
    expect(await db().callTask.findMany({ where: { orderId: b.orderId } })).toMatchObject([{ reason: 'DUPLICATE_CHECK', status: 'OPEN', notes: 'call him' }]);
    await decideReview(d(), f.staff, r.alertId!, { decision: 'ask' });
    expect(await db().callTask.count({ where: { orderId: b.orderId } })).toBe(1);
    expect(await decideReview(d(), f.staff, r.alertId!, { decision: 'hold' })).toMatchObject({ alertStatus: 'OPEN', order: { status: 'ON_HOLD' } });
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ holdReasonCode: 'possible-duplicate' });
    expect((await db().fraudDecision.findMany({ where: { alertId: r.alertId! }, orderBy: { createdAt: 'asc' } })).map((x) => x.decision)).toEqual(['duplicate.ask', 'duplicate.ask', 'duplicate.hold']);
    expect((await getOrder(d(), f.staff, b.orderId)).reviews).toMatchObject([{ status: 'OPEN' }]);
  });

  it('one parcel: both orders join one group, their money untouched; a booked or finished order cannot join', async () => {
    const { a, b } = await pair('merge', f.v.whiteM);
    const before = await db().order.findMany({ where: { id: { in: [a.orderId, b.orderId] } }, select: { id: true, totalMinor: true, deliveryChargeMinor: true, codAmountMinor: true } });
    const r = await screen(b.orderId);
    const out = await decideReview(d(), f.staff, r.alertId!, { decision: 'merge', note: 'one parcel' });
    expect(out).toMatchObject({ alertStatus: 'APPROVED', groupId: expect.any(String) });
    const after = await db().order.findMany({ where: { id: { in: [a.orderId, b.orderId] } }, select: { id: true, totalMinor: true, deliveryChargeMinor: true, codAmountMinor: true, orderGroupId: true, version: true } });
    expect(after.map((o) => o.orderGroupId)).toEqual([out.groupId, out.groupId]);
    expect(after.map(({ id, totalMinor, deliveryChargeMinor, codAmountMinor }) => ({ id, totalMinor, deliveryChargeMinor, codAmountMinor }))).toEqual(before);
    expect(await db().orderEvent.count({ where: { orderId: { in: [a.orderId, b.orderId] }, type: 'order.merged' } })).toBe(2);
    expect(await db().fraudDecision.findMany({ where: { alertId: r.alertId! } })).toMatchObject([{ decision: 'duplicate.merge' }]);

    const other = await f.place('merge-other', { phone: '01700099002' });
    expect(await code(mergeOrders(d(), f.staff, { orderIds: [a.orderId, other.orderId] }))).toBe('NOT_MERGEABLE');
    const c = await pair('merge-done', f.v.teeM);
    await confirmOrder(d(), f.staff, c.a.orderId);
    await db().shipment.create({ data: { storeId: f.S, orderId: c.a.orderId, courierAccountId: (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id, status: 'PENDING_PICKUP', idempotencyKey: 'test-merge-booked' } });
    expect(await code(mergeOrders(d(), f.staff, { orderIds: [c.a.orderId, c.b.orderId] }))).toBe('NOT_MERGEABLE');
    expect(await code(mergeOrders(d(), f.reader, { orderIds: [c.a.orderId, c.b.orderId] }))).toBe('FORBIDDEN');
  });
});
