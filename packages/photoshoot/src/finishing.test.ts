// S24 · PR 455–456 pure tests: the finishing pipeline's own order, the readiness plan, the tag round-trips
// (`finishingCandidateId`, `completedFinishingSteps`), and (PR 456) the full five-step pipeline and
// `isFinishingComplete`.
import { describe, expect, it } from 'vitest';
import { completedFinishingSteps, finishingCandidateId, finishingStepTag, FINISHING_STEPS, FINISHING_TAG, isFinishingComplete, planFinishing } from './finishing';

describe('PR 455/456 · FINISHING_STEPS', () => {
  it('is the fixed C7.8 pipeline order, all five steps across both PRs', () => {
    expect(FINISHING_STEPS).toEqual(['upscale', 'artifactRepair', 'contactShadow', 'colourGrade', 'sharpen']);
  });
});

describe('PR 455/456 · planFinishing', () => {
  it('needs every step when nothing is done yet', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: [] });
    expect(plan.remaining).toEqual(['upscale', 'artifactRepair', 'contactShadow', 'colourGrade', 'sharpen']);
    expect(plan.next).toBe('upscale');
  });

  it('skips a step already done, in pipeline order', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: ['upscale'] });
    expect(plan.remaining).toEqual(['artifactRepair', 'contactShadow', 'colourGrade', 'sharpen']);
    expect(plan.next).toBe('artifactRepair');
  });

  it('moves on to PR 456\'s own steps once PR 455\'s two are done', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: ['upscale', 'artifactRepair'] });
    expect(plan.remaining).toEqual(['contactShadow', 'colourGrade', 'sharpen']);
    expect(plan.next).toBe('contactShadow');
  });

  it('is done, next null, once every step is done', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: [...FINISHING_STEPS] });
    expect(plan.remaining).toEqual([]);
    expect(plan.next).toBeNull();
  });

  it('never reports a step done twice toward the plan, whatever order completedSteps names it', () => {
    const plan = planFinishing({ assetId: 'a', completedSteps: ['sharpen', 'sharpen'] });
    expect(plan.remaining).toEqual(['upscale', 'artifactRepair', 'contactShadow', 'colourGrade']);
  });
});

describe('PR 456 · isFinishingComplete', () => {
  it('is false until every one of the five steps is done', () => {
    expect(isFinishingComplete({ assetId: 'a', completedSteps: [] })).toBe(false);
    expect(isFinishingComplete({ assetId: 'a', completedSteps: ['upscale', 'artifactRepair', 'contactShadow', 'colourGrade'] })).toBe(false);
  });

  it('is true once every step is done', () => {
    expect(isFinishingComplete({ assetId: 'a', completedSteps: [...FINISHING_STEPS] })).toBe(true);
  });
});

describe('PR 455/456 · tag helpers', () => {
  it('finishingStepTag names one step, including PR 456\'s own three', () => {
    expect(finishingStepTag('upscale')).toBe('finishing:upscale');
    expect(finishingStepTag('artifactRepair')).toBe('finishing:artifactRepair');
    expect(finishingStepTag('contactShadow')).toBe('finishing:contactShadow');
    expect(finishingStepTag('colourGrade')).toBe('finishing:colourGrade');
    expect(finishingStepTag('sharpen')).toBe('finishing:sharpen');
  });

  it('finishingCandidateId finds the candidate id among an output\'s own tags', () => {
    const candidateId = crypto.randomUUID();
    expect(finishingCandidateId([FINISHING_TAG, finishingStepTag('sharpen'), candidateId])).toBe(candidateId);
  });

  it('finishingCandidateId is null when no tag looks like a uuid', () => {
    expect(finishingCandidateId([FINISHING_TAG, finishingStepTag('upscale')])).toBeNull();
  });

  it('completedFinishingSteps reads back which steps a set of tags records as done, in pipeline order', () => {
    const candidateId = crypto.randomUUID();
    expect(completedFinishingSteps([FINISHING_TAG, finishingStepTag('upscale'), candidateId])).toEqual(['upscale']);
    expect(completedFinishingSteps([FINISHING_TAG, finishingStepTag('sharpen'), finishingStepTag('upscale'), candidateId])).toEqual(['upscale', 'sharpen']);
    expect(completedFinishingSteps([])).toEqual([]);
  });
});
