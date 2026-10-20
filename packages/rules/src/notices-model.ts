// PR 216 — notices and the pop-up builder, with placement and timing. A notice is a bar (the announcement bar), a
// banner or an inline note on chosen pages, or a pop-up. The standing rules (Blueprint B6.3, C11.5, D1 "entry popups
// stay banned"):
//   - never a pop-up on arrival: a pop-up opens on time (at least `notices.popup.minDelaySeconds`), on scroll (at least
//     `notices.popup.minScrollPercent` of the page), when the visitor is leaving, or when he taps something;
//   - a phone visitor who came from a search engine never gets one on the first screen;
//   - every pop-up has a frequency cap (per visit, day, week or ever) and the visit-wide cap holds on top;
//   - it closes with ✕, a tap outside or Esc (the component, components/rules/RulePopup.tsx).
// A notice's text can quote rules by token (`{exchange.windowHours}`), so it never needs a number written by hand.
//
// Pure module: the timer at the end is the pause/resume logic the pop-up uses (a timed pop-up counts only while the
// page is visible; every pause has a tested resume — lessons file, R13).
import { z } from 'zod';
import { keySchema, ruleKeySchema } from './model';

export const NOTICE_KINDS = ['bar', 'banner', 'inline', 'popup'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export const TRIGGERS = ['time', 'scroll', 'exit', 'click'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const CAP_PERIODS = ['visit', 'day', 'week', 'ever'] as const;

export const placementSchema = z
  .object({
    /** Placement keys (rules.placements), or `all`. */
    pages: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(30),
    position: z.enum(['top', 'bottom', 'inline']).optional(),
  })
  .strict();
export type NoticePlacement = z.output<typeof placementSchema>;

export const timingSchema = z
  .object({
    trigger: z.enum(TRIGGERS),
    delaySeconds: z.int().min(0).max(3600).optional(),
    scrollPercent: z.int().min(0).max(100).optional(),
    /** For `click`: the element's data-notice-open value. */
    clickKey: keySchema.optional(),
  })
  .strict();
export type NoticeTiming = z.output<typeof timingSchema>;

export const capSchema = z.object({ per: z.enum(CAP_PERIODS), times: z.int().min(1).max(20) }).strict();
export type FrequencyCap = z.output<typeof capSchema>;

export const ctaSchema = z
  .object({
    labelEn: z.string().trim().min(1).max(40),
    labelBn: z.string().trim().max(40).optional(),
    /** A path inside the shop (never another site). */
    href: z.string().regex(/^\/(?!\/)[^\s]*$/, { message: 'a path inside the shop, starting with /' }).max(300),
  })
  .strict();

export const noticeInputSchema = z
  .object({
    key: ruleKeySchema,
    kind: z.enum(NOTICE_KINDS),
    nameEn: z.string().trim().min(1).max(120),
    nameBn: z.string().trim().max(120).optional(),
    titleEn: z.string().trim().max(120).optional(),
    titleBn: z.string().trim().max(120).optional(),
    contentEn: z.string().trim().min(1).max(600),
    contentBn: z.string().trim().max(600).optional(),
    cta: ctaSchema.nullable().optional(),
    placement: placementSchema,
    timing: timingSchema.nullable().optional(),
    frequencyCap: capSchema.nullable().optional(),
    ruleId: z.uuid().nullable().optional(),
    priority: z.int().min(-1000).max(1000).optional(),
    startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();
export type NoticeInput = z.input<typeof noticeInputSchema>;

export type NoticeIssueCode = 'ARRIVAL_POPUP' | 'DELAY_TOO_SHORT' | 'SCROLL_TOO_SHORT' | 'NO_CAP' | 'NO_TRIGGER' | 'TIMING_NOT_FOR_KIND' | 'BAD_WINDOW' | 'UNKNOWN_PLACEMENT' | 'CLICK_KEY_MISSING';

export interface NoticeLimits {
  minDelaySeconds: number;
  minScrollPercent: number;
  placements: readonly string[];
}

/** Every reason a notice cannot be switched on. */
export function checkNotice(n: z.output<typeof noticeInputSchema>, limits: NoticeLimits): NoticeIssueCode[] {
  const out: NoticeIssueCode[] = [];
  if (n.kind === 'popup') {
    const t = n.timing;
    if (!t) out.push('NO_TRIGGER');
    else {
      if (t.trigger === 'time') {
        if (!t.delaySeconds) out.push('ARRIVAL_POPUP');
        else if (t.delaySeconds < limits.minDelaySeconds) out.push('DELAY_TOO_SHORT');
      }
      if (t.trigger === 'scroll' && (t.scrollPercent ?? 0) < limits.minScrollPercent) out.push((t.scrollPercent ?? 0) === 0 ? 'ARRIVAL_POPUP' : 'SCROLL_TOO_SHORT');
      if (t.trigger === 'click' && !t.clickKey) out.push('CLICK_KEY_MISSING');
    }
    if (!n.frequencyCap) out.push('NO_CAP');
  } else if (n.timing) out.push('TIMING_NOT_FOR_KIND');
  if (n.startsAt && n.endsAt && Date.parse(n.endsAt) <= Date.parse(n.startsAt)) out.push('BAD_WINDOW');
  for (const p of n.placement.pages) if (p !== 'all' && !limits.placements.includes(p)) out.push('UNKNOWN_PLACEMENT');
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------------------------
// May this visitor see it now? (the storefront component asks; the server already filtered live notices per page)
// ---------------------------------------------------------------------------------------------------------------

export interface SeenRecord {
  /** Times shown, each an ISO time (newest last). */
  shown: string[];
  /** Shown in this visit. */
  thisVisit: number;
}

export interface ShowContext {
  now: Date;
  isPhone: boolean;
  /** The visit started from a search engine (document.referrer host matches notices.popup.searchHosts). */
  fromSearch: boolean;
  /** The visitor is still on the first screen (has not scrolled a screen yet). */
  firstScreen: boolean;
  /** Pop-ups shown in this visit, any notice. */
  popupsThisVisit: number;
  maxPerVisit: number;
}

const PERIOD_MS = { day: 86_400_000, week: 7 * 86_400_000 } as const;

export function capAllows(cap: FrequencyCap | null | undefined, seen: SeenRecord, now: Date): boolean {
  if (!cap) return true;
  if (cap.per === 'visit') return seen.thisVisit < cap.times;
  if (cap.per === 'ever') return seen.shown.length < cap.times;
  const since = now.getTime() - PERIOD_MS[cap.per];
  return seen.shown.filter((s) => Date.parse(s) > since).length < cap.times;
}

export type ShowVerdict = 'show' | 'capped' | 'visit-cap' | 'search-first-screen';

export function popupVerdict(cap: FrequencyCap | null | undefined, seen: SeenRecord, c: ShowContext): ShowVerdict {
  if (c.popupsThisVisit >= c.maxPerVisit) return 'visit-cap';
  if (c.isPhone && c.fromSearch && c.firstScreen) return 'search-first-screen';
  return capAllows(cap, seen, c.now) ? 'show' : 'capped';
}

/** Is the referrer a search engine? (host starts with, or contains ".", one of the listed starts) */
export function isSearchReferrer(referrer: string, hosts: readonly string[]): boolean {
  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((h) => host.startsWith(h) || host.includes(`.${h}`));
}

// ---------------------------------------------------------------------------------------------------------------
// The visible-time timer: pauses while the page is hidden, resumes when it shows again
// ---------------------------------------------------------------------------------------------------------------

export interface VisibleTimer {
  /** Milliseconds still to wait. */
  left: number;
  /** When the current visible stretch began; null = paused. */
  runningSince: number | null;
}

export const startTimer = (ms: number, at: number, visible: boolean): VisibleTimer => ({ left: ms, runningSince: visible ? at : null });

export function pauseTimer(t: VisibleTimer, at: number): VisibleTimer {
  if (t.runningSince === null) return t;
  return { left: Math.max(0, t.left - (at - t.runningSince)), runningSince: null };
}

export function resumeTimer(t: VisibleTimer, at: number): VisibleTimer {
  return t.runningSince === null ? { left: t.left, runningSince: at } : t;
}

/** Milliseconds until it fires; Infinity while paused. */
export function timerRemaining(t: VisibleTimer, at: number): number {
  return t.runningSince === null ? Infinity : Math.max(0, t.left - (at - t.runningSince));
}
