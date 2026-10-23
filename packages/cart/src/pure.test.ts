// The bag's pure rules: size groups and their flags (PR 110, SIM-F-036), the ladder and the offer slot (PR 109), the
// panel's fill rule (PR 106, CN-012) and the code box's state (PR 112, SIM-F-009).
import { describe, expect, it } from 'vitest';
import { answerFor, codeStateOf, inDays, ladderOf, offerSlotOf, picksThatFit, sizeFlags, sizeGroups, type CodeFacts, type SizeLine } from './pure';

const line = (lineId: string, size: string, order: number, productId = 'shirt', colourId: string | null = 'sky'): SizeLine => ({ lineId, productId, colourId, sizeId: `s-${size}`, sizeOrder: order, sizeLabel: size });

describe('PR 110 · the same product in neighbouring sizes', () => {
  it('two neighbouring sizes of the same product and colour make one group, after its last line', () => {
    const g = sizeGroups([line('a', 'M', 2), line('x', 'M', 2, 'polo', 'charcoal'), line('b', 'L', 3)]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ productId: 'shirt', colourId: 'sky', sizes: [{ label: 'M' }, { label: 'L' }], lineIds: ['a', 'b'], lastLineId: 'b' });
    expect(g[0]!.key).toBe('shirt|sky|s-L+s-M');
  });

  it('sizes that are not neighbours, another colour or another product make no group', () => {
    expect(sizeGroups([line('a', 'S', 1), line('b', 'L', 3)])).toEqual([]);
    expect(sizeGroups([line('a', 'M', 2), line('b', 'L', 3, 'shirt', 'white')])).toEqual([]);
    expect(sizeGroups([line('a', 'M', 2), line('b', 'L', 3, 'tee')])).toEqual([]);
  });

  it('SIM-F-036: a family buying S, M and L is one group, and "for different people" skips the flag', () => {
    const lines = [line('s', 'S', 1), line('m', 'M', 2), line('l', 'L', 3)];
    const groups = sizeGroups(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sizes.map((s) => s.label)).toEqual(['S', 'M', 'L']);
    // No answer yet: one flag for the team, never two overlapping "2 sizes" flags.
    expect(sizeFlags(groups, {})).toEqual([{ key: groups[0]!.key, productId: 'shirt', colourId: 'sky', sizes: ['S', 'M', 'L'] }]);
    // "One is for someone else" (the demo's bracketAck "other"): no flag at all.
    expect(sizeFlags(groups, { [groups[0]!.key]: 'other' })).toEqual([]);
    // "Keep both" still tells the team to check.
    expect(sizeFlags(groups, { [groups[0]!.key]: 'keep' })).toHaveLength(1);
  });

  it('an answer for S and M holds when the family adds L (not asked again)', () => {
    const before = sizeGroups([line('s', 'S', 1), line('m', 'M', 2)]);
    const answers = { [before[0]!.key]: 'other' as const };
    const after = sizeGroups([line('s', 'S', 1), line('m', 'M', 2), line('l', 'L', 3)]);
    expect(answerFor(after[0]!, answers)).toBe('other');
    expect(sizeFlags(after, answers)).toEqual([]);
    // "Help me pick" is a question, not an answer: it is not carried over.
    expect(answerFor(after[0]!, { [before[0]!.key]: 'help' })).toBeNull();
  });
});

describe('PR 109 · the ladder and the offer slot', () => {
  const tiers = [
    { quantity: 4, priceMinor: 270000 },
    { quantity: 2, priceMinor: 150000 },
    { quantity: 3, priceMinor: 210000 },
  ];

  it('rows in order with the saving against the item’s own price; the next step and the bar', () => {
    const l = ladderOf({ tiers, unitPriceMinor: 115000, inBag: 1, max: 3 })!;
    expect(l.rows).toEqual([
      { quantity: 2, priceMinor: 150000, saveMinor: 80000 },
      { quantity: 3, priceMinor: 210000, saveMinor: 135000 },
      { quantity: 4, priceMinor: 270000, saveMinor: 190000 },
    ]);
    expect(l.next).toEqual({ quantity: 2, priceMinor: 150000, more: 1 });
    expect(l.progress).toBe(25);
    expect(ladderOf({ tiers, unitPriceMinor: 115000, inBag: 4, max: 3 })!.next).toBeNull();
  });

  it('at most `bag.tiers.max` tiers; a "saving" that is not one is never said (CN-018)', () => {
    expect(ladderOf({ tiers, unitPriceMinor: 115000, inBag: 0, max: 2 })!.rows.map((r) => r.quantity)).toEqual([2, 3]);
    expect(ladderOf({ tiers, unitPriceMinor: 60000, inBag: 0, max: 4 })!.rows[0]!.saveMinor).toBeNull();
    expect(ladderOf({ tiers: [], unitPriceMinor: 60000, inBag: 0, max: 4 })).toBeNull();
  });

  it('the dates: empty ends are open, the last day counts', () => {
    expect(inDays('2026-10-23', null, null)).toBe(true);
    expect(inDays('2026-10-23', '2026-10-24', null)).toBe(false);
    expect(inDays('2026-10-31', null, '2026-10-31')).toBe(true);
    expect(inDays('2026-11-01', null, '2026-10-31')).toBe(false);
  });

  it('the slot: a set that saves first, then the free-delivery gap, then "already free"; otherwise nothing', () => {
    const set = { kind: 'set' as const, slug: 'trio', nameEn: 'Trio', nameBn: null, pieces: 3, payMinor: 310000, savingMinor: 75000, names: [], namesBn: [] };
    const notFree = { free: false, remainingMinor: 30000, hasFreeRule: true };
    expect(offerSlotOf({ set, delivery: notFree })).toBe(set);
    expect(offerSlotOf({ set: { ...set, savingMinor: 0 }, delivery: notFree })).toEqual({ kind: 'freeGap', remainingMinor: 30000 });
    expect(offerSlotOf({ set: null, delivery: { free: true, remainingMinor: null, hasFreeRule: true } })).toEqual({ kind: 'freeDone' });
    // No rule behind it: nothing is said (never an empty box, never an invented line).
    expect(offerSlotOf({ set: null, delivery: { free: false, remainingMinor: null, hasFreeRule: false } })).toBeNull();
    expect(offerSlotOf({ set: null, delivery: { free: true, remainingMinor: null, hasFreeRule: false } })).toBeNull();
  });
});

describe('PR 106 · the panel’s recommendation fill rule (CN-012)', () => {
  const rows = [70, 70, 70, 70, 70, 70];
  it('fit: as many rows as fit at least `gap` px under the buttons, then "+N more"', () => {
    expect(picksThatFit({ mode: 'fit', count: 12, available: 300, rowHeights: rows, gap: 12, rowGap: 12, perRow: 2 })).toEqual({ shown: 6, more: 6 });
    expect(picksThatFit({ mode: 'fit', count: 12, available: 60, rowHeights: rows, gap: 12, rowGap: 12, perRow: 2 })).toEqual({ shown: 0, more: 12 });
  });
  it('fixed shows the number, off shows none', () => {
    expect(picksThatFit({ mode: 'fixed', count: 4, available: 0, rowHeights: rows, gap: 12, rowGap: 12, perRow: 2 })).toEqual({ shown: 4, more: 0 });
    expect(picksThatFit({ mode: 'off', count: 4, available: 900, rowHeights: rows, gap: 12, rowGap: 12, perRow: 2 })).toEqual({ shown: 0, more: 0 });
  });
});

describe('PR 112 · the code box, SIM-F-009', () => {
  const facts = (f: Partial<CodeFacts>): CodeFacts => ({ code: 'EID', check: { ok: true, reason: null, ruleId: 'r' }, appliedMinor: 0, moreMinor: null, setApplied: false, otherApplied: false, referral: false, ...f });

  it('applied, needs more, a better offer, or not for these items', () => {
    expect(codeStateOf(facts({ code: null }))).toEqual({ state: 'none' });
    expect(codeStateOf(facts({ appliedMinor: 16500 }))).toEqual({ state: 'applied', code: 'EID', amountMinor: 16500 });
    expect(codeStateOf(facts({ moreMinor: 20000 }))).toEqual({ state: 'needsMore', code: 'EID', moreMinor: 20000 });
    expect(codeStateOf(facts({ setApplied: true }))).toEqual({ state: 'betterOffer', code: 'EID', by: 'set' });
    expect(codeStateOf(facts({ otherApplied: true }))).toEqual({ state: 'betterOffer', code: 'EID', by: 'offer' });
    expect(codeStateOf(facts({}))).toEqual({ state: 'notForItems', code: 'EID' });
  });

  it('a members-only code says so in words; a friend’s invite code is told apart from an unknown one', () => {
    expect(codeStateOf(facts({ check: { ok: false, reason: 'MEMBERS_ONLY', ruleId: 'r' } }))).toEqual({ state: 'refused', code: 'EID', reason: 'MEMBERS_ONLY' });
    expect(codeStateOf(facts({ check: { ok: false, reason: 'UNKNOWN', ruleId: null } }))).toEqual({ state: 'refused', code: 'EID', reason: 'UNKNOWN' });
    expect(codeStateOf(facts({ check: { ok: false, reason: 'UNKNOWN', ruleId: null }, referral: true }))).toEqual({ state: 'refused', code: 'EID', reason: 'REFERRAL' });
  });
});
