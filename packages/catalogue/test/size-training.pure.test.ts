// PR 59 — the Find My Size training engine, on its own (no database, no settings): what one answer says, what a
// group's answers say together, and the ease a group proposes. The engine never moves a chart on its own: below the
// owner's smallest number of signals it proposes nothing at all.
import { describe, expect, it } from 'vitest';
import { answerSignal, groupStats, proposeEase, readModelData, sizeIndex, type SizeAnswer, type TrainingNumbers } from '../src/size-training';

const ORDER = ['s', 'm', 'l', 'xl', 'xxl'];
const n: TrainingNumbers = { minAnswers: 10, flagSharePct: 25, maxEaseAdjustInch: 1, stepInch: 0.25 };
const answer = (over: Partial<SizeAnswer> = {}): SizeAnswer => ({ recommended: 'l', chosen: null, ordered: false, exchangedTo: null, verdict: null, easeInch: 2, ...over });

describe('one answer', () => {
  it('a size exchange decides it: swapping up means our answer ran tight, down means loose', () => {
    expect(answerSignal(answer({ chosen: 'l', ordered: true, exchangedTo: 'xl' }), ORDER)).toBe('tight');
    expect(answerSignal(answer({ chosen: 'l', ordered: true, exchangedTo: 'm' }), ORDER)).toBe('loose');
    // swapped for the same size (a colour or fault swap): that says nothing about the size
    expect(answerSignal(answer({ chosen: 'l', ordered: true, exchangedTo: 'l' }), ORDER)).toBe('right');
  });

  it('then his review, in his own words', () => {
    expect(answerSignal(answer({ verdict: 'small' }), ORDER)).toBe('tight');
    expect(answerSignal(answer({ verdict: 'big' }), ORDER)).toBe('loose');
    expect(answerSignal(answer({ verdict: 'right', chosen: 'xl' }), ORDER)).toBe('right');
  });

  it('then the size he took: one step up is tight, one step down is loose, the same size is right', () => {
    expect(answerSignal(answer({ chosen: 'xl' }), ORDER)).toBe('tight');
    expect(answerSignal(answer({ chosen: 'm' }), ORDER)).toBe('loose');
    expect(answerSignal(answer({ chosen: 'l' }), ORDER)).toBe('right');
  });

  it('an answer nobody acted on, or on a size the shop does not know, teaches nothing', () => {
    expect(answerSignal(answer(), ORDER)).toBe('none');
    expect(answerSignal(answer({ recommended: null, chosen: 'l' }), ORDER)).toBe('none');
    expect(answerSignal(answer({ chosen: 'not-a-size' }), ORDER)).toBe('none');
    expect(sizeIndex(ORDER, null)).toBe(-1);
  });
});

describe('a group of answers', () => {
  it('counts what happened and flags a chart that keeps running tight', () => {
    const answers = [
      ...Array.from({ length: 6 }, () => answer({ chosen: 'xl' })), // took one size up
      ...Array.from({ length: 3 }, () => answer({ chosen: 'l', ordered: true })), // took ours
      answer({ chosen: 'm' }), // took one down
      answer(), // did nothing
    ];
    const s = groupStats(answers, ORDER, n);
    expect(s.answers).toBe(11);
    expect(s.withChoice).toBe(10);
    expect(s.followed).toBe(3);
    expect(s.wentUp).toBe(6);
    expect(s.wentDown).toBe(1);
    expect(s.ordered).toBe(3);
    expect({ tight: s.tight, loose: s.loose, right: s.right, signals: s.signals }).toEqual({ tight: 6, loose: 1, right: 3, signals: 10 });
    expect(s.tightSharePct).toBe(60);
    expect(s.flag).toBe('tight');
  });

  it('a chart people keep sizing down from is flagged loose; an even split is flagged neither way', () => {
    const loose = groupStats([answer({ chosen: 'm' }), answer({ chosen: 'm' }), answer({ chosen: 'l' })], ORDER, n);
    expect(loose.flag).toBe('loose');
    const even = groupStats([answer({ chosen: 'm' }), answer({ chosen: 'xl' })], ORDER, n);
    expect(even.flag).toBeNull();
    expect(groupStats([], ORDER, n).flag).toBeNull();
  });

  it('exchanges are counted even when he took the size we said', () => {
    const s = groupStats([answer({ chosen: 'l', ordered: true, exchangedTo: 'xl' })], ORDER, n);
    expect({ followed: s.followed, exchanged: s.exchanged, tight: s.tight }).toEqual({ followed: 1, exchanged: 1, tight: 1 });
  });
});

describe('the ease it proposes', () => {
  const stats = (tight: number, loose: number, right = 0) =>
    groupStats([...Array.from({ length: tight }, () => answer({ chosen: 'xl' })), ...Array.from({ length: loose }, () => answer({ chosen: 'm' })), ...Array.from({ length: right }, () => answer({ chosen: 'l' }))], ORDER, n);

  it('says nothing at all below the owner’s smallest number of signals', () => {
    const p = proposeEase(stats(5, 0), 2, n);
    expect(p).toMatchObject({ enough: false, verdict: 'not-enough', deltaInch: 0, proposedEaseInch: 2, signals: 5 });
    expect(p.confidencePct).toBe(50);
  });

  it('all tight moves the ease by the whole allowance, in the owner’s step', () => {
    const p = proposeEase(stats(12, 0), 2, n);
    expect(p).toMatchObject({ enough: true, verdict: 'tight', deltaInch: 1, proposedEaseInch: 3, confidencePct: 100 });
  });

  it('all loose takes the same off, and never below zero', () => {
    expect(proposeEase(stats(0, 12), 2, n)).toMatchObject({ verdict: 'loose', deltaInch: -1, proposedEaseInch: 1 });
    expect(proposeEase(stats(0, 12), 0.5, n)).toMatchObject({ proposedEaseInch: 0, deltaInch: -0.5 });
  });

  it('a mixed group moves in whole steps; an even split moves nothing', () => {
    expect(proposeEase(stats(7, 3), 2, n)).toMatchObject({ verdict: 'tight', deltaInch: 0.5, proposedEaseInch: 2.5 });
    expect(proposeEase(stats(6, 6), 2, n)).toMatchObject({ verdict: 'balanced', deltaInch: 0, proposedEaseInch: 2 });
    // the owner's allowance is the cap: a bigger allowance moves more, a zero allowance never moves
    expect(proposeEase(stats(12, 0), 2, { ...n, maxEaseAdjustInch: 2 })).toMatchObject({ proposedEaseInch: 4 });
    expect(proposeEase(stats(12, 0), 2, { ...n, maxEaseAdjustInch: 0 })).toMatchObject({ deltaInch: 0, verdict: 'balanced' });
  });

  it('"right" signals count towards the number needed; a thin majority never moves a chart', () => {
    // 2 tight of 12 signals is 17 %, under the owner's 25 % share: the report does not flag it, so nothing is proposed
    const p = proposeEase(stats(2, 0, 10), 2, n);
    expect(p).toMatchObject({ enough: true, verdict: 'balanced', deltaInch: 0, proposedEaseInch: 2 });
    // the same signals with a lower share set by the owner do move it
    const keen = { ...n, flagSharePct: 15 };
    expect(proposeEase(groupStats([...Array.from({ length: 2 }, () => answer({ chosen: 'xl' })), ...Array.from({ length: 10 }, () => answer({ chosen: 'l' }))], ORDER, keen), 2, keen).deltaInch).toBe(0.25);
  });
});

describe('a stored version read back', () => {
  it('only this engine’s own model is used; anything else gives nothing', () => {
    expect(readModelData({ engine: 'ease-v1', easeInch: 2.5 })?.easeInch).toBe(2.5);
    expect(readModelData({ engine: 'something-else', easeInch: 2.5 })).toBeNull();
    expect(readModelData({ engine: 'ease-v1', easeInch: -1 })).toBeNull();
    expect(readModelData(null)).toBeNull();
    expect(readModelData([1, 2])).toBeNull();
  });
});
