// S12 · PR 530 (register "Seasonal page lifecycle — archived and live are states, never deletion. A seasonal page
// returns on its own when the occasion comes round"; Blueprint answer 15) — the yearly return's arithmetic, pure (the
// admin page, the shop's read and the tests share it). Everything is in shop days (`YYYY-MM-DD`, `store.timeZone`).
//
// - An occasion's dates are the owner's own (`marketing.seasonalReturn.dates`): this year's (Eid, Puja move) or "every
//   year" (the same month and day each year, a season such as winter; a last day earlier in the year than the first
//   falls in the next year). With no dates an occasion never comes back.
// - A page's return window is its occasion's dates widened by `leadDays` before and `afterDays` after.
// - A page comes back (the shop shows it live) only while the switch is on, the page has "comes back each year" ticked,
//   it was live once and is taken down — never a draft that was never live, never a page put away (archived) — has
//   nothing missing (its collection and journal category while those parts are on), and today is inside a window.
//   Nothing is written: the page's own state stays as the owner left it, so turning the switch off takes it back at once.
import type { SeasonalReturnSettings } from '@extas/settings';
import { addDays } from '../journal/schedule-model';

export interface SeasonSpan {
  /** The first shop day the page is back (the occasion's first day less `leadDays`). */
  from: string;
  /** The last shop day it is back (the occasion's last day plus `afterDays`). */
  to: string;
  /** The occasion's own first and last day. */
  occasionFrom: string;
  occasionTo: string;
}

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** `YYYY-MM-DD` of a month-day in a year (29 February is the 28th in a common year). */
const dayIn = (y: number, md: string) => `${y}-${md === '02-29' && !leap(y) ? '02-28' : md}`;

/** The occasion's own spans around `today` (last year's, this year's and next year's for a yearly row). */
export function occasionSpans(occasion: string, set: Pick<SeasonalReturnSettings, 'dates'>, today: string): { from: string; to: string }[] {
  const y = Number(today.slice(0, 4));
  const out: { from: string; to: string }[] = [];
  for (const d of set.dates) {
    if (d.occasion !== occasion) continue;
    if (!d.yearly) {
      if (d.to >= d.from) out.push({ from: d.from, to: d.to });
      continue;
    }
    const fm = d.from.slice(5);
    const tm = d.to.slice(5);
    for (const yy of [y - 1, y, y + 1]) out.push({ from: dayIn(yy, fm), to: dayIn(tm >= fm ? yy : yy + 1, tm) });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** The occasion's return windows around `today`, widened by `leadDays` and `afterDays`, earliest first. */
export function returnSpans(occasion: string | null, set: Pick<SeasonalReturnSettings, 'dates' | 'leadDays' | 'afterDays'>, today: string): SeasonSpan[] {
  if (!occasion) return [];
  return occasionSpans(occasion, set, today).map((s) => ({ from: addDays(s.from, -set.leadDays), to: addDays(s.to, set.afterDays), occasionFrom: s.from, occasionTo: s.to }));
}

/** The window `today` is inside (the one ending last when two overlap), else null. */
export function spanNow(occasion: string | null, set: Pick<SeasonalReturnSettings, 'dates' | 'leadDays' | 'afterDays'>, today: string): SeasonSpan | null {
  const inside = returnSpans(occasion, set, today).filter((s) => s.from <= today && today <= s.to);
  return inside.length ? inside.reduce((a, b) => (b.to > a.to ? b : a)) : null;
}

/** The next window that starts after `today`, else null. */
export function nextSpan(occasion: string | null, set: Pick<SeasonalReturnSettings, 'dates' | 'leadDays' | 'afterDays'>, today: string): SeasonSpan | null {
  return returnSpans(occasion, set, today).find((s) => s.from > today) ?? null;
}

/** A page as far as its return goes. */
export interface ReturnPage {
  status: string;
  archivedAt: Date | null;
  publishedAt: Date | null;
  occasion: string | null;
  /** "Comes back each year" ticked. */
  returns: boolean;
  /** Nothing missing to be live (seasonal-model `publishIssues` empty). */
  ready: boolean;
}

/**
 * Where a page stands with its yearly return:
 * - `live` — live by a person's press (the return leaves it alone);
 * - `archived` — put away: it never comes back by itself (restore it first);
 * - `neverLive` — a draft never live: make it live once by hand;
 * - `notTicked` — "comes back each year" is not ticked;
 * - `notReady` — its collection or journal category is missing;
 * - `noDates` — its occasion has no dates ahead;
 * - `back` — back on the shop now (inside its window);
 * - `waiting` — it comes back on its next window's first day.
 * `switchOff` stands before `back`/`waiting` while the switch is off.
 */
export type ReturnStatus = 'live' | 'archived' | 'neverLive' | 'notTicked' | 'notReady' | 'noDates' | 'switchOff' | 'back' | 'waiting';

export function returnStatus(p: ReturnPage, set: SeasonalReturnSettings, today: string): { status: ReturnStatus; span: SeasonSpan | null } {
  if (p.archivedAt || p.status === 'ARCHIVED') return { status: 'archived', span: null };
  if (p.status === 'PUBLISHED') return { status: 'live', span: null };
  if (!p.publishedAt) return { status: 'neverLive', span: null };
  if (!p.returns) return { status: 'notTicked', span: null };
  if (!p.ready) return { status: 'notReady', span: null };
  const now = spanNow(p.occasion, set, today);
  const next = now ?? nextSpan(p.occasion, set, today);
  if (!next) return { status: 'noDates', span: null };
  if (!set.on) return { status: 'switchOff', span: next };
  return { status: now ? 'back' : 'waiting', span: next };
}

/** Is the page back on the shop today (the shop's read)? */
export const isBack = (p: ReturnPage, set: SeasonalReturnSettings, today: string): boolean => returnStatus(p, set, today).status === 'back';

/** "Comes back each year" from Page.recurrence ({occasion, returns}). */
export function returnsOf(recurrence: unknown): boolean {
  return !!recurrence && typeof recurrence === 'object' && (recurrence as Record<string, unknown>).returns === true;
}
