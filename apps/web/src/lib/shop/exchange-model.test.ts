// PR 186 — the account's exchange flow, its pure rules (demo 61-exchange.js): the size order for too small / too big,
// the price comparison, the engine reason, and what each step still needs.
import { describe, expect, it } from 'vitest';
import { engineReason, lineOpen, priceDiff, sizeOrder, stepsOk, type FlowState } from './exchange-model';

const sizes = ['s', 'm', 'l', 'xl'].map((key) => ({ key }));

describe('PR 186 · exchange flow rules', () => {
  it('too small shows bigger sizes first, too big smaller first (nearest first), his own in between', () => {
    expect(sizeOrder(sizes, 'm', 'small').map((s) => `${s.key}${s.current ? '*' : ''}`)).toEqual(['l', 'xl', 'm*', 's']);
    expect(sizeOrder(sizes, 'l', 'big').map((s) => `${s.key}${s.current ? '*' : ''}`)).toEqual(['m', 's', 'l*', 'xl']);
    expect(sizeOrder(sizes, 'zz', 'small').map((s) => s.key)).toEqual(['s', 'm', 'l', 'xl']);
  });

  it('compares the new price with what he paid, and maps his reason to the engine', () => {
    expect(priceDiff(150_000, 150_000)).toEqual({ kind: 'same', amountMinor: 0 });
    expect(priceDiff(170_000, 150_000)).toEqual({ kind: 'more', amountMinor: 20_000 });
    expect(priceDiff(120_000, 150_000)).toEqual({ kind: 'less', amountMinor: 30_000 });
    expect(engineReason('small', 'defect')).toBe('size');
    expect(engineReason('problem', 'defect')).toBe('defect');
    expect(engineReason('problem', null)).toBeNull();
  });

  it('each step says what is missing: the item, the reason, the photo, the claim, the size, the option', () => {
    const line = { lineId: 'a', size: null, problem: null, sizes };
    const rules = { problemReason: 'defect', problemPhoto: true, claim: true, claimPhoto: true };
    const base: FlowState = { line: null, reason: null, photos: 0, sizeKey: null, optionId: null, claim: { on: false, note: '', photos: 0 } };
    expect(stepsOk(base, rules).missing[0]).toBe('item');
    expect(stepsOk({ ...base, line }, rules)).toMatchObject({ ok1: true, ok2: false, missing: [null, 'reason', expect.anything()] });
    expect(stepsOk({ ...base, line, reason: 'problem' }, rules).missing[1]).toBe('photo');
    expect(stepsOk({ ...base, line, reason: 'problem', photos: 1 }, rules)).toMatchObject({ ok2: true, ok3: false, missing: [null, null, 'option'] });
    expect(stepsOk({ ...base, line, reason: 'small', claim: { on: true, note: 'label says L', photos: 0 } }, rules).missing[1]).toBe('claim');
    expect(stepsOk({ ...base, line, reason: 'small' }, rules).missing[2]).toBe('size');
    expect(stepsOk({ ...base, line, reason: 'small', sizeKey: 'l', optionId: 'v' }, rules)).toMatchObject({ ok1: true, ok2: true, ok3: true });
    // one size: only a problem; nothing open: not choosable
    const one = { ...line, sizes: [{ key: 'os' }] };
    expect(stepsOk({ ...base, line: one, reason: 'small' }, rules).ok2).toBe(false);
    expect(lineOpen({ ...line, size: 'OPEN', problem: 'OPEN' }, 'defect')).toBe(false);
    expect(lineOpen({ ...line, problem: 'REASON' }, null)).toBe(true);
  });
});
