// S28 · PR 685 — the add-product wizard's steps (pure).
import { describe, expect, it } from 'vitest';
import {
  advanceDraftState,
  firstOpenStep,
  parseWizardStep,
  readDraftState,
  stepDone,
  WIZARD_KEYS,
  WIZARD_PARTS,
  WIZARD_STEPS,
  wizardKey,
  type WizardFacts,
} from '../src/wizard-pick';

const empty: WizardFacts = {
  hasName: false,
  hasCategory: false,
  colours: 0,
  sizes: 0,
  photos: 0,
  variants: 0,
  pricedVariants: 0,
};

describe('wizard steps (PR 685)', () => {
  it('has eight steps, each with its screen parts', () => {
    expect(WIZARD_STEPS).toBe(8);
    expect(WIZARD_KEYS).toHaveLength(8);
    expect(WIZARD_PARTS.photos).toContain('sec-photos');
    expect(WIZARD_PARTS.publish).toEqual(['sec-publish', 'sec-ready']);
  });

  it('reads the step from the address, 2 to 8 only', () => {
    expect(parseWizardStep('3')).toBe(3);
    expect(parseWizardStep(['8'])).toBe(8);
    for (const bad of ['1', '9', '0', 'x', '', undefined, null, '03']) expect(parseWizardStep(bad)).toBeNull();
    expect(wizardKey(1)).toBe('start');
    expect(wizardKey(99)).toBe('publish');
  });

  it('says a step is done from plain facts', () => {
    expect(stepDone(2, empty)).toBe(false);
    expect(stepDone(2, { ...empty, hasName: true, hasCategory: true })).toBe(true);
    expect(stepDone(3, { ...empty, colours: 1, sizes: 0 })).toBe(false);
    expect(stepDone(3, { ...empty, colours: 1, sizes: 2 })).toBe(true);
    expect(stepDone(4, { ...empty, photos: 1 })).toBe(true);
    expect(stepDone(5, { ...empty, variants: 2, pricedVariants: 1 })).toBe(false);
    expect(stepDone(5, { ...empty, variants: 2, pricedVariants: 2 })).toBe(true);
    expect(stepDone(5, empty)).toBe(false);
    expect(stepDone(8, empty)).toBe(false);
  });

  it('finds the first open step', () => {
    expect(firstOpenStep(empty)).toBe(2);
    expect(firstOpenStep({ ...empty, hasName: true, hasCategory: true })).toBe(3);
    expect(
      firstOpenStep({
        hasName: true,
        hasCategory: true,
        colours: 1,
        sizes: 1,
        photos: 1,
        variants: 1,
        pricedVariants: 1,
      }),
    ).toBe(8);
  });

  it('remembers the furthest step and ignores odd stored values', () => {
    const now = new Date('2026-11-13T10:00:00Z');
    const a = advanceDraftState(null, 4, now);
    expect(a).toEqual({ step: 4, furthest: 4, at: now.toISOString() });
    expect(advanceDraftState(a, 3, now)).toMatchObject({
      step: 3,
      furthest: 4,
    });
    expect(advanceDraftState(a, 99, now).step).toBe(8);
    expect(readDraftState({ step: 1, furthest: 2, at: 'x' })).toBeNull();
    expect(readDraftState('nope')).toBeNull();
    expect(readDraftState({ step: 3, furthest: 2, at: 'x' })).toEqual({
      step: 3,
      furthest: 3,
      at: 'x',
    });
  });
});
