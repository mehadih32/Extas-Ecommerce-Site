// S12 · PR 591 (register "Blog content pipeline"; BLOG-CONTENT-PLAN "3/day for 2 weeks, then 5/day only while quality and
// indexing stay healthy — automatic drop to 3/day otherwise; an empty slot is never filled with a weak post") — registry
// version 254, lane C. The non-AI half of the pipeline: the pace, the queue and the health that sets the pace. The AI
// writer and AI proofreader (Doot and the author agents, PR 593) wait for S15, which is closed (PR 652).
//   `blog.pipeline` — off as it ships: the calendar keeps `blog.schedule.perDayTarget` as before. On:
//   - The pace of a day: `startPerDay` a day for the first `rampDays` shop days from the day the first article went
//     live, then `fullPerDay` — but only while the journal is healthy; otherwise it drops back to `startPerDay` by
//     itself, and rises again when health returns. The calendar's "Fill the free times" stops at the pace (always
//     inside `blog.schedule` perDayMin…perDayMax), and an empty time is still never filled with an unfinished article.
//   - Healthy: of the review answers of the last `healthDays` days, at most `maxBackPct` % sent an article back; and,
//     with `waitForIndexing` on, at least `minIndexedPct` % of the live articles indexed by Google. Until Search
//     Console's numbers arrive (its own PR) indexing is unknown, so with `waitForIndexing` on the pace stays at the
//     start — the safe side.
//   - The queue: finished and scheduled articles should cover `bufferDays` days at the pace (else "write next"), an
//     article waiting in one review step `stuckDays` days or more is flagged, and a live article not edited for
//     `refreshDays` days joins the refresh list.
import { z } from 'zod';
import { setting } from './define';

const V254 = 254;

export const blogPipelineSchema = z
  .object({
    /** The pipeline sets the calendar's pace (and shows its health). */
    on: z.boolean(),
    /** Articles a day while starting, and whenever the journal is not healthy. */
    startPerDay: z.int().min(1).max(24),
    /** Articles a day after the start, while the journal is healthy. */
    fullPerDay: z.int().min(1).max(24),
    /** The start lasts this many shop days from the first live article. */
    rampDays: z.int().min(0).max(365),
    /** Health looks back this many days. */
    healthDays: z.int().min(1).max(90),
    /** Healthy while at most this share (per cent) of review answers sent an article back. */
    maxBackPct: z.int().min(0).max(100),
    /** Healthy only with Google's indexing known and good enough. */
    waitForIndexing: z.boolean(),
    /** … at least this share (per cent) of live articles indexed. */
    minIndexedPct: z.int().min(0).max(100),
    /** Finished and scheduled articles should cover this many days at the pace. */
    bufferDays: z.int().min(1).max(30),
    /** An article waiting this many days in one step is flagged. */
    stuckDays: z.int().min(1).max(60),
    /** A live article not edited for this many days joins the refresh list. */
    refreshDays: z.int().min(30).max(1095),
  })
  .strict()
  .refine((v) => v.startPerDay <= v.fullPerDay, { path: ['fullPerDay'] });
export type BlogPipelineSettings = z.output<typeof blogPipelineSchema>;

export const BLOG_PIPELINE_DEFAULT: BlogPipelineSettings = {
  on: false,
  startPerDay: 3,
  fullPerDay: 5,
  rampDays: 14,
  healthDays: 14,
  maxBackPct: 30,
  waitForIndexing: true,
  minIndexedPct: 70,
  bufferDays: 3,
  stuckDays: 3,
  refreshDays: 180,
};

export const blogPipelineSettings = {
  'blog.pipeline': setting({
    scope: 'store',
    schema: blogPipelineSchema,
    default: BLOG_PIPELINE_DEFAULT,
    valueType: 'JSON',
    group: 'blog',
    labelKey: 'blog.pipeline.label',
    helpKey: 'blog.pipeline.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 65,
    version: V254,
  }),
};
