// S02 · the Find My Size training engine and product reviews — PR 59 (the chart data, the ease model and the size
// report) and PR 65 (reviews on the product page, moderation, the photo-review reward). Registry version 35. Labels:
// messages/reviews.<lang>.json. No admin screen in this PR (the moderation queue and the size report are built on the
// new 14-section admin shell): the keys live in their sections (Products → Reviews, Products → Size charts) and are
// set through the settings store until those screens land.
//
// CN-018: every number, share and perk here is the owner's, with its limits, and anything that costs money is off with
// no amount at all — the photo-review reward grants nothing until the owner switches it on and types his own figure,
// and then only when a member of staff approves that review. The trained ease never touches a chart: it is proposed,
// the owner activates a version, and the finder uses it only while `useTrainedEase` is on.
import { z } from 'zod';
import { setting } from './define';

const V = 35;

/**
 * PR 59 — the Find My Size training engine (Blueprint D3.7 "ease per fit feeds Find my size", §41.5 "AI proposes the
 * bands from the measurement chart and from past orders and returns, and the owner approves or edits; it learns from
 * exchanges and flags a band that keeps producing 'too tight'").
 *
 * `report`: how far back the answers are read, how many signals a group needs before a proposal is made at all, the
 * share of one-sided signals that flags a chart ("keeps producing too tight"), and the report's page size.
 * `train`: how much of an inch a proposal may move the chart's ease and in what step; how long after an answer an
 * order line may still be the one that answer led to (the link of answer → order line → exchange, follow-up 153);
 * and whether approved reviews that carry a fit, height and weight count as signals too.
 * `useTrainedEase`: **off**. While it is off, Find My Size uses the owner's own chart ease and nothing else; when the
 * owner switches it on, the active model's ease is used for that garment type and fit, and the chart is never changed.
 */
export const sizeAdviceSchema = z
  .object({
    report: z
      .object({
        windowDays: z.int().min(7).max(1_095),
        minAnswers: z.int().min(5).max(10_000),
        /** A one-sided share above this flags the chart for the owner to look at. */
        flagSharePct: z.int().min(5).max(100),
        pageSize: z.int().min(10).max(500),
      })
      .strict(),
    train: z
      .object({
        maxEaseAdjustInch: z.number().min(0).max(4),
        stepInch: z.number().min(0.05).max(1),
        linkWindowHours: z.int().min(1).max(720),
        useReviews: z.boolean(),
      })
      .strict(),
    useTrainedEase: z.boolean(),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: false, version: V } as const;

export const reviewSettings = {
  'catalogue.sizeAdvice': setting({
    ...json,
    group: 'catalogue',
    schema: sizeAdviceSchema,
    default: {
      report: { windowDays: 180, minAnswers: 20, flagSharePct: 25, pageSize: 50 },
      train: { maxEaseAdjustInch: 1, stepInch: 0.25, linkWindowHours: 72, useReviews: true },
      useTrainedEase: false,
    },
    labelKey: 'catalogue.sizeAdvice.label',
    helpKey: 'catalogue.sizeAdvice.help',
    sortOrder: 970,
  }),
};

export type SizeAdviceSettings = z.output<typeof sizeAdviceSchema>;
