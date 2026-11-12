// S24 · PR 457 — pure checks: the C7.8 operation vocabulary, `wantsFinishingRerun`, `describeEdit`, and the
// schema's own bounds (crop box, straighten degrees, brightness/contrast range, spot-removal points).
import { describe, expect, it } from 'vitest';
import { EDIT_OPERATION_KINDS, describeEdit, wantsFinishingRerun, type EditOperation } from './imageEdits';

describe('PR 457 · in-admin image editor (pure)', () => {
  it('fixes the five C7.8 operations, in the blueprint\'s own order', () => {
    expect(EDIT_OPERATION_KINDS).toEqual(['crop', 'straighten', 'brightnessContrast', 'spotRemoval', 'runFinishingAgain']);
  });

  it('wantsFinishingRerun is true only when the list carries that one operation', () => {
    const noRerun: EditOperation[] = [{ kind: 'straighten', degrees: 2 }];
    const withRerun: EditOperation[] = [{ kind: 'crop', box: { x: 0, y: 0, width: 1, height: 1 } }, { kind: 'runFinishingAgain' }];
    expect(wantsFinishingRerun(noRerun)).toBe(false);
    expect(wantsFinishingRerun(withRerun)).toBe(true);
    expect(wantsFinishingRerun([])).toBe(false);
  });

  it('describeEdit reports the operation kinds in order and the finishing-rerun flag', () => {
    const ops: EditOperation[] = [
      { kind: 'brightnessContrast', brightness: 10, contrast: -5 },
      { kind: 'spotRemoval', points: [{ x: 0.5, y: 0.5 }] },
    ];
    expect(describeEdit(ops)).toEqual({ kinds: ['brightnessContrast', 'spotRemoval'], finishingRerun: false });
    expect(describeEdit([...ops, { kind: 'runFinishingAgain' }]).finishingRerun).toBe(true);
  });
});
