// PR 533 — the customer history summary at approval, without a database: each earlier order's outcome (a delivery still
// being checked is never counted as delivered, a charge-paid return apart from a plain refusal, the shop's fault shown
// and never counted), the reasons most first, the exchanges and returns after delivery, the list sizes. Made-up values.
import { describe, expect, it } from 'vitest';
import { approvalOutcome, approvalSummary, type ApprovalFacts } from './approval-summary';
import type { PastOrder } from './phone-summary';

let n = 0;
const at = (day: number) => new Date(Date.UTC(2026, 9, day));
function past(status: PastOrder['status'], over: Partial<PastOrder> = {}): PastOrder {
  n++;
  return { id: `o${n}`, number: `EX-${n}`, placedAt: at(n), status, totalMinor: 0, refusalKey: null, cancelCode: null, areaId: null, callOutcomes: [], returns: [], ...over };
}
const none: ApprovalFacts = { exchanged: new Set(), checking: new Set() };
const opts = { ourFault: new Set(['late']), noAnswerOutcomes: new Set(['NO_ANSWER']), recent: 5, reasonsShown: 5 };

describe('PR 533 · approval summary', () => {
  it('names what became of each order: a delivery being checked, a charge-paid return, the shop\'s fault, a re-ship', () => {
    const d = past('DELIVERED');
    expect(approvalOutcome(d, none, opts.ourFault)).toBe('delivered');
    expect(approvalOutcome(d, { ...none, checking: new Set([d.id]) }, opts.ourFault)).toBe('checking');
    expect(approvalOutcome(past('PARTIALLY_DELIVERED'), none, opts.ourFault)).toBe('delivered');
    expect(approvalOutcome(past('RETURNED', { refusalKey: 'changed-mind' }), none, opts.ourFault)).toBe('refused');
    expect(approvalOutcome(past('RETURNED', { returns: [{ kind: 'CHARGE_PAID_RETURN', reasonCode: 'size' }] }), none, opts.ourFault)).toBe('chargePaid');
    expect(approvalOutcome(past('RETURNED', { refusalKey: 'late', returns: [{ kind: 'CHARGE_PAID_RETURN', reasonCode: 'late' }] }), none, opts.ourFault)).toBe('ourFault');
    expect(approvalOutcome(past('RETURNED', { reshipped: true }), none, opts.ourFault)).toBe('ourFault');
    expect(approvalOutcome(past('CANCELLED'), none, opts.ourFault)).toBe('cancelled');
    expect(approvalOutcome(past('IN_TRANSIT'), none, opts.ourFault)).toBe('open');
  });

  it('counts every outcome, the reasons most first, exchanges, returns after delivery and calls not answered', () => {
    const rows = [
      past('DELIVERED', { returns: [{ kind: 'RETURNED', reasonCode: 'size' }] }),
      past('DELIVERED', { returns: [{ kind: 'DEFECT_RETURN', reasonCode: 'late' }] }), // the shop's reason: not his return
      past('DELIVERED'),
      past('RETURNED', { refusalKey: 'changed-mind' }),
      past('RETURNED', { refusalKey: 'changed-mind', returns: [{ kind: 'CHARGE_PAID_RETURN', reasonCode: 'changed-mind' }] }),
      past('RETURNED', { refusalKey: 'price' }),
      past('RETURNED'),
      past('RETURNED', { refusalKey: 'late' }),
      past('CANCELLED', { callOutcomes: ['NO_ANSWER', 'BUSY', 'NO_ANSWER'] }),
      past('CONFIRMED'),
    ];
    const s = approvalSummary(rows, { exchanged: new Set([rows[0]!.id]), checking: new Set([rows[2]!.id]) }, opts);
    expect(s.counts).toEqual({ orders: 10, delivered: 2, checking: 1, refused: 3, chargePaid: 1, ourFault: 1, returned: 1, exchanges: 1, cancelled: 1, open: 1, noAnswer: 2 });
    expect(s.reasons).toEqual([
      { key: 'changed-mind', count: 2 },
      { key: 'price', count: 1 },
    ]);
    expect(s.noReason).toBe(1);
    expect(s.firstAt).toEqual(rows[0]!.placedAt);
    expect(s.recent).toHaveLength(5);
    expect(s.recent[0]).toMatchObject({ id: rows[0]!.id, outcome: 'delivered', exchange: true, returned: true, reasonKey: null });
    expect(s.recent[4]).toMatchObject({ outcome: 'chargePaid', reasonKey: 'changed-mind' });
  });

  it('keeps to the owner\'s list sizes; a first order has nothing to show', () => {
    const rows = [past('RETURNED', { refusalKey: 'a' }), past('RETURNED', { refusalKey: 'b' }), past('RETURNED', { refusalKey: 'b' })];
    const s = approvalSummary(rows, none, { ...opts, recent: 1, reasonsShown: 1 });
    expect(s.reasons).toEqual([{ key: 'b', count: 2 }]);
    expect(s.recent).toHaveLength(1);
    expect(approvalSummary([], none, opts)).toEqual({
      counts: { orders: 0, delivered: 0, checking: 0, refused: 0, chargePaid: 0, ourFault: 0, returned: 0, exchanges: 0, cancelled: 0, open: 0, noAnswer: 0 },
      reasons: [],
      noReason: 0,
      recent: [],
      firstAt: null,
    });
  });
});
