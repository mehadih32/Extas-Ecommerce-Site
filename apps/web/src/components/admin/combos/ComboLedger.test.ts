// PR 1129: which status chip a combo sits under in the one-table Combos page.
import { describe, expect, it } from 'vitest';
import { fixedChip, ruleChip } from './ComboLedger';

describe('combo ledger chips (PR 1129)', () => {
  it('sorts fixed combos by their status and state', () => {
    expect(fixedChip({ status: 'RUNNING', state: 'live' })).toBe('active');
    expect(fixedChip({ status: 'SOLD_OUT', state: 'live' })).toBe('paused');
    expect(fixedChip({ status: 'RUNNING', state: 'soon' })).toBe('scheduled');
    expect(fixedChip({ status: 'PAUSED', state: 'off' })).toBe('off');
    expect(fixedChip({ status: 'DRAFT', state: 'draft' })).toBe('off');
    expect(fixedChip({ status: 'ENDED', state: 'ended' })).toBe('archived');
  });
  it('pauses a live rule with no pair in stock', () => {
    expect(ruleChip({ state: 'live', counts: { withStock: 2 } as never })).toBe('active');
    expect(ruleChip({ state: 'live', counts: { withStock: 0 } as never })).toBe('paused');
    expect(ruleChip({ state: 'off', counts: { withStock: 2 } as never })).toBe('off');
    expect(ruleChip({ state: 'ended', counts: { withStock: 2 } as never })).toBe('archived');
  });
});
