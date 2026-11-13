// S15 · PR 341 (Blueprint D5.3, "weekly and monthly digests to Telegram and e-mail") — the digest's pure half:
// which trailing window each kind reads, and turning that window's own events plus each saved funnel's own run into
// one deterministic summary. Nothing here touches a database, Telegram or e-mail — `apps/web/src/lib/analytics/
// digest.ts` is the record-and-send half that calls this. D5.3's own rule stays true of every number produced here:
// "the AI layer... explains but never invents a number" — these come straight off `AnalyticsEvent` rows and
// `computeFunnelResult`, so a later AI commentary step (PR 342+) has nothing of its own to get wrong.
import { ANALYTICS_EVENT_NAMES, type AnalyticsEventName } from './events';
import { computeFunnelResult, type FunnelEventRow, type FunnelResult, type FunnelStepDef } from './funnel';

export type DigestKind = 'weekly' | 'monthly';

/** The trailing window each kind reads — a fixed number of days, not a calendar week/month. The same honest
 *  simplification `funnel.ts`'s `computeFunnelResult` already states for its own default window. */
export const DIGEST_WINDOW_DAYS: Record<DigestKind, number> = { weekly: 7, monthly: 30 }; // hardcode-ok: what "weekly"/"monthly" means, not an owner policy or a business number

const DAY_MS = 86_400_000; // hardcode-ok: a millisecond, not a business number

export interface DigestWindow {
  start: Date;
  end: Date;
}

/** The window a digest of `kind` covers, ending at `end` (exclusive) — and the same-length window right before it,
 *  read for the "vs last period" comparison. */
export function digestWindows(kind: DigestKind, end: Date): { current: DigestWindow; previous: DigestWindow } {
  const days = DIGEST_WINDOW_DAYS[kind];
  const start = new Date(end.getTime() - days * DAY_MS);
  const previous: DigestWindow = { start: new Date(start.getTime() - days * DAY_MS), end: start };
  return { current: { start, end }, previous };
}

export interface DigestEventTotals {
  name: AnalyticsEventName;
  count: number;
  visitors: number;
}

/** Every known event name's count and unique-visitor count, over a set of rows already filtered to one window.
 *  Every name in the catalogue is listed, zero included — the owner sees what did *not* happen too. */
export function summarizeEvents(events: readonly FunnelEventRow[]): DigestEventTotals[] {
  return ANALYTICS_EVENT_NAMES.map((name) => {
    const rows = events.filter((e) => e.name === name);
    return { name, count: rows.length, visitors: new Set(rows.map((r) => r.visitorId)).size };
  });
}

/** The change from `prev` to `curr` as a fraction (0.2 = +20%). `null` when there is nothing to divide by (`prev`
 *  is zero) — reported as the raw current number instead, never as `Infinity`, which JSON cannot hold. */
export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

export interface DigestEventLine extends DigestEventTotals {
  prevCount: number;
  prevVisitors: number;
  changeCount: number | null;
  changeVisitors: number | null;
}

export interface DigestFunnelLine {
  funnelId: string;
  name: string;
  current: FunnelResult;
  previous: FunnelResult;
}

export interface DigestContent {
  kind: DigestKind;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  events: DigestEventLine[];
  funnels: DigestFunnelLine[];
}

export interface DigestFunnelInput {
  id: string;
  name: string;
  steps: readonly FunnelStepDef[];
}

export interface BuildDigestContentInput {
  kind: DigestKind;
  window: { current: DigestWindow; previous: DigestWindow };
  /** Every event of the current window (any name — this function does the per-name split). */
  currentEvents: readonly FunnelEventRow[];
  /** The same for the previous, equal-length window. */
  previousEvents: readonly FunnelEventRow[];
  /** The store's own saved funnels (not archived); each is run against both windows. */
  funnels: readonly DigestFunnelInput[];
}

/** The whole digest: every tracked event's totals this period vs last, and each saved funnel's own run over both
 *  windows. Deterministic — the same inputs always give the same output, nothing random or AI-guessed. */
export function buildDigestContent(input: BuildDigestContentInput): DigestContent {
  const curr = summarizeEvents(input.currentEvents);
  const prev = summarizeEvents(input.previousEvents);
  const events: DigestEventLine[] = curr.map((c, i) => {
    const p = prev[i]!;
    return { ...c, prevCount: p.count, prevVisitors: p.visitors, changeCount: pctChange(c.count, p.count), changeVisitors: pctChange(c.visitors, p.visitors) };
  });
  const funnels: DigestFunnelLine[] = input.funnels.map((f) => ({
    funnelId: f.id,
    name: f.name,
    current: computeFunnelResult(f.steps, input.currentEvents),
    previous: computeFunnelResult(f.steps, input.previousEvents),
  }));
  return {
    kind: input.kind,
    periodStart: input.window.current.start.toISOString(),
    periodEnd: input.window.current.end.toISOString(),
    previousPeriodStart: input.window.previous.start.toISOString(),
    previousPeriodEnd: input.window.previous.end.toISOString(),
    events,
    funnels,
  };
}
