// S06 · PR 521 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — the alert summary: one review explained
// in one read (why it fired, the matched orders with the rules that matched each, what the riders wrote on this
// customer's parcels, his number's history, the decisions this person may take with the proposed one first), for a
// duplicate's review and a risk section's, read only and only with `orders.risk.read`. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskRulesSettings } from '@extas/settings';
import { alertSummary, decideReview, screenOrder } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 521 · the alert summary (PostgreSQL)', () => {
  let f: OrdersFixture;
  let n = 0;
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  const phone = () => `017200${String(++n).padStart(5, '0')}`;

  beforeAll(async () => {
    f = await setUpOrders('alert_summary');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('a duplicate rule\'s review: why, the matched order and its rule, the rider\'s words, his history, the options', async () => {
    f.overrides.set('risk.duplicateRules', { ...riskRulesSettings['risk.duplicateRules'].default, enabled: true });
    const p = phone();
    const old = await f.place('old', { phone: p });
    await db().order.update({ where: { id: old.orderId }, data: { status: 'RETURNED' } });
    const courier = await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } });
    const ship = await db().shipment.create({ data: { storeId: f.S, orderId: old.orderId, courierAccountId: courier.id, status: 'RETURNED', idempotencyKey: 'test-alert-summary' } });
    await db().shipmentEvent.create({ data: { storeId: f.S, shipmentId: ship.id, status: 'RETURNED', riderNote: 'Customer said he did not order', occurredAt: f.clock.now } });
    await db().returnRecord.create({ data: { storeId: f.S, orderId: old.orderId, kind: 'REFUSED_AT_DOOR', reasonCode: 'did-not-order', riderNote: 'Refused at the door' } });
    const a = await f.place('a', { phone: p });
    const b = await f.place('b', { phone: p });
    const r = await screenOrder(d(), { storeId: f.S, orderId: b.orderId });
    expect(r.proposed).toBe('cancel');

    const s = (await alertSummary(d(), f.staff, r.alertId!))!;
    expect(s).toMatchObject({ kind: 'duplicate', section: 'duplicate', status: 'OPEN', proposedAction: 'CANCEL', proposed: 'decline', confidence: 100, severity: 'high', afterEdit: false, number: b.number });
    expect(s.rules).toEqual([expect.objectContaining({ rule: 'A', action: 'cancel', confidence: 100 })]);
    expect(s.matches).toEqual([expect.objectContaining({ orderId: a.orderId, number: a.number, status: 'PLACED', severity: 'high', rules: ['A'], via: [] })]);
    expect(s.riderNotes.map((x) => [x.number, x.from, x.note])).toEqual(
      expect.arrayContaining([
        [old.number, 'courier', 'Customer said he did not order'],
        [old.number, 'return', 'Refused at the door'],
      ]),
    );
    expect(s.history.phone).toMatchObject({ orders: 2 });
    expect(s.history.identity).toBeNull();
    // every decision is open to this person, the proposed one first
    expect(s.options).toEqual(['decline', 'approve', 'hold', 'ask', 'merge']);

    // a read only, behind the risk permission; once decided, no options
    expect(await code(alertSummary(d(), f.reader, r.alertId!))).toBe('FORBIDDEN');
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ status: 'PLACED' });
    await decideReview(d(), f.staff, r.alertId!, { decision: 'approve' });
    expect(await alertSummary(d(), f.staff, r.alertId!)).toMatchObject({ status: 'APPROVED', options: [], decisionReason: 'approve' });
    f.overrides.set('risk.duplicateRules', riskRulesSettings['risk.duplicateRules'].default);
  });

  it('a risk section\'s review: the signals, no merge; an unknown or malformed id is nothing', async () => {
    const o = await f.place('risk', { phone: phone() });
    const alert = await db().fraudAlert.create({ data: { storeId: f.S, orderId: o.orderId, matchedOrderIds: [], proposedAction: 'HOLD', summary: { kind: 'risk', section: 'high', because: ['refusals'] } } });
    expect(await alertSummary(d(), f.staff, alert.id)).toMatchObject({ kind: 'risk', section: 'high', because: ['refusals'], rules: [], matches: [], proposed: 'hold', options: ['hold', 'approve', 'decline', 'ask'] });
    expect(await alertSummary(d(), f.staff, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await alertSummary(d(), f.staff, 'not-an-id')).toBeNull();
  });
});
