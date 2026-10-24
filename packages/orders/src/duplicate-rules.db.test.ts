// S06 · PR 520 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — the duplicate & re-order rules engine
// inside the duplicate check (PR 145): off, the check is exactly as before; on, each scenario fires on its own (A the
// same items again, B different items, C a parcel with the courier, D an alike address under a new phone, E another
// size, H a blocked number or address, I bulk-looking), each proposal opens the same review or only writes a note, the
// review keeps the rules that fired, and the same customer is found through his identity (PR 519). A rule never
// cancels, holds, blocks or changes anything by itself: a person decides. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { riskRulesSettings, type DuplicateRules } from '@extas/settings';
import { confirmOrder, decideReview, getOrder, linkIdentity, reviewQueue, screenOrder } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

type RuleOver = Partial<{ [K in keyof DuplicateRules['rules']]: Partial<DuplicateRules['rules'][K]> }>;
const defaults = riskRulesSettings['risk.duplicateRules'].default;

describe.skipIf(!HAS_TEST_DB)('PR 520 · the duplicate & re-order rules (PostgreSQL)', () => {
  let f: OrdersFixture;
  let n = 0;
  const d = () => f.ordersDeps();
  const db = () => f.t.prisma;
  const phone = () => `017100${String(++n).padStart(5, '0')}`;
  const screen = (orderId: string) => screenOrder(d(), { storeId: f.S, orderId });
  /** The master on, every rule as the owner's default, then the test's own changes. */
  const rulesOn = (over: RuleOver = {}) => {
    const rules = Object.fromEntries(Object.entries(defaults.rules).map(([k, r]) => [k, { ...r, ...(over as Record<string, object>)[k] }])) as DuplicateRules['rules'];
    f.overrides.set('risk.duplicateRules', { enabled: true, rules });
  };
  const alertOf = (id: string) => db().fraudAlert.findUniqueOrThrow({ where: { id } });
  const checkEvent = (orderId: string) => db().orderEvent.findFirstOrThrow({ where: { orderId, type: 'order.duplicateCheck' }, orderBy: { createdAt: 'desc' } });

  beforeAll(async () => {
    f = await setUpOrders('duplicate_rules');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default: the duplicate check is exactly the look-back of PR 145', async () => {
    expect(defaults.enabled).toBe(false);
    const p = phone();
    const a = await f.place('off-a', { phone: p });
    const b = await f.place('off-b', { phone: p });
    const r = await screen(b.orderId);
    expect(r).toMatchObject({ severity: 'high', rules: [], proposed: null, matches: [{ orderId: a.orderId }] });
    const alert = await alertOf(r.alertId!);
    expect(alert).toMatchObject({ proposedAction: 'WARN', confidence: null });
    expect(alert.summary).not.toHaveProperty('rules');
  });

  it('A: the same items again proposes cancel — a review holds the confirm; the order stays placed until a person decides', async () => {
    rulesOn();
    const p = phone();
    const a = await f.place('a-a', { phone: p });
    const b = await f.place('a-b', { phone: p });
    const r = await screen(b.orderId);
    expect(r.rules.map((h) => h.rule)).toEqual(['A']);
    expect(r).toMatchObject({ proposed: 'cancel', severity: 'high', alertId: expect.any(String), held: false });
    expect(await alertOf(r.alertId!)).toMatchObject({ proposedAction: 'CANCEL', confidence: 100, severity: 'high', matchedOrderIds: [a.orderId] });
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ status: 'PLACED', cancelReasonCode: null });
    expect(await code(confirmOrder(d(), f.staff, b.orderId))).toBe('IN_REVIEW');
    // the review keeps why: the queue and the order page both carry the rule, its confidence and the matched order
    const row = (await reviewQueue(d(), f.staff)).rows.find((x) => x.alertId === r.alertId)!;
    expect(row.rules).toEqual([expect.objectContaining({ rule: 'A', action: 'cancel', suggest: 'cancel', confidence: 100, matches: [{ orderId: a.orderId, number: a.number, confidence: 100 }] })]);
    const detail = await getOrder(d(), f.staff, b.orderId);
    expect(detail.reviews[0]).toMatchObject({ proposedAction: 'CANCEL', confidence: 100, rules: [expect.objectContaining({ rule: 'A' })] });
    expect(await db().auditLog.findFirst({ where: { entityId: r.alertId!, action: 'order.duplicate.review' } })).toMatchObject({ after: { proposed: 'cancel', rules: ['A'] } });
    // the decision stays a person's (layer 4 unchanged)
    expect(await decideReview(d(), f.staff, r.alertId!, { decision: 'decline' })).toMatchObject({ alertStatus: 'DECLINED', order: { status: 'CANCELLED' } });
  });

  it('B: different items in the window only warns — a note on the timeline, no review', async () => {
    rulesOn();
    const p = phone();
    await f.place('b-a', { phone: p });
    const b = await f.place('b-b', { phone: p, lines: [{ variantId: f.v.teeM }] });
    const r = await screen(b.orderId);
    expect(r).toMatchObject({ proposed: 'warn', alertId: null });
    expect(r.rules.map((h) => h.rule)).toEqual(['B']);
    expect(await db().fraudAlert.count({ where: { orderId: b.orderId } })).toBe(0);
    expect((await checkEvent(b.orderId)).data).toMatchObject({ review: false, proposed: 'warn', rules: [expect.objectContaining({ rule: 'B', suggest: 'merge' })] });
    expect(await confirmOrder(d(), f.staff, b.orderId)).toMatchObject({ status: 'CONFIRMED' });
  });

  it('C: a parcel of his with the courier proposes hold, and suggests adding on', async () => {
    rulesOn();
    const p = phone();
    const a = await f.place('c-a', { phone: p });
    await db().order.update({ where: { id: a.orderId }, data: { status: 'IN_TRANSIT' } });
    const b = await f.place('c-b', { phone: p, lines: [{ variantId: f.v.teeM }] });
    const r = await screen(b.orderId);
    expect(r.rules).toEqual([expect.objectContaining({ rule: 'C', action: 'hold', suggest: 'addOn' })]);
    expect(await alertOf(r.alertId!)).toMatchObject({ proposedAction: 'HOLD', matchedOrderIds: [a.orderId] });
    expect(await db().order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({ status: 'PLACED' });
  });

  it('D: an alike address under a new phone (any name) — off by default, on it warns', async () => {
    const address = 'Flat 3B, House 21, Lake Road, Uttara Sector 9, Dhaka 1230';
    const a = await f.place('d-a', { phone: phone(), address });
    rulesOn();
    const b = await f.place('d-b', { phone: phone(), address: 'Flat 3B House 21 Lake Road Uttara Sector-9 Dhaka' });
    expect((await screen(b.orderId)).rules).toEqual([]);
    rulesOn({ D: { enabled: true } });
    const c = await f.place('d-c', { phone: phone(), address: 'Flat 3-B, House 21, Lake Rd, Uttara Sector 9, Dhaka 1230' });
    const r = await screen(c.orderId);
    expect(r.rules.map((h) => h.rule)).toEqual(['D']);
    expect(r.rules[0]!.matches.map((m) => m.orderId)).toEqual(expect.arrayContaining([a.orderId, b.orderId]));
    expect(r).toMatchObject({ proposed: 'warn', alertId: null });
  });

  it('E: the same style in another size in his other open order', async () => {
    rulesOn({ E: { enabled: true } });
    const p = phone();
    await f.place('e-a', { phone: p });
    const b = await f.place('e-b', { phone: p, lines: [{ variantId: f.v.skyL }] });
    const r = await screen(b.orderId);
    expect(r.rules.map((h) => h.rule).sort()).toEqual(['A', 'E']);
    expect(r.rules.find((h) => h.rule === 'E')).toMatchObject({ suggest: 'exchange', confidence: 80 });
  });

  it('H: a blocked number or an alike blocked address proposes hold — the block register is only read', async () => {
    rulesOn({ H: { enabled: true } });
    const p = phone();
    const entry = await db().blockEntry.create({ data: { storeId: f.S, phone: p, status: 'BLOCKED', reason: 'test', blockedAt: f.clock.now } });
    const a = await f.place('h-a', { phone: p });
    const r = await screen(a.orderId);
    expect(r.rules).toEqual([expect.objectContaining({ rule: 'H', action: 'hold', suggest: 'blocked', confidence: 100, blocked: [entry.id] })]);
    expect(await alertOf(r.alertId!)).toMatchObject({ proposedAction: 'HOLD', matchedOrderIds: [] });
    const address = 'House 77, Road 3, Block C, Banasree, Dhaka 1219';
    const near = await db().blockEntry.create({ data: { storeId: f.S, addressGiven: address, status: 'BLOCKED', reason: 'test', blockedAt: f.clock.now } });
    await db().blockEntry.create({ data: { storeId: f.S, addressGiven: address, status: 'PROPOSED', reason: 'test' } });
    const b = await f.place('h-b', { phone: phone(), address: 'House 77 Road 3 Block-C Banasree Dhaka-1219' });
    expect((await screen(b.orderId)).rules).toEqual([expect.objectContaining({ rule: 'H', blocked: [near.id], values: expect.objectContaining({ how: 'address' }) })]);
    // nothing about the entries or the orders changed
    expect(await db().blockEntry.findUniqueOrThrow({ where: { id: entry.id } })).toMatchObject({ status: 'BLOCKED', rejectionCount: 0 });
    expect(await db().order.findUniqueOrThrow({ where: { id: a.orderId } })).toMatchObject({ status: 'PLACED' });
  });

  it('I: a bulk-looking order (the owner\'s pieces) warns', async () => {
    rulesOn({ I: { enabled: true } });
    const big = await f.place('i-a', { phone: phone(), lines: [{ variantId: f.v.teeM, quantity: 10 }] });
    expect((await screen(big.orderId)).rules).toEqual([expect.objectContaining({ rule: 'I', suggest: 'bulk', values: expect.objectContaining({ pieces: 10, atLeast: 10 }) })]);
    const small = await f.place('i-b', { phone: phone(), lines: [{ variantId: f.v.teeM, quantity: 9 }] });
    expect((await screen(small.orderId)).rules).toEqual([]);
  });

  it('with the identity graph on, the same person under a new number is the same customer (a little less sure)', async () => {
    f.overrides.set('risk.identity', { ...riskRulesSettings['risk.identity'].default, enabled: true });
    rulesOn();
    const address = 'House 5, Road 18, Sector 4, Kazipara, Mirpur, Dhaka 1216';
    const a = await f.place('id-a', { phone: phone(), address });
    const b = await f.place('id-b', { phone: phone(), address });
    for (const o of [a, b]) await db().order.update({ where: { id: o.orderId }, data: { customerName: 'Shafiq Identity' } });
    await linkIdentity(d(), { storeId: f.S, orderId: a.orderId });
    await linkIdentity(d(), { storeId: f.S, orderId: b.orderId });
    const r = await screen(b.orderId);
    expect(r.rules.find((h) => h.rule === 'A')).toMatchObject({ confidence: 80, matches: [expect.objectContaining({ orderId: a.orderId, confidence: 80 })] });
    expect(r.proposed).toBe('cancel');
    f.overrides.set('risk.identity', riskRulesSettings['risk.identity'].default);
  });
});
