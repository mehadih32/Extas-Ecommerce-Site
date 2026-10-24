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
/** The product page's own block: read by the page itself, so it may be public like the other `pdp.*` keys. */
const pdpJson = { ...json, group: 'productPage', isPublic: true } as const;

/**
 * PR 65 — the reviews block on the product page (demo 30-product.js `pdp_reviewsSection`): the summary box with the
 * average, the stars and the count, and the cards in a sliding row, the ones with a photo first (a buyer photo is the
 * most persuasive thing on the page, so it must not sit last). `max` is how many cards the row carries — the owner's
 * number, three in the demo. Every part is a switch, because a card may only ever show what its review really carries.
 */
export const pdpReviewsSchema = z
  .object({
    on: z.boolean(),
    max: z.int().min(1).max(12),
    /** The reviews with a photo come first in the row. */
    photosFirst: z.boolean(),
    /** The summary box beside the row (the average, the stars, how many). */
    summary: z.boolean(),
    /** The line under the product title ("4.8 · 12 reviews") that jumps to this block. */
    ratingLine: z.boolean(),
    /** The reviewer's own height · weight · "bought L" line, from what his review carries and nothing else. */
    bodyLine: z.boolean(),
    /** The "Verified buyer" tag on a review that came from an order. */
    verifiedTag: z.boolean(),
    /** The buyer's photo on the card. */
    photos: z.boolean(),
    /** "Questions?" in the heading, down to the questions block. */
    questionsLink: z.boolean(),
    /** How slowly the row slides on its own (the one slider engine's speed for this row). */
    speed: z.int().min(5).max(60),
  })
  .strict();

/**
 * PR 65 — who may write a review and what he is asked (SIM-F-008: only buyers, from My account after delivery, and
 * every review waits for the shop's check). `onlyDelivered` off would let a buyer review a parcel he has not received
 * yet; it ships on. `withinDays` 0 means no time limit. The fit, height and weight are asked because PR 59's size
 * learning reads them (`catalogue.sizeAdvice.train.useReviews`) and T3's fit bar needs them (follow-up 151).
 */
export const reviewSubmitSchema = z
  .object({
    enabled: z.boolean(),
    /** Only a line of an order that reached DELIVERED can be reviewed. */
    onlyDelivered: z.boolean(),
    /** Up to this many days after delivery (0: no limit). */
    withinDays: z.int().min(0).max(1_095),
    /** The longest review text, in letters. */
    bodyMax: z.int().min(80).max(5_000),
    /** Ask how the size felt (too small · just right · too big). */
    askFit: z.boolean(),
    /** Ask his height and weight (never shown unless he gives them). */
    askBody: z.boolean(),
    /** His photo of the garment. */
    photos: z
      .object({
        enabled: z.boolean(),
        max: z.int().min(1).max(5),
        maxMb: z.int().min(1).max(20),
      })
      .strict(),
  })
  .strict();

/**
 * PR 65 — the shop's check before a review is published, and the shop's own reviews (D3.16: the reviews the owner
 * enters by hand count; a hidden or waiting review is in no average and in no search-engine rating).
 */
export const reviewModerationSchema = z
  .object({
    /** How many reviews one page of the moderation list carries. */
    pageSize: z.int().min(10).max(200),
    /** A second review of the same order line is refused. */
    oneReviewPerLine: z.boolean(),
    /** A review from an order carries the verified-buyer mark by itself. */
    verifyFromOrder: z.boolean(),
  })
  .strict();

/**
 * PR 65 (CN-018, SIM-F-008) — the photo-review perk. **Off, with no amount at all:** nothing is ever credited until
 * the owner switches it on and types his own figure, and then only when a member of staff approves that review. The
 * money goes to the customer's wallet as one ledger entry, once per review (never twice, never by itself).
 */
export const reviewPhotoRewardSchema = z
  .object({
    enabled: z.boolean(),
    /** What one approved photo review is worth, in poisha. Null: the owner has set no amount, so nothing is given. */
    amountMinor: z.int().min(0).max(1_000_000).nullable(),
    /** The smallest number of stars that earns it. */
    minRating: z.int().min(1).max(5),
    /** At most one reward per order, however many of its lines are reviewed. */
    onePerOrder: z.boolean(),
    /** Say on the review form what an approved photo review is worth (only while it is on with an amount). */
    showOnForm: z.boolean(),
  })
  .strict();

export const reviewSettings = {
  'pdp.reviews': setting({
    ...pdpJson,
    schema: pdpReviewsSchema,
    // the demo's own block: three cards, photos first, the summary box and the rating line under the title
    default: { on: true, max: 3, photosFirst: true, summary: true, ratingLine: true, bodyLine: true, verifiedTag: true, photos: true, questionsLink: true, speed: 20 },
    labelKey: 'pdp.reviews.label',
    helpKey: 'pdp.reviews.help',
    sortOrder: 135,
  }),
  'reviews.submit': setting({
    ...json,
    group: 'reviews',
    schema: reviewSubmitSchema,
    default: { enabled: true, onlyDelivered: true, withinDays: 90, bodyMax: 1_200, askFit: true, askBody: true, photos: { enabled: true, max: 1, maxMb: 8 } },
    labelKey: 'reviews.submit.label',
    helpKey: 'reviews.submit.help',
    sortOrder: 10,
  }),
  'reviews.moderation': setting({
    ...json,
    group: 'reviews',
    schema: reviewModerationSchema,
    default: { pageSize: 50, oneReviewPerLine: true, verifyFromOrder: true },
    labelKey: 'reviews.moderation.label',
    helpKey: 'reviews.moderation.help',
    sortOrder: 20,
  }),
  'reviews.photoReward': setting({
    ...json,
    group: 'reviews',
    schema: reviewPhotoRewardSchema,
    // off, and with no amount: the owner's own decision, and his own figure (CLAUDE.md rule 6, CN-018)
    default: { enabled: false, amountMinor: null, minRating: 4, onePerOrder: true, showOnForm: true },
    labelKey: 'reviews.photoReward.label',
    helpKey: 'reviews.photoReward.help',
    sortOrder: 30,
  }),
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
export type PdpReviewsSettings = z.output<typeof pdpReviewsSchema>;
export type ReviewSubmitSettings = z.output<typeof reviewSubmitSchema>;
export type ReviewModerationSettings = z.output<typeof reviewModerationSchema>;
export type ReviewPhotoRewardSettings = z.output<typeof reviewPhotoRewardSchema>;
