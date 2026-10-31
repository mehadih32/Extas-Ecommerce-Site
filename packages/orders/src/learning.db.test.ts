// PR 543 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the decision learning loop. Every decision on
// what the engine stopped or proposed is kept with its note (a review through decideReview, a proposed hold through
// decideHoldProposal), whatever the switch says. Off as shipped, the report says so and reads nothing. On, it counts per
// rule the final decision of each review (a review held and then approved counts once, as let go) and how the orders let
// go ended, suggests "relax" for a rule people let go often enough, counts every decision per person with their notes,
// and an open review gets what people did with ones like it (never itself). Nothing changes by itself. Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { registry } from '@extas/settings';
import { decideHoldProposal, decideReview, learnedHints, learningReport, proposeHold, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 543 · the decision learning loop (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;
  const learn = (over: Record<string, unknown> = {}) => f.overrides.set('risk.learning', { ...registry['risk.learning'].default, enabled: true, minDecisions: 3, suggestPercent: 70, ...over });
  /** An order with an open duplicate review that fired rule `letter`. */
  const reviewed = async (name: string, phone: string, letter: string) => {
    const o = await f.place(name, { phone });
    const a = await db().fraudAlert.create({
      data: { storeId: f.S, orderId: o.orderId, matchedOrderIds: [], severity: 'high', confidence: 80, proposedAction: 'HOLD', summary: { section: 'duplicate', rules: [{ rule: letter, confidence: 80, action: 'hold', suggest: 'merge', matches: [], blocked: [], values: {} }] } },
    });
    return { orderId: o.orderId, alertId: a.id };
  };
  /** The report's clock after the decisions (they carry the database's time). */
  const later = () => {
    f.clock.now = new Date(Math.max(Date.now(), f.clock.now.getTime()) + 60_000);
  };

  beforeAll(async () => {
    f = await setUpOrders('learning');
    f.clock.now = new Date();
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: every decision is still kept with its note; the report reads nothing; a reader is refused', async () => {
    expect(registry['risk.learning'].default).toMatchObject({ enabled: false });
    const o = await f.place('ln-gate', { phone: '01700000901' });
    f.overrides.set('risk.approval', { ...registry['risk.approval'].default, gate: true });
    await proposeHold(f.ordersDeps(), { storeId: f.S, orderId: o.orderId }, systemBy('risk-levels'), 'levelHold', 'risk-check');
    await decideHoldProposal(f.ordersDeps(), f.staff, o.orderId, { decision: 'dismiss', note: 'known customer, called' });
    expect(await db().fraudDecision.findFirstOrThrow({ where: { orderId: o.orderId } })).toMatchObject({ decision: 'holdProposal.dismiss', reason: 'known customer, called', actorType: 'STAFF', actorId: f.staffId });
    later();
    expect(await learningReport(f.ordersDeps(), f.staff)).toMatchObject({ enabled: false, decisions: 0, rules: [], people: [], suggestions: [] });
    expect(await code(learningReport(f.ordersDeps(), f.reader))).toBe('FORBIDDEN');
    expect((await learnedHints(f.ordersDeps(), f.S, [{ alertId: o.orderId, kind: 'duplicate', summary: { rules: [{ rule: 'A' }] } }])).size).toBe(0);
  });

  it('on: per rule (the final decision), how the let-go orders ended, a "relax" suggestion, per person with notes; an open review learns from the others', async () => {
    learn();
    const rs = [await reviewed('ln-a1', '01700000911', 'A'), await reviewed('ln-a2', '01700000912', 'A'), await reviewed('ln-a3', '01700000913', 'A'), await reviewed('ln-a4', '01700000914', 'A')];
    // held first, then approved: once for the rule (let go), twice for the person
    await decideReview(f.ordersDeps(), f.staff, rs[0]!.alertId, { decision: 'hold', note: 'waiting for a call back' });
    await decideReview(f.ordersDeps(), f.staff, rs[0]!.alertId, { decision: 'approve', note: 'called, a second shirt' });
    await decideReview(f.ordersDeps(), f.staff, rs[1]!.alertId, { decision: 'approve', note: 'same family' });
    await decideReview(f.ordersDeps(), f.staff, rs[2]!.alertId, { decision: 'approve' });
    await decideReview(f.ordersDeps(), f.staff, rs[3]!.alertId, { decision: 'decline', note: 'ordered twice by mistake' });
    await db().order.updateMany({ where: { id: { in: [rs[0]!.orderId, rs[1]!.orderId] } }, data: { status: 'DELIVERED' } });
    later();
    const r = await learningReport(f.ordersDeps(), f.staff);
    expect(r).toMatchObject({ enabled: true, minDecisions: 3, suggestPercent: 70, cut: false });
    expect(r.rules.find((t) => t.key === 'dup.A')).toEqual({ key: 'dup.A', decided: 4, letGo: 3, kept: 1, other: 0, letGoDelivered: 2, letGoRefused: 0 });
    expect(r.rules.find((t) => t.key === 'gate.levelHold')).toMatchObject({ decided: 1, letGo: 1 });
    expect(r.suggestions).toEqual([{ key: 'dup.A', kind: 'relax', share: 75, decided: 4 }]);
    const me = r.people.find((p) => p.actorId === f.staffId)!;
    expect(me).toMatchObject({ name: 'Orders Staff', decided: 6, letGo: 4, kept: 2, letGoRefused: 0 });
    expect(me.rules[0]).toEqual({ key: 'dup.A', letGo: 3, kept: 2 });
    expect(me.notes.map((n) => n.note)).toEqual(['ordered twice by mistake', 'same family', 'called, a second shirt']);

    // a refused let-go order: the share of refusals now stops the "relax"
    await db().order.update({ where: { id: rs[2]!.orderId }, data: { status: 'RETURNED' } });
    later();
    const again = await learningReport(f.ordersDeps(), f.staff);
    expect(again.rules.find((t) => t.key === 'dup.A')).toMatchObject({ letGoRefused: 1 });
    expect(again.suggestions).toEqual([]);
    expect(again.people.find((p) => p.actorId === f.staffId)).toMatchObject({ letGoRefused: 1 });

    // an open review with the same rule learns from the four, never from itself
    const open = await reviewed('ln-a5', '01700000915', 'A');
    const hints = await learnedHints(f.ordersDeps(), f.S, [{ alertId: open.alertId, kind: 'duplicate', summary: { rules: [{ rule: 'A' }] } }, { alertId: rs[0]!.alertId, kind: 'duplicate', summary: { rules: [{ rule: 'A' }] } }]);
    expect(hints.get(open.alertId)).toMatchObject({ key: 'dup.A', decided: 3, letGo: 2, minDecisions: 3 });
    // too few decisions on a rule: nothing said
    learn({ minDecisions: 10 });
    expect((await learnedHints(f.ordersDeps(), f.S, [{ alertId: open.alertId, kind: 'duplicate', summary: { rules: [{ rule: 'A' }] } }])).size).toBe(0);
    expect((await learningReport(f.ordersDeps(), f.staff)).suggestions).toEqual([]);
    // nothing changed by itself: the rules' settings are as they were
    expect(await db().storeSettingValue.count({ where: { key: { startsWith: 'risk.duplicateRules' } } })).toBe(0);
  });

  it('the window and the cap: decisions older than the days are not read; more than the most rows is cut', async () => {
    learn({ days: 7, maxRows: 100 });
    f.clock.now = new Date(Date.now() + 30 * 86_400_000);
    expect(await learningReport(f.ordersDeps(), f.staff)).toMatchObject({ decisions: 0, rules: [] });
    f.clock.now = new Date();
    later();
    const many = await reviewed('ln-many', '01700000921', 'B');
    await db().fraudDecision.createMany({ data: Array.from({ length: 101 }, (_, i) => ({ storeId: f.S, alertId: many.alertId, orderId: many.orderId, decision: 'duplicate.hold', reason: `note ${i}`, actorType: 'STAFF' as const, actorId: f.staffId })) });
    later();
    expect(await learningReport(f.ordersDeps(), f.staff)).toMatchObject({ decisions: 100, cut: true });
  });
});
