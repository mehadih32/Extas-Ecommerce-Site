// PR 524: the stop report's pure parts — what an order's status says about a stop, and the tally per rule with the flag.
import { describe, expect, it } from 'vitest';
import { outcomeOfStatus, STOP_RULES, tallyStops } from './stop-report';

describe('PR 524 · the stop report tally', () => {
  it('reads the outcome from the status', () => {
    expect(outcomeOfStatus('DELIVERED')).toBe('delivered');
    expect(outcomeOfStatus('PARTIALLY_DELIVERED')).toBe('delivered');
    expect(outcomeOfStatus('RETURNED')).toBe('refused');
    expect(outcomeOfStatus('CANCELLED')).toBe('cancelled');
    expect(outcomeOfStatus('ON_HOLD')).toBe('open');
    expect(outcomeOfStatus('IN_TRANSIT')).toBe('open');
  });

  it('one row per rule; the wrong rate counts only ended stops; flagged only at the bar over enough stops; never without a bar', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ rule: 'levelHold' as const, outcome: 'delivered' as const })),
      { rule: 'levelHold' as const, outcome: 'refused' as const },
      { rule: 'levelHold' as const, outcome: 'open' as const },
      { rule: 'duplicateHold' as const, outcome: 'cancelled' as const },
    ];
    const t = tallyStops(rows, { warnWrongPercent: 75, minStops: 4 });
    expect(t.map((x) => x.rule)).toEqual([...STOP_RULES]);
    expect(t.find((x) => x.rule === 'levelHold')).toEqual({ rule: 'levelHold', stops: 5, delivered: 3, refused: 1, cancelled: 0, open: 1, wrongRate: 0.75, flagged: true });
    expect(t.find((x) => x.rule === 'duplicateHold')).toMatchObject({ stops: 1, wrongRate: 0, flagged: false });
    expect(t.find((x) => x.rule === 'advance')).toMatchObject({ stops: 0, wrongRate: null, flagged: false });
    expect(tallyStops(rows, { warnWrongPercent: 76, minStops: 4 }).find((x) => x.rule === 'levelHold')!.flagged).toBe(false);
    expect(tallyStops(rows, { warnWrongPercent: 75, minStops: 5 }).find((x) => x.rule === 'levelHold')!.flagged).toBe(false);
    expect(tallyStops(rows, { warnWrongPercent: null, minStops: 1 }).some((x) => x.flagged)).toBe(false);
  });
});
