// S24 · PR 462 — pure tests: the pilot cohort check, the deterministic bucket, and the two-proportion confidence
// math (C7.19's "A/B test on-model vs flat-lay … measuring add-to-bag, conversion and return rate"). No DB.
import { describe, expect, it } from 'vitest';
import { bucketStyleVariant, isPilotProduct, STYLE_VARIANTS, twoProportionVerdict, type PilotCohort } from './styleAbTest';

const PRODUCT = '11111111-1111-1111-1111-111111111111';
const OTHER_PRODUCT = '22222222-2222-2222-2222-222222222222';

describe('isPilotProduct', () => {
  it('is false for an empty cohort — the pilot off, as it ships (CN-018)', () => {
    const cohort: PilotCohort = { productIds: [], splitPercent: 50 };
    expect(isPilotProduct(cohort, PRODUCT)).toBe(false);
  });

  it('is true only for a product actually listed', () => {
    const cohort: PilotCohort = { productIds: [PRODUCT], splitPercent: 50 };
    expect(isPilotProduct(cohort, PRODUCT)).toBe(true);
    expect(isPilotProduct(cohort, OTHER_PRODUCT)).toBe(false);
  });
});

describe('bucketStyleVariant', () => {
  it('only ever answers one of the two style variants', () => {
    for (let i = 0; i < 50; i++) expect(STYLE_VARIANTS).toContain(bucketStyleVariant(PRODUCT, `visitor-${i}`, 50));
  });

  it('is deterministic: the same product+visitor always lands on the same side', () => {
    const a = bucketStyleVariant(PRODUCT, 'visitor-1', 50);
    for (let i = 0; i < 10; i++) expect(bucketStyleVariant(PRODUCT, 'visitor-1', 50)).toBe(a);
  });

  it('a different visitor, or a different product, can land on the other side', () => {
    const variants = new Set(Array.from({ length: 200 }, (_, i) => bucketStyleVariant(PRODUCT, `v${i}`, 50)));
    expect(variants.size).toBe(2); // with 200 draws at a 50/50 split, both sides are certain to appear
  });

  it('never throws at the split edges (1% / 99%, the setting’s own min/max)', () => {
    for (let i = 0; i < 20; i++) {
      expect(STYLE_VARIANTS).toContain(bucketStyleVariant(PRODUCT, `v${i}`, 1));
      expect(STYLE_VARIANTS).toContain(bucketStyleVariant(PRODUCT, `v${i}`, 99));
    }
  });

  it('roughly matches the configured split over many visitors (within a generous tolerance)', () => {
    const n = 2000;
    let onModel = 0;
    for (let i = 0; i < n; i++) if (bucketStyleVariant(PRODUCT, `visitor-${i}`, 30) === 'ON_MODEL') onModel++;
    expect(onModel / n).toBeGreaterThan(0.22);
    expect(onModel / n).toBeLessThan(0.38);
  });
});

describe('twoProportionVerdict', () => {
  it('is null/not-enough before either side has minVisitors', () => {
    const v = twoProportionVerdict({ n: 5, c: 1 }, { n: 5, c: 1 }, 100);
    expect(v.enough).toBe(false);
    expect(v.confidence).toBeNull();
  });

  it('a real, consistent gap with plenty of visitors reads as high confidence', () => {
    const v = twoProportionVerdict({ n: 1000, c: 300 }, { n: 1000, c: 200 }, 100);
    expect(v.enough).toBe(true);
    expect(v.rateOnModel).toBeCloseTo(0.3);
    expect(v.rateFlatLay).toBeCloseTo(0.2);
    expect(v.lift).toBeCloseTo(0.5); // 50% higher
    expect(v.confidence!).toBeGreaterThan(0.95);
  });

  it('identical rates give zero lift and low confidence', () => {
    const v = twoProportionVerdict({ n: 500, c: 100 }, { n: 500, c: 100 }, 100);
    expect(v.lift).toBe(0);
    expect(v.confidence).toBeCloseTo(0, 5);
  });

  it('null rate for flat-lay (no visitors at all) gives a null lift, never a division by zero', () => {
    const v = twoProportionVerdict({ n: 10, c: 1 }, { n: 0, c: 0 }, 0);
    expect(v.rateFlatLay).toBeNull();
    expect(v.lift).toBeNull();
  });

  it('carries no "winner" field — a lower rate (returns) and a higher rate (add-to-bag) are both just numbers here', () => {
    const v = twoProportionVerdict({ n: 500, c: 10 }, { n: 500, c: 40 }, 100); // on-model returns LESS — good news, same shape
    expect(v).not.toHaveProperty('winner');
    expect(v.lift!).toBeLessThan(0);
  });
});
