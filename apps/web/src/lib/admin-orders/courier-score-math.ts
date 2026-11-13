// S28 · PR 662 — the courier score's worked example for the settings card, in the browser (no database): the same maths as
// @extas/orders `scoreCourier` for known figures (a test keeps the two equal). The card imports this, never the package.
export const SCORE_METRICS = ['success', 'parcels', 'returns', 'worst', 'couriers', 'fraud'] as const;
export type ScoreMetric = (typeof SCORE_METRICS)[number];
export const LOWER_IS_BETTER: readonly ScoreMetric[] = ['returns', 'fraud'];
export interface MetricCfg {
  weight: number;
  good: number;
  ok: number;
}
export type ScoreCfg = { enabled: boolean; upperScore: number; lowerScore: number } & Record<ScoreMetric, MetricCfg>;

export const pointsFor = (k: ScoreMetric, x: number, c: MetricCfg): 0 | 5 | 10 => (LOWER_IS_BETTER.includes(k) ? (x <= c.good ? 10 : x <= c.ok ? 5 : 0) : x >= c.good ? 10 : x >= c.ok ? 5 : 0);

export function example(cfg: ScoreCfg, vals: Record<ScoreMetric, number>) {
  const W = SCORE_METRICS.reduce((a, k) => a + cfg[k].weight, 0) || 1;
  const rows = SCORE_METRICS.map((k) => ({ key: k, value: vals[k], points: pointsFor(k, vals[k], cfg[k]), weightPct: Math.round((cfg[k].weight / W) * 100) }));
  const score = Math.round((rows.reduce((a, r) => a + r.points * cfg[r.key].weight, 0) / W) * 10) / 10;
  const band = score >= cfg.upperScore ? 'auto' : score >= cfg.lowerScore ? 'call' : 'person';
  return { rows, score, band } as const;
}
