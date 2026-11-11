// S15 · PR 309 — the pure parts of a per-agent monthly spend cap: the ok/warned/paused state formula, the
// enforcement check a future job dispatcher will call, and validating an owner-submitted cap (no Postgres needed,
// unlike control-room.db.test.ts's end-to-end coverage, which also checks `setAgentMonthlyCap`'s own transaction and
// audit row, and the Telegram-alert dedupe).
import { describe, expect, it } from 'vitest';
import { isAiError } from './errors';
import { agentCapState, parseCapInput, wouldExceedCap } from './spend-cap';

describe('agentCapState', () => {
  it('is "none" whenever there is no cap — null or 0', () => {
    expect(agentCapState(0, null)).toBe('none');
    expect(agentCapState(5000, null)).toBe('none');
    expect(agentCapState(0, 0)).toBe('none');
  });

  it('is "ok" below 80% of the cap', () => {
    expect(agentCapState(0, 10000)).toBe('ok');
    expect(agentCapState(7999, 10000)).toBe('ok');
  });

  it('is "warned" from exactly 80% of the cap, up to (not including) 100%', () => {
    expect(agentCapState(8000, 10000)).toBe('warned');
    expect(agentCapState(9999, 10000)).toBe('warned');
  });

  it('is "paused" at or over 100% of the cap', () => {
    expect(agentCapState(10000, 10000)).toBe('paused');
    expect(agentCapState(15000, 10000)).toBe('paused');
  });

  it('never uses float math — the 80% line is exact at amounts that do not divide evenly', () => {
    // 10001 * 0.8 = 8000.8, so 8000 is still "ok" under float rounding risk; whole-number cross-multiplication
    // (spent*5 >= cap*4) keeps the line exact regardless.
    expect(agentCapState(8000, 10001)).toBe('ok');
    expect(agentCapState(8001, 10001)).toBe('warned');
  });
});

describe('wouldExceedCap', () => {
  it('never exceeds a null (no) cap', () => {
    expect(wouldExceedCap(1_000_000, 1_000_000, null)).toBe(false);
  });

  it('is false while spend plus the new amount stays at or under the cap', () => {
    expect(wouldExceedCap(4000, 1000, 5000)).toBe(false);
  });

  it('is true the moment spend plus the new amount would pass the cap', () => {
    expect(wouldExceedCap(4000, 1001, 5000)).toBe(true);
    expect(wouldExceedCap(5000, 1, 5000)).toBe(true);
  });
});

describe('parseCapInput', () => {
  it('reads null or undefined as "no cap"', () => {
    expect(parseCapInput(null)).toBeNull();
    expect(parseCapInput(undefined)).toBeNull();
  });

  it('accepts a whole positive number', () => {
    expect(parseCapInput(50000)).toBe(50000);
    expect(parseCapInput(1)).toBe(1);
  });

  it('accepts the column`s own maximum', () => {
    expect(parseCapInput(2_147_483_647)).toBe(2_147_483_647);
  });

  it('refuses zero, a negative number, a non-integer, over the column maximum, or a non-number', () => {
    for (const bad of [0, -1, 1.5, 2_147_483_648, '500', true, {}]) {
      expect(() => parseCapInput(bad)).toThrow();
      try {
        parseCapInput(bad);
      } catch (e) {
        expect(isAiError(e)).toBe(true);
      }
    }
  });
});
