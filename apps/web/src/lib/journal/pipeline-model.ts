// S12 · PR 591 (register "Blog content pipeline"; BLOG-CONTENT-PLAN "3/day for 2 weeks, then 5/day only while quality and
// indexing stay healthy — automatic drop to 3/day otherwise") — the pipeline's arithmetic, without the database: the
// journal's health, the pace of a day, how many days the finished articles cover, which step an article waits for and
// whether it is stuck, and which live article is due a refresh. Numbers come from `blog.pipeline`; days are shop days
// (`YYYY-MM-DD`, the shop's time zone, worked out by the caller).
// The AI writer and proofreader are not here: they wait for S15 (closed, PR 652).
import type { BlogPipelineSettings, BlogScheduleSettings } from '@extas/settings';

const DAY_MS = 86_400_000;

/** Whole days from one shop day to another (`to` − `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Whole days since a moment (never negative). */
export const daysSince = (at: Date, now: Date): number => Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));

export interface HealthInput {
  /** Review steps passed in the window. */
  passes: number;
  /** Articles sent back to writing in the window. */
  backs: number;
  /** Share of live articles Google has indexed (per cent), or null while Search Console's numbers are not there. */
  indexedPct: number | null;
}

export type QualityState = 'ok' | 'low' | 'none';
export type IndexingState = 'ok' | 'low' | 'unknown' | 'skipped';

export interface Health {
  /** Share of review answers that sent an article back (per cent, rounded), null with no answers. */
  backPct: number | null;
  /** `none`: no review answers in the window yet (not counted against health). */
  quality: QualityState;
  indexing: IndexingState;
  healthy: boolean;
}

/** The journal's health: few articles sent back in review and, when asked, Google's indexing known and good enough. */
export function healthOf(h: HealthInput, s: Pick<BlogPipelineSettings, 'maxBackPct' | 'waitForIndexing' | 'minIndexedPct'>): Health {
  const answers = h.passes + h.backs;
  const backPct = answers ? Math.round((h.backs * 100) / answers) : null;
  const quality: QualityState = backPct === null ? 'none' : backPct <= s.maxBackPct ? 'ok' : 'low';
  const indexing: IndexingState = !s.waitForIndexing ? 'skipped' : h.indexedPct === null ? 'unknown' : h.indexedPct >= s.minIndexedPct ? 'ok' : 'low';
  const healthy = quality !== 'low' && (indexing === 'ok' || indexing === 'skipped');
  return { backPct, quality, indexing, healthy };
}

/** Why the day runs at its pace. */
export type PaceReason = 'off' | 'notStarted' | 'starting' | 'full' | 'held';

export interface Pace {
  perDay: number;
  reason: PaceReason;
  /** The first shop day of the full pace (null while nothing is live). */
  fullFrom: string | null;
}

/**
 * The pace of a shop day: off → the calendar's own target; nothing live yet or within `rampDays` of the first live
 * day → `startPerDay`; after it → `fullPerDay` while healthy, else back to `startPerDay` (held). Always within the
 * calendar's perDayMin…perDayMax.
 */
export function paceFor(day: string, firstLive: string | null, health: Pick<Health, 'healthy'>, p: BlogPipelineSettings, sch: Pick<BlogScheduleSettings, 'perDayMin' | 'perDayTarget' | 'perDayMax'>): Pace {
  const clamp = (n: number) => Math.min(sch.perDayMax, Math.max(sch.perDayMin, n));
  if (!p.on) return { perDay: sch.perDayTarget, reason: 'off', fullFrom: null };
  if (!firstLive) return { perDay: clamp(p.startPerDay), reason: 'notStarted', fullFrom: null };
  const fullFrom = addDay(firstLive, p.rampDays);
  if (daysBetween(fullFrom, day) < 0) return { perDay: clamp(p.startPerDay), reason: 'starting', fullFrom };
  return health.healthy ? { perDay: clamp(p.fullPerDay), reason: 'full', fullFrom } : { perDay: clamp(p.startPerDay), reason: 'held', fullFrom };
}

/** A shop day `n` days after another. */
export function addDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface Supply {
  /** Finished (all review steps passed) and scheduled-ahead articles. */
  have: number;
  /** The articles the buffer asks for (`bufferDays` × pace). */
  want: number;
  /** Whole days the articles cover at the pace. */
  days: number;
  /** How many more to finish to fill the buffer (0 when full). */
  short: number;
}

/** How far ahead the finished and scheduled articles carry the journal at the pace. */
export function supplyOf(finished: number, scheduled: number, perDay: number, bufferDays: number): Supply {
  const have = finished + scheduled;
  const want = perDay * bufferDays;
  return { have, want, days: perDay > 0 ? Math.floor(have / perDay) : 0, short: Math.max(0, want - have) };
}

/** The review steps in their order; the writer never passes his own (blog.journal.reviewByAnother). */
export const REVIEW_STEPS = ['proofread', 'facts', 'seo'] as const;
export type ReviewStep = (typeof REVIEW_STEPS)[number];

/** The step an article waits for: an idea or brief waits for its writing, a draft and each passed step for the next one. */
const NEXT: Readonly<Record<string, 'writing' | ReviewStep>> = { IDEA: 'writing', BRIEFED: 'writing', DRAFT: 'proofread', PROOFREAD: 'facts', FACT_CHECKED: 'seo' };
export const nextStep = (status: string): 'writing' | ReviewStep | null => NEXT[status] ?? null;

/**
 * The pipeline's columns, in flow order: topics waiting for a yes, approved topics not started, articles in writing (an
 * idea, a brief or a draft), proofread (waiting for the facts check), facts checked (waiting for the SEO check),
 * finished (all three passed, waiting for a time) and scheduled ahead.
 */
export const FLOW = ['topics', 'approved', 'writing', 'proofread', 'factChecked', 'finished', 'scheduled'] as const;
export type FlowKey = (typeof FLOW)[number];

/** An article waiting `stuckDays` or more in one step. */
export const isStuck = (waitingSince: Date, now: Date, stuckDays: number): boolean => daysSince(waitingSince, now) >= stuckDays;

/** A live article is due a refresh when its words were last changed (or it went live) `refreshDays` or more ago. */
export function refreshDue(post: { publishedAt: Date | null; contentUpdatedAt: Date | null }, now: Date, refreshDays: number): number | null {
  const at = post.contentUpdatedAt ?? post.publishedAt;
  if (!at) return null;
  const age = daysSince(at, now);
  return age >= refreshDays ? age : null;
}
