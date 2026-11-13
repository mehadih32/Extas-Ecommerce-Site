// S28 · PR 662 — the settings card's browser maths equals the package's (@extas/orders workedExample).
import { describe, expect, it } from 'vitest';
import { RISK_COURIER_SCORE_DEFAULT as D } from '@extas/settings';
import { workedExample } from '@extas/orders';
import { example } from './courier-score-math';

describe('PR 662 — courier score card maths', () => {
  it('gives the same score and band as the package', () => {
    for (const v of [
      { success: 86, parcels: 14, returns: 2, worst: 60, couriers: 3, fraud: 0 },
      { success: 40, parcels: 2, returns: 5, worst: 10, couriers: 1, fraud: 3 },
      { success: 99, parcels: 80, returns: 0, worst: 95, couriers: 3, fraud: 0 },
    ]) {
      const a = example(D, v);
      const b = workedExample(D, v);
      expect(a.score).toBe(b.score);
      expect(a.band).toBe(b.band);
      expect(a.rows.map((r) => r.points)).toEqual(b.metrics.map((m) => m.points));
    }
  });
});
