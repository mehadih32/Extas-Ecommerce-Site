// S24 · PR 453 — pure tests: the C7.5 step 9 combined score, the threshold check and best-of-2 selection. No
// database involved.
import { describe, expect, it } from 'vitest';
import { combinedScorePercent, passesQualityThreshold, pickBestCandidate, QUALITY_METRIC_KEYS, qualityScoresSchema, type QualityScores } from './outputs';

const perfect: QualityScores = { garmentShapeIntegrity: 1, printLegibility: 1, colourDifference: 1, handFingerArtefacts: 1, edgeQuality: 1, seamContinuity: 1 };
const worst: QualityScores = { garmentShapeIntegrity: 0, printLegibility: 0, colourDifference: 0, handFingerArtefacts: 0, edgeQuality: 0, seamContinuity: 0 };

describe('qualityScoresSchema', () => {
  it('lists every C7.5 step 9 dimension', () => {
    expect(QUALITY_METRIC_KEYS).toEqual(['garmentShapeIntegrity', 'printLegibility', 'colourDifference', 'handFingerArtefacts', 'edgeQuality', 'seamContinuity']);
  });

  it('takes 0 to 1 for every dimension, nothing extra', () => {
    expect(qualityScoresSchema.safeParse(perfect).success).toBe(true);
    expect(qualityScoresSchema.safeParse(worst).success).toBe(true);
    expect(qualityScoresSchema.safeParse({ ...perfect, garmentShapeIntegrity: 1.01 }).success).toBe(false);
    expect(qualityScoresSchema.safeParse({ ...perfect, garmentShapeIntegrity: -0.01 }).success).toBe(false);
    expect(qualityScoresSchema.safeParse({ ...perfect, extra: 1 }).success).toBe(false);
    const { seamContinuity, ...missing } = perfect;
    expect(qualityScoresSchema.safeParse(missing).success).toBe(false);
  });
});

describe('combinedScorePercent', () => {
  it('is 100 when every dimension is perfect, 0 when every dimension is worst', () => {
    expect(combinedScorePercent(perfect)).toBe(100);
    expect(combinedScorePercent(worst)).toBe(0);
  });

  it('is the plain mean of the six dimensions, as a whole percent', () => {
    expect(combinedScorePercent({ ...worst, garmentShapeIntegrity: 1, printLegibility: 1, colourDifference: 1 })).toBe(50);
  });

  it('rounds rather than truncating', () => {
    // 5/6 = 0.8333… -> 83%, not 83.33 or 84 by a different rule
    expect(combinedScorePercent({ ...perfect, seamContinuity: 0 })).toBe(83);
  });
});

describe('passesQualityThreshold', () => {
  it('a threshold of 0 (as it ships) always passes, even the worst possible score', () => {
    expect(passesQualityThreshold(worst, 0)).toBe(true);
  });

  it('passes at or above the threshold, fails strictly below it', () => {
    const scores = { ...worst, garmentShapeIntegrity: 1, printLegibility: 1, colourDifference: 1, handFingerArtefacts: 1 }; // 4/6 = 67%
    expect(combinedScorePercent(scores)).toBe(67);
    expect(passesQualityThreshold(scores, 67)).toBe(true);
    expect(passesQualityThreshold(scores, 68)).toBe(false);
  });
});

describe('pickBestCandidate', () => {
  it('picks the single highest-scoring candidate', () => {
    const candidates = [
      { index: 0, scores: worst },
      { index: 1, scores: perfect },
    ];
    expect(pickBestCandidate(candidates).index).toBe(1);
  });

  it('a tie keeps the lowest index — deterministic, not arbitrary', () => {
    const candidates = [
      { index: 0, scores: perfect },
      { index: 1, scores: perfect },
    ];
    expect(pickBestCandidate(candidates).index).toBe(0);
  });

  it('a single candidate is trivially the best', () => {
    expect(pickBestCandidate([{ index: 0, scores: worst }]).index).toBe(0);
  });

  it('refuses to pick a best of nothing', () => {
    expect(() => pickBestCandidate([])).toThrow();
  });
});
