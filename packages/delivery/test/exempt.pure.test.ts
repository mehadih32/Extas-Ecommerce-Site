// PR 565 — free delivery is exempt from the band machinery: the one question every band screen, fix and message asks.
import { describe, expect, it } from 'vitest';
import { bandExempt } from '../src/exempt';

describe('bandExempt (PR 565)', () => {
  it('a free order is exempt, by its mark or by its stored charge', () => {
    expect(bandExempt({ status: 'ask', bandExempt: true, charge: { state: 'free', reason: 'campaign' } })).toBe(true);
    expect(bandExempt({ status: 'resolved', charge: { state: 'free', reason: 'threshold' } })).toBe(true);
  });
  it('a charged, not-set or unknown order is not; nothing stored is not', () => {
    for (const state of ['charge', 'not-set', 'unknown']) expect(bandExempt({ status: 'resolved', charge: { state } })).toBe(false);
    for (const x of [null, undefined, 'free', 7, {}, { charge: null }]) expect(bandExempt(x)).toBe(false);
  });
});
