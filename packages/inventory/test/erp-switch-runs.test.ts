// Follow-up 577 (PR 619): a switch run's stored report read into the few facts the ERP link page lists; anything of
// another shape is left out (null), never guessed.
import { describe, expect, it } from 'vitest';
import { switchRunReport } from '../src';

describe('follow-up 577: switchRunReport', () => {
  it('a dry run keeps the plan; a switch `{ plan, steps }`; a new link `{ reason, note, epoch }`', () => {
    const plan = { switchDate: '2026-11-05', mode: 'erp-list', openingBalanceMinor: 135_000, orders: [{}, {}, {}], queuedV5: { count: 2, orderIds: [], action: 'hold' } };
    expect(switchRunReport(plan)).toEqual({ switchDate: '2026-11-05', mode: 'erp-list', openingBalanceMinor: 135_000, orders: 3, queuedV5: 2, steps: null, reason: null, note: null, epoch: null });
    expect(switchRunReport({ plan, steps: { 'legacy.off': 2, 'queuedV5.resent': 0 } })).toMatchObject({ switchDate: '2026-11-05', orders: 3, steps: 2 });
    expect(switchRunReport({ reason: 'OPENING_WRONG', note: 'corrected', epoch: 1 })).toMatchObject({ reason: 'OPENING_WRONG', note: 'corrected', epoch: 1, switchDate: null, orders: null });
  });
  it('another shape gives nulls', () => {
    const blank = { switchDate: null, mode: null, openingBalanceMinor: null, orders: null, queuedV5: null, steps: null, reason: null, note: null, epoch: null };
    for (const raw of [null, undefined, 'x', 3, [], { switchDate: 5, orders: 'many', queuedV5: 'x', epoch: '2' }]) expect(switchRunReport(raw)).toEqual(blank);
  });
});
