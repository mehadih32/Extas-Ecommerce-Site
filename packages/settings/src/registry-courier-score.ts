// S28 · PR 662 (Admin v5; prototype Rules › Order flow › Courier score) — registry version 296.
//
// - `risk.courierScore`: the courier-record score out of 10 (higher is better). Six checks read from the courier history
//   of a customer's number — the delivery success rate, the parcels taken, the returns, the worst courier's success
//   rate, the couriers that have a record, and the fraud reports other shops filed — each scored 0, 5 or 10 by the
//   owner's two limits ("good" earns 10 points, "ok" earns 5, otherwise 0), weighted, and averaged into one number.
//   `upperScore` and above is a green score, below `lowerScore` is a red one, between them goes to the call list.
//   A check nobody could answer is "unknown": the score is never red because of it — the order goes to the call list.
//   Off as shipped. The score only informs (CLAUDE.md rule 6): it moves no order and no money by itself; PR 663's
//   auto-confirm table reads it.
// - `risk.courierScoreReport`: the score-accuracy report's days and the most orders it reads.
import { z } from 'zod';
import { setting } from './define';

const V662 = 296;

/** The six checks, in the order the prototype shows them. */
export const COURIER_SCORE_METRICS = ['success', 'parcels', 'returns', 'worst', 'couriers', 'fraud'] as const;
export type CourierScoreMetric = (typeof COURIER_SCORE_METRICS)[number];

/** A check where a LOWER number is better (returns, fraud reports); the others score higher when higher. */
export const COURIER_SCORE_LOWER_IS_BETTER: readonly CourierScoreMetric[] = ['returns', 'fraud'];

const metricSchema = z
  .object({
    /** How much this check counts (0 = not counted at all). */
    weight: z.int().min(0).max(100),
    /** A number at least this good (at most this, for a lower-is-better check) earns 10 points. */
    good: z.int().min(0).max(100_000),
    /** A number at least this good earns 5 points; worse earns 0. */
    ok: z.int().min(0).max(100_000),
  })
  .strict();
export type CourierScoreMetricConfig = z.output<typeof metricSchema>;

export const riskCourierScoreSchema = z
  .object({
    /** Off: nothing is scored and PR 663's table never reads a score. */
    enabled: z.boolean(),
    /** A score at or above this is green (0 to 10, steps of 0.5). */
    upperScore: z.number().min(0).max(10).multipleOf(0.5),
    /** A score below this is red; between the two it goes to the call list. */
    lowerScore: z.number().min(0).max(10).multipleOf(0.5),
    success: metricSchema,
    parcels: metricSchema,
    returns: metricSchema,
    worst: metricSchema,
    couriers: metricSchema,
    fraud: metricSchema,
  })
  .strict()
  .refine((v) => v.lowerScore <= v.upperScore, { path: ['lowerScore'], message: 'the red limit must not be above the green limit' })
  .refine((v) => COURIER_SCORE_METRICS.some((k) => v[k].weight > 0), { path: ['success'], message: 'give at least one check a weight' })
  .refine((v) => COURIER_SCORE_METRICS.every((k) => (COURIER_SCORE_LOWER_IS_BETTER.includes(k) ? v[k].good <= v[k].ok : v[k].good >= v[k].ok)), {
    path: ['good'],
    message: 'the 10-point limit must be at least as good as the 5-point limit',
  });
export type RiskCourierScore = z.output<typeof riskCourierScoreSchema>;

// hardcode-ok: shipped defaults of the owner's own editable bands (Rules › Order flow › Courier score); off as shipped.
export const RISK_COURIER_SCORE_DEFAULT: RiskCourierScore = {
  enabled: false,
  upperScore: 7.5,
  lowerScore: 5,
  success: { weight: 30, good: 90, ok: 70 },
  parcels: { weight: 15, good: 10, ok: 3 },
  returns: { weight: 15, good: 1, ok: 3 },
  worst: { weight: 15, good: 80, ok: 50 },
  couriers: { weight: 10, good: 2, ok: 1 },
  fraud: { weight: 15, good: 0, ok: 1 },
};

export const riskCourierScoreReportSchema = z
  .object({
    /** The days the score-accuracy report looks back. */
    days: z.int().min(1).max(365),
    /** The most scored orders one report reads. */
    maxRows: z.int().min(100).max(20_000),
  })
  .strict();
export type RiskCourierScoreReport = z.output<typeof riskCourierScoreReportSchema>;
export const RISK_COURIER_SCORE_REPORT_DEFAULT: RiskCourierScoreReport = { days: 30, maxRows: 5_000 }; // hardcode-ok: shipped defaults, editable

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V662 } as const;

export const courierScoreSettings = {
  'risk.courierScore': setting({
    ...base,
    schema: riskCourierScoreSchema,
    default: RISK_COURIER_SCORE_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.courierScore.label',
    helpKey: 'risk.courierScore.help',
    sortOrder: 345,
  }),
  'risk.courierScoreReport': setting({
    ...base,
    schema: riskCourierScoreReportSchema,
    default: RISK_COURIER_SCORE_REPORT_DEFAULT,
    valueType: 'JSON',
    labelKey: 'risk.courierScoreReport.label',
    helpKey: 'risk.courierScoreReport.help',
    sortOrder: 346,
  }),
};
