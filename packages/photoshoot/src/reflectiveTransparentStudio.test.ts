// S24 · PR 473 — pure tests for the reflective/transparent engine's family vocabulary, its "never invent" plan
// (one real photo, never derived), the "ask for the missing photo" message/requests, and the pipeline-stage
// round-trip (no database).
import { describe, expect, it } from 'vitest';
import {
  completedReflectiveTransparentStages,
  hasReflectiveReference,
  isReflectiveTransparentFamily,
  planReflectiveTransparentOutput,
  REFLECTIVE_TRANSPARENT_FAMILIES,
  REFLECTIVE_TRANSPARENT_PIPELINE_STAGES,
  REFLECTIVE_TRANSPARENT_STUDIO_TAG,
  reflectiveTransparentMissingReferenceMessage,
  reflectiveTransparentMissingReferenceRequests,
} from './reflectiveTransparentStudio';

describe('REFLECTIVE_TRANSPARENT_FAMILIES', () => {
  it("is C7.12's own three named reflective/transparent subjects, verbatim and with no duplicates", () => {
    expect(REFLECTIVE_TRANSPARENT_FAMILIES).toEqual(['perfume', 'watch_glass', 'sunglass_lens']);
    expect(new Set(REFLECTIVE_TRANSPARENT_FAMILIES).size).toBe(REFLECTIVE_TRANSPARENT_FAMILIES.length);
  });
});

describe('isReflectiveTransparentFamily', () => {
  it('accepts every listed family and refuses anything else, including the unrelated whole-product keys', () => {
    for (const f of REFLECTIVE_TRANSPARENT_FAMILIES) expect(isReflectiveTransparentFamily(f)).toBe(true);
    expect(isReflectiveTransparentFamily('watches')).toBe(false);
    expect(isReflectiveTransparentFamily('sunglasses')).toBe(false);
    expect(isReflectiveTransparentFamily('')).toBe(false);
    expect(isReflectiveTransparentFamily(3)).toBe(false);
  });
});

describe('hasReflectiveReference / planReflectiveTransparentOutput', () => {
  it('is ready from a real, non-archived reflective_reference photo', () => {
    expect(hasReflectiveReference([{ role: 'reflective_reference', isOriginal: true, archivedAt: null }])).toBe(true);
    expect(planReflectiveTransparentOutput('perfume', [{ role: 'reflective_reference', isOriginal: true, archivedAt: null }])).toEqual({ family: 'perfume', ready: true });
  });

  it('is not ready with no real reflective_reference on file — C7.12\'s "never invent" rule', () => {
    expect(hasReflectiveReference([])).toBe(false);
    expect(planReflectiveTransparentOutput('watch_glass', [])).toEqual({ family: 'watch_glass', ready: false, reason: 'NO_REFLECTIVE_REFERENCE' });
  });

  it('never derives readiness from an unrelated role — a front_reference never makes it ready', () => {
    const plan = planReflectiveTransparentOutput('sunglass_lens', [{ role: 'front_reference', isOriginal: true, archivedAt: null }]);
    expect(plan).toMatchObject({ ready: false, reason: 'NO_REFLECTIVE_REFERENCE' });
  });

  it('a generated (not real) reference never counts for readiness', () => {
    const plan = planReflectiveTransparentOutput('perfume', [{ role: 'reflective_reference', isOriginal: false, archivedAt: null }]);
    expect(plan.ready).toBe(false);
  });

  it('an archived reference no longer counts', () => {
    const plan = planReflectiveTransparentOutput('perfume', [{ role: 'reflective_reference', isOriginal: true, archivedAt: new Date() }]);
    expect(plan.ready).toBe(false);
  });
});

describe('reflectiveTransparentMissingReferenceMessage / reflectiveTransparentMissingReferenceRequests', () => {
  it('names the family in plain words, never the raw snake_case role', () => {
    const msg = reflectiveTransparentMissingReferenceMessage('watch_glass');
    expect(msg).toContain('watch glass');
    expect(msg).not.toContain('reflective_reference');
    expect(msg.toLowerCase()).toContain('never generated');
  });

  it('every family gets its own plain label', () => {
    expect(reflectiveTransparentMissingReferenceMessage('perfume')).toContain('perfume bottle');
    expect(reflectiveTransparentMissingReferenceMessage('sunglass_lens')).toContain('sunglass lens');
  });

  it('asks once when the real photo is missing', () => {
    const reqs = reflectiveTransparentMissingReferenceRequests('perfume', []);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ family: 'perfume' });
    expect(reqs[0]?.message.length).toBeGreaterThan(0);
  });

  it('never asks once the real photo is already on file', () => {
    const reqs = reflectiveTransparentMissingReferenceRequests('watch_glass', [{ role: 'reflective_reference', isOriginal: true, archivedAt: null }]);
    expect(reqs).toEqual([]);
  });

  it('a generated or archived reference never counts, so the photo is still asked for', () => {
    const generated = reflectiveTransparentMissingReferenceRequests('sunglass_lens', [{ role: 'reflective_reference', isOriginal: false, archivedAt: null }]);
    expect(generated).toHaveLength(1);
    const archived = reflectiveTransparentMissingReferenceRequests('sunglass_lens', [{ role: 'reflective_reference', isOriginal: true, archivedAt: new Date() }]);
    expect(archived).toHaveLength(1);
  });
});

describe('REFLECTIVE_TRANSPARENT_PIPELINE_STAGES / completedReflectiveTransparentStages', () => {
  it("is C7.12's own honest pipeline, verbatim and in its own order, with no duplicates", () => {
    expect(REFLECTIVE_TRANSPARENT_PIPELINE_STAGES).toEqual(['background_replace', 'shadow_rebuild', 'reflection_control', 'colour_correct', 'crop_to_standard']);
    expect(new Set(REFLECTIVE_TRANSPARENT_PIPELINE_STAGES).size).toBe(REFLECTIVE_TRANSPARENT_PIPELINE_STAGES.length);
  });

  it('reads every stage tag present, in pipeline order, ignoring unrelated tags', () => {
    const tags = [REFLECTIVE_TRANSPARENT_STUDIO_TAG, 'perfume', 'crop_to_standard', 'background_replace'];
    expect(completedReflectiveTransparentStages(tags)).toEqual(['background_replace', 'crop_to_standard']);
  });

  it('is empty when no stage tag is present', () => {
    expect(completedReflectiveTransparentStages([REFLECTIVE_TRANSPARENT_STUDIO_TAG, 'perfume'])).toEqual([]);
  });
});
