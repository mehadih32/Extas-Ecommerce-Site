// S28 · PR 662 — the courier score out of 10: points by the owner's two limits, the weighted average, "unknown is never
// red", the bands, and the worked example (pure; no database).
import { describe, expect, it } from 'vitest';
import { RISK_COURIER_SCORE_DEFAULT as D, riskCourierScoreSchema } from '@extas/settings';
import { pointsOf, scoreBand, scoreCourier, workedExample, type CourierScoreFacts } from './courier-score';

const NOW = new Date('2026-11-13T10:00:00Z');
const at = (min: number) => new Date(NOW.getTime() - min * 60_000);

describe('PR 662 — points and bands', () => {
  it('higher-is-better checks: good earns 10, ok earns 5, else 0', () => {
    expect(pointsOf('success', 90, 90, 70)).toBe(10);
    expect(pointsOf('success', 75, 90, 70)).toBe(5);
    expect(pointsOf('success', 69, 90, 70)).toBe(0);
  });
  it('lower-is-better checks (returns, fraud) flip', () => {
    expect(pointsOf('returns', 1, 1, 3)).toBe(10);
    expect(pointsOf('returns', 3, 1, 3)).toBe(5);
    expect(pointsOf('returns', 4, 1, 3)).toBe(0);
    expect(pointsOf('fraud', 0, 0, 1)).toBe(10);
  });
  it('bands follow the owner limits', () => {
    expect(scoreBand(7.5, D)).toBe('auto');
    expect(scoreBand(7.4, D)).toBe('call');
    expect(scoreBand(5, D)).toBe('call');
    expect(scoreBand(4.9, D)).toBe('person');
  });
});

describe('PR 662 — the score', () => {
  const facts = (over: Partial<CourierScoreFacts> = {}): CourierScoreFacts => ({
    couriers: [
      { provider: 'steadfast', delivered: 10, cancelled: 1, fraudReports: 0, checkedAt: at(35) },
      { provider: 'pathao', delivered: 8, cancelled: 1, fraudReports: 0, checkedAt: at(120) },
    ],
    own: null,
    ...over,
  });
  it('a clean record is green with every check known, its source and age', () => {
    const r = scoreCourier(facts(), D, NOW);
    expect(r.score).toBe(9.3);
    expect(r.band).toBe('auto');
    expect(r.partial).toBe(false);
    const parcels = r.metrics.find((m) => m.key === 'parcels')!;
    expect(parcels.value).toBe(20);
    expect(parcels.sources).toEqual(['steadfast', 'pathao']);
    expect(parcels.ageMinutes).toBe(35);
    expect(r.reason.key).toBe('green');
  });
  it('an unknown check is never red: the order goes to the call list', () => {
    const r = scoreCourier(facts({ couriers: [{ provider: 'steadfast', delivered: 1, cancelled: 5, fraudReports: null, checkedAt: at(5) }] }), D, NOW);
    expect(r.metrics.find((m) => m.key === 'fraud')!.points).toBeNull();
    expect(r.partial).toBe(true);
    expect(r.band).toBe('call');
    expect(r.reason.key).toBe('unknownChecks');
  });
  it('a clean score with an unknown check is not green either', () => {
    const r = scoreCourier(facts({ couriers: [{ provider: 'steadfast', delivered: 30, cancelled: 0, fraudReports: null, checkedAt: at(5) }] }), D, NOW);
    expect(r.score).toBeGreaterThanOrEqual(D.upperScore);
    expect(r.band).toBe('call');
  });
  it('a weak record with every check known is red', () => {
    const r = scoreCourier(
      facts({
        couriers: [
          { provider: 'steadfast', delivered: 1, cancelled: 9, fraudReports: 3, checkedAt: at(5) },
          { provider: 'pathao', delivered: 0, cancelled: 2, fraudReports: 0, checkedAt: at(5) },
        ],
      }),
      { ...D, couriers: { ...D.couriers, weight: 0 } },
      NOW,
    );
    expect(r.partial).toBe(false);
    expect(r.band).toBe('person');
  });
  it('nothing known anywhere: no score, call list, never red', () => {
    const r = scoreCourier({ couriers: [], own: null }, D, NOW);
    expect(r).toMatchObject({ score: null, band: 'call', partial: true });
    expect(r.reason.key).toBe('noRecord');
  });
  it('with no courier answer our own orders give the rates, the courier-only checks stay unknown', () => {
    const r = scoreCourier({ couriers: [], own: { delivered: 9, refused: 1 } }, D, NOW);
    expect(r.metrics.find((m) => m.key === 'success')).toMatchObject({ value: 90, sources: ['own'], ageMinutes: null });
    expect(r.metrics.find((m) => m.key === 'worst')!.value).toBeNull();
    expect(r.band).toBe('call');
  });
  it('a weight of 0 leaves a check out entirely (unknown there does not matter)', () => {
    const cfg = { ...D, fraud: { ...D.fraud, weight: 0 }, worst: { ...D.worst, weight: 0 }, couriers: { ...D.couriers, weight: 0 } };
    const r = scoreCourier({ couriers: [], own: { delivered: 20, refused: 0 } }, cfg, NOW);
    expect(r.partial).toBe(false);
    expect(r.band).toBe('auto');
  });
});

describe('PR 662 — the worked example and the setting', () => {
  it('matches the prototype example: 86% / 14 parcels / 2 returns / worst 60 / 3 couriers / 0 fraud', () => {
    const w = workedExample(D, { success: 86, parcels: 14, returns: 2, worst: 60, couriers: 3, fraud: 0 });
    expect(w.metrics.map((m) => m.points)).toEqual([5, 10, 5, 5, 10, 10]);
    expect(w.score).toBe(7);
    expect(w.band).toBe('call');
  });
  it('is off as shipped and refuses a red limit above the green one, no weights, or a reversed point limit', () => {
    expect(D.enabled).toBe(false);
    expect(riskCourierScoreSchema.safeParse(D).success).toBe(true);
    expect(riskCourierScoreSchema.safeParse({ ...D, lowerScore: 8 }).success).toBe(false);
    const zero = { ...D };
    for (const k of ['success', 'parcels', 'returns', 'worst', 'couriers', 'fraud'] as const) zero[k] = { ...D[k], weight: 0 };
    expect(riskCourierScoreSchema.safeParse(zero).success).toBe(false);
    expect(riskCourierScoreSchema.safeParse({ ...D, success: { weight: 30, good: 60, ok: 70 } }).success).toBe(false);
    expect(riskCourierScoreSchema.safeParse({ ...D, extra: 1 }).success).toBe(false);
  });
});
