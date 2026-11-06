// S12 · PR 252 (register "Content calendar shared with the social studio"; CalendarEntry "the shared content and
// marketing calendar (blog, social, ads, campaigns)") — Website › Blog & journal › Shared calendar: the one calendar the
// journal, the social studio and Marketing › Calendar (PR 282) share, read from the same sources (CALENDAR_SOURCES and
// the CalendarEntry lines other modules write), day by day on the shop's clock, for `marketing.calendar.days` days.
// - The journal's articles (scheduled or published) sit beside the owner's plan lines, campaigns, ads, message sends,
//   seasonal home windows and festive cut-offs, so a writer sees what is coming before choosing a day.
// - Social posts (the social studio, S23) are part of it, shown only while S23 is shown (`stages.closedShown.S23`, off
//   while the owner keeps S23 closed — CN-036); the studio reads this same calendar when it opens.
// - Unlike Marketing › Calendar it is shown whether or not `marketing.calendar` is on (it changes nothing). Read-only:
//   nothing is started, sent, published or changed here; each item links to the page where it is managed.
// Seeing needs `blog.read`.
import type { PrismaClient } from '@extas/db/client';
import type { AdminDeps } from '../admin-auth';
import { calendarOverview } from '../marketing/calendar';
import { CALENDAR_LANES, type CalendarItem, type CalendarLane, type CalendarRange } from '../marketing/calendar-model';
import { hiddenStages } from '../stages/closed';

export interface SharedCalendar {
  timeZone: string;
  today: string;
  range: CalendarRange;
  items: CalendarItem[];
  lanes: Record<CalendarLane, number>;
  /** The lanes this calendar shows (social only while S23 is shown). */
  shownLanes: CalendarLane[];
  socialShown: boolean;
}

/** The shared calendar from `from` (the shop's today unless another day is asked for). */
export async function sharedCalendar(db: PrismaClient, resolver: AdminDeps['resolver'], now: Date, ask: { from?: unknown } = {}): Promise<SharedCalendar> {
  const [view, shown] = await Promise.all([calendarOverview({ db, resolver, now: () => now }, { from: ask.from, always: true }), resolver.value('stages.closedShown')]);
  const socialShown = !hiddenStages(shown).includes('S23');
  const shownLanes = CALENDAR_LANES.filter((l) => socialShown || l !== 'social');
  const items = view.items.filter((i) => shownLanes.includes(i.lane));
  const lanes = Object.fromEntries(CALENDAR_LANES.map((l) => [l, shownLanes.includes(l) ? view.lanes[l] : 0])) as Record<CalendarLane, number>;
  return { timeZone: view.timeZone, today: view.today, range: view.range, items, lanes, shownLanes, socialShown };
}
