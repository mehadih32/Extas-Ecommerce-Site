// S24 · PR 455 pure tests: the finishing pipeline's own order, the readiness plan, and the tag round-trips
// (`finishingCandidateId`, `completedFinishingSteps`).
import { describe, expect, it } from 'vitest';
import { completedFinishingSteps, finishingCandidateId, finishingStepTag, FINISHING_STEPS, FINISHING_TAG, planFinishing } from './finishing';

describe('PR 455 · FINISHING_STEPS', () => {
  it('is the fixed C7.8 pipeline order, PR 455\'s own two steps', () => {
    expect(FINISHING_STEPS).toEqual(['upscale', 'artifactRepair']);
  });
});

describe('PR 455 · planFinishing', () => {
  it('needs every step when nothing is done yet', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: [] });
    expect(plan.remaining).toEqual(['upscale', 'artifactRepair']);
    expect(plan.next).toBe('upscale');
  });

  it('skips a step already done, in pipeline order', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: ['upscale'] });
    expect(plan.remaining).toEqual(['artifactRepair']);
    expect(plan.next).toBe('artifactRepair');
  });

  it('is done, next null, once every step is done', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: ['upscale', 'artifactRepair'] });
    expect(plan.remaining).toEqual([]);
    expect(plan.next).toBeNull();
  });

  it('never reports a step done twice toward the plan, whatever order completedSteps names it', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: ['artifactRepair', 'artifactRepair'] });
    expect(plan.remaining).toEqual(['upscale']);
  });
});

describe('PR 455 · tag helpers', () => {
  it('finishingStepTag names one step', () => {
    expect(finishingStepTag('upscale')).toBe('finishing:upscale');
    expect(finishingStepTag('artifactRepair')).toBe('finishing:artifactRepair');
  });

  it('finishingCandidateId finds the candidate id among an output\'s own tags', () => {
    const candidateId = crypto.randomUUID();
    expect(finishingCandidateId([FINISHING_TAG, finishingStepTag('upscale'), candidateId])).toBe(candidateId);
  });

  it('finishingCandidateId is null when no tag looks like a uuid', () => {
    expect(finishingCandidateId([FINISHING_TAG, finishingStepTag('upscale')])).toBeNull();
  });

  it('completedFinishingSteps reads back which steps a set of tags records as done', () => {
    const candidateId = crypto.randomUUID();
    expect(completedFinishingSteps([FINISHING_TAG, finishingStepTag('upscale'), candidateId])).toEqual(['upscale']);
    expect(completedFinishingSteps([FINISHING_TAG, finishingStepTag('upscale'), finishingStepTag('artifactRepair'), candidateId])).toEqual(['upscale', 'artifactRepair']);
    expect(completedFinishingSteps([])).toEqual([]);
  });
});
