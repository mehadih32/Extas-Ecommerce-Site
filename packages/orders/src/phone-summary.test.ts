// PR 157 — one number's history in counts, without a database: delivered, refused (our-fault refusals apart, SIM-F-044),
// cancelled (only the codes asked for, never NOT_A_RISK_SIGNAL), open, with the courier, returns after delivery, calls not
// answered, and a window. Every value is made up.
import { describe, expect, it } from 'vitest';
import { summarizeHistory, type PastOrder } from './pure';

const T = new Date('2026-10-24T06:00:00Z');
const D = 86_400_000;
let seq = 0;
function past(status: PastOrder['status'], more: Partial<PastOrder> = {}): PastOrder {
  seq++;
  return { id: `o${seq}`, number: `EX-${1000 + seq}`, placedAt: new Date(T.getTime() - 30 * D), status, totalMinor: 150_000, refusalKey: null, cancelCode: null, areaId: null, callOutcomes: [], returns: [], ...more };
}
const OURS = new Set(['late', 'wrong-item', 'damaged']);

describe('PR 157 · a number in counts', () => {
  it('no earlier order: all zero, no dates', () => {
    expect(summarizeHistory([], { ourFault: OURS })).toEqual({ orders: 0, delivered: 0, refused: 0, ourFault: 0, cancelled: 0, cancelsCounted: 0, returns: 0, open: 0, inTransit: 0, noAnswer: 0, firstAt: null, lastAt: null });
  });

  it('SIM-F-044: a refusal the shop caused is counted apart, never as refused', () => {
    const h = summarizeHistory([past('RETURNED', { refusalKey: 'changed-mind' }), past('RETURNED', { refusalKey: 'late' }), past('RETURNED'), past('DELIVERED')], { ourFault: OURS });
    expect(h).toMatchObject({ orders: 4, refused: 2, ourFault: 1, delivered: 1 });
  });

  it('cancels count only with a code asked for, and never "changed after booking" or "did not order"', () => {
    const p = [past('CANCELLED', { cancelCode: 'CUSTOMER_BEFORE_CONFIRM' }), past('CANCELLED', { cancelCode: 'NOT_ORDERED' }), past('CANCELLED', { cancelCode: 'DUPLICATE_ORDER' })];
    expect(summarizeHistory(p, { ourFault: OURS })).toMatchObject({ cancelled: 3, cancelsCounted: 0 });
    expect(summarizeHistory(p, { ourFault: OURS, cancelCodes: new Set(['CUSTOMER_BEFORE_CONFIRM', 'NOT_ORDERED']) })).toMatchObject({ cancelled: 3, cancelsCounted: 1 });
  });

  it('open, with the courier, returns after delivery (not our fault), calls not answered', () => {
    const h = summarizeHistory(
      [past('IN_TRANSIT', { callOutcomes: ['NO_ANSWER', 'ANSWERED'] }), past('CONFIRMED', { callOutcomes: ['NO_ANSWER'] }), past('DELIVERED', { returns: [{ kind: 'RETURNED', reasonCode: 'size-fit' }, { kind: 'DEFECT_RETURN', reasonCode: 'damaged' }] })],
      { ourFault: OURS, noAnswerOutcomes: new Set(['NO_ANSWER']) },
    );
    expect(h).toMatchObject({ orders: 3, open: 2, inTransit: 1, delivered: 1, returns: 1, noAnswer: 2 });
    // without the owner's "no answer" outcomes, no call counts
    expect(summarizeHistory([past('PLACED', { callOutcomes: ['NO_ANSWER'] })], { ourFault: OURS }).noAnswer).toBe(0);
  });

  it('a window: only orders placed since then; the first and the last dates', () => {
    const old = past('RETURNED', { placedAt: new Date(T.getTime() - 90 * D) });
    const recent = past('DELIVERED', { placedAt: new Date(T.getTime() - 5 * D) });
    expect(summarizeHistory([old, recent], { ourFault: OURS, since: new Date(T.getTime() - 60 * D) })).toMatchObject({ orders: 1, refused: 0, delivered: 1 });
    expect(summarizeHistory([old, recent], { ourFault: OURS })).toMatchObject({ orders: 2, firstAt: old.placedAt, lastAt: recent.placedAt });
  });
});
