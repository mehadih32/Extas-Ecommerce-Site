// PR 173 — the pre-order advance without a database: the owner's cap (a percentage of the total, rounded down, never
// above the due), the default ask, a full advance only when allowed, the smallest advance, and what the door collects
// after it. Every value is made up.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { advanceCap, advancePlan, ADVANCE_OPEN_STATES, type PartialRules } from './advance-pure';

const OFF: PartialRules = registry['payments.partial'].default;
const ON: PartialRules = { ...OFF, enabled: true };

describe('PR 173 · the pre-order advance', () => {
  it('ships off with the 10% cap of §59 answer 29, no minimum and no full advance', () => {
    expect(OFF).toEqual({ enabled: false, capPercent: 10, minMinor: null, allowFull: false });
  });

  it('the cap: the percentage of the total, rounded down, never above the due', () => {
    expect(advanceCap(ON, { totalMinor: 155_555, dueMinor: 155_555 })).toBe(15_555);
    expect(advanceCap(ON, { totalMinor: 155_555, dueMinor: 4_000 })).toBe(4_000);
    expect(advanceCap({ ...ON, capPercent: 0 }, { totalMinor: 100_000, dueMinor: 100_000 })).toBe(0);
  });

  it('a partial advance leaves the rest at the door; above the cap or below the minimum is refused', () => {
    const m = { totalMinor: 200_000, dueMinor: 200_000 };
    expect(advancePlan(ON, m)).toEqual({ ok: true, advanceMinor: 20_000, capMinor: 20_000, codAfterMinor: 180_000, full: false });
    expect(advancePlan(ON, m, { amountMinor: 5_000 })).toMatchObject({ ok: true, advanceMinor: 5_000, codAfterMinor: 195_000 });
    expect(advancePlan(ON, m, { amountMinor: 20_001 })).toMatchObject({ ok: false, code: 'OVER_CAP', capMinor: 20_000 });
    expect(advancePlan({ ...ON, minMinor: 10_000 }, m, { amountMinor: 9_999 })).toMatchObject({ ok: false, code: 'BELOW_MIN', minMinor: 10_000 });
    expect(advancePlan({ ...ON, capPercent: 0 }, m)).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    expect(advancePlan(ON, { totalMinor: 200_000, dueMinor: 0 })).toMatchObject({ ok: false, code: 'NOTHING_DUE' });
  });

  it('a full advance leaves nothing at the door, and only when the owner allows it', () => {
    const m = { totalMinor: 200_000, dueMinor: 190_000 };
    expect(advancePlan(ON, m, { full: true })).toMatchObject({ ok: false, code: 'OVER_CAP' });
    expect(advancePlan({ ...ON, allowFull: true }, m, { full: true })).toEqual({ ok: true, advanceMinor: 190_000, capMinor: 20_000, codAfterMinor: 0, full: true });
  });

  it('an advance is asked only before the parcel leaves the shop', () => {
    expect([...ADVANCE_OPEN_STATES]).toEqual(['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'PACKED']);
  });
});
