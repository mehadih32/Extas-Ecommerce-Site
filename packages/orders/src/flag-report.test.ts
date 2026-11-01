// S06 · PR 562 — the flag outcome report's pure parts: what became of one order placed with an ask, the advance
// collected, the way an after-order ask was made, and the tally per layer with its pointer (only once the owner sets a
// share, and only from the fewest flags). Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { askedOutcome, askKeyOf, collectedOf, tallyFlags, totalOf, type FlagUnit } from './flag-report';

const facts = (status: string, paidMinor = 0, advanceRequiredMinor: number | null = 10_000, advancePaid = false) => ({ status, paidMinor, advanceRequiredMinor, advancePaid });

describe('PR 562 · the flag outcome report (pure)', () => {
  it('an order with an ask: paid once the money covers it (or the order service says so), cancelled unpaid walked away, still open waiting, moved on unpaid let go', () => {
    expect(askedOutcome(facts('PLACED', 10_000))).toBe('paid');
    expect(askedOutcome(facts('DELIVERED', 12_000))).toBe('paid');
    expect(askedOutcome(facts('PLACED', 0, 10_000, true))).toBe('paid');
    // paid, then cancelled, is still a customer who paid
    expect(askedOutcome(facts('CANCELLED', 10_000))).toBe('paid');
    expect(askedOutcome(facts('CANCELLED', 5_000))).toBe('walked');
    for (const s of ['PLACED', 'AWAITING_ADVANCE', 'ON_HOLD', 'DRAFT']) expect(askedOutcome(facts(s, 9_999)), s).toBe('waiting');
    for (const s of ['CONFIRMED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED']) expect(askedOutcome(facts(s)), s).toBe('waived');
    // nothing asked on the order (0 or none) is never "paid" by the money alone
    expect(askedOutcome(facts('PLACED', 0, 0))).toBe('waiting');
    expect(askedOutcome(facts('PLACED', 0, null))).toBe('waiting');
  });

  it('the advance collected is what was asked, at most what came in', () => {
    expect(collectedOf({ paidMinor: 12_000, advanceRequiredMinor: 10_000 })).toBe(10_000);
    expect(collectedOf({ paidMinor: 6_000, advanceRequiredMinor: 10_000 })).toBe(6_000);
    expect(collectedOf({ paidMinor: 6_000, advanceRequiredMinor: null })).toBe(6_000);
  });

  it('the way an after-order ask was made: the team, the owner\'s auto option, or a risk level', () => {
    expect(askKeyOf({ reasonCode: 'delivery', actorType: 'STAFF', data: { request: true } })).toBe('team.delivery');
    expect(askKeyOf({ reasonCode: 'full', actorType: 'SYSTEM', data: { request: true } })).toBe('auto.full');
    expect(askKeyOf({ reasonCode: 'high', actorType: 'SYSTEM', data: { requiredMinor: 100 } })).toBe('level.high');
    expect(askKeyOf({ reasonCode: null, actorType: 'SYSTEM', data: null })).toBe('level.unknown');
  });

  it('the tally per layer: every outcome, what the paid ones became, the money, the share lost; pointed out only with a share set and enough flags', () => {
    const u = (key: string, outcome: FlagUnit['outcome'], after: FlagUnit['after'] = null, collectedMinor = 0): FlagUnit => ({ key, name: key === 'a' ? 'Layer A' : null, outcome, after, collectedMinor });
    const units = [u('a', 'paid', 'delivered', 6_000), u('a', 'paid', 'refused', 6_000), u('a', 'left'), u('a', 'left'), u('a', 'walked'), u('a', 'dodged'), u('b', 'waiting'), u('b', 'waived')];
    const off = tallyFlags(units, { warnLeftPercent: null, minFlags: 1 });
    expect(off.map((t) => t.key)).toEqual(['a', 'b']);
    expect(off[0]).toMatchObject({ key: 'a', name: 'Layer A', flagged: 6, paid: 2, left: 2, walked: 1, dodged: 1, waiting: 0, waived: 0, paidDelivered: 1, paidRefused: 1, collectedMinor: 12_000, lostShare: 0.5, warn: false });
    expect(off[1]).toMatchObject({ key: 'b', name: null, flagged: 2, waiting: 1, waived: 1, lostShare: 0, warn: false });
    // half lost: pointed out at 50 %, not at 51 %, and not below the fewest flags
    expect(tallyFlags(units, { warnLeftPercent: 50, minFlags: 6 })[0]!.warn).toBe(true);
    expect(tallyFlags(units, { warnLeftPercent: 51, minFlags: 6 })[0]!.warn).toBe(false);
    expect(tallyFlags(units, { warnLeftPercent: 50, minFlags: 7 })[0]!.warn).toBe(false);
    expect(totalOf(units)).toMatchObject({ key: 'all', flagged: 8, paid: 2, collectedMinor: 12_000, lostShare: 3 / 8, warn: false });
    expect(totalOf([])).toMatchObject({ flagged: 0, lostShare: 0 });
  });
});
