// S12 · PR 245 (Blueprint C11.1 "an empty slot is never filled with a weak post"; demo 94-admin-blog.js schedule tab) —
// the publish calendar's arithmetic, without the database: shop-time days and times, the free publishing times of the
// days ahead, which finished article goes in which free time, and the month grid. Everything is in the shop's time zone
// (`store.timeZone`); the numbers come from `blog.schedule`.
import { SLOT_RE, type BlogScheduleSettings } from '@extas/settings';

const DAY_MS = 86_400_000; // hardcode-ok: the length of a day
const MINUTE_MS = 60_000; // hardcode-ok: the length of a minute

/** The publishing times of a day, sorted, each once (`HH:MM`). */
export function slotsOf(s: Pick<BlogScheduleSettings, 'slots'>): string[] {
  return [...new Set(s.slots.split(',').map((x) => x.trim()).filter((x) => SLOT_RE.test(x)))].sort();
}

function parts(at: Date, timeZone: string): { day: string; time: string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const v = (type: string) => f.find((p) => p.type === type)?.value ?? '';
  return { day: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
}

/** The shop-time day (`YYYY-MM-DD`) of a moment. */
export const dayOf = (at: Date, timeZone: string): string => parts(at, timeZone).day;
/** The shop-time clock (`HH:MM`) of a moment. */
export const timeOf = (at: Date, timeZone: string): string => parts(at, timeZone).time;

/** The moment of `HH:MM` on a shop-time day. */
export function slotAt(day: string, hm: string, timeZone: string): Date {
  const guess = Date.parse(`${day}T${hm}:00Z`);
  const p = parts(new Date(guess), timeZone);
  const shown = Date.parse(`${p.day}T${p.time}:00Z`);
  return new Date(guess - (shown - guess));
}

/** The day `n` days after `day` (calendar days, whatever the time zone). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** An article on the calendar: scheduled for, or published at, `at`. */
export interface Placed {
  at: Date;
}

/** One day of the calendar: its articles and its free times. */
export interface DayPlan {
  day: string;
  count: number;
  free: Date[];
  /** Under the day's least (`perDayMin`); today is never flagged, its times may be past. */
  low: boolean;
}

/**
 * The days ahead from today (`daysAhead` of them): each day's articles counted, and its free times — a publishing
 * time with no article at that minute, not closer than `leadMinutes` from now, while the day is under its target.
 */
export function daysAhead(placed: readonly Placed[], s: BlogScheduleSettings, now: Date, timeZone: string): DayPlan[] {
  const slots = slotsOf(s);
  const today = dayOf(now, timeZone);
  const earliest = now.getTime() + s.leadMinutes * MINUTE_MS;
  const out: DayPlan[] = [];
  for (let i = 0; i < s.daysAhead; i += 1) {
    const day = addDays(today, i);
    const mine = placed.filter((p) => dayOf(p.at, timeZone) === day);
    const taken = new Set(mine.map((p) => timeOf(p.at, timeZone)));
    let n = mine.length;
    const free: Date[] = [];
    for (const hm of slots) {
      const at = slotAt(day, hm, timeZone);
      if (at.getTime() <= earliest || taken.has(hm) || n >= s.perDayTarget) continue;
      free.push(at);
      n += 1;
    }
    out.push({ day, count: mine.length, free, low: i > 0 && mine.length < s.perDayMin });
  }
  return out;
}

/** The free times of the days ahead, earliest first. */
export const freeTimes = (days: readonly DayPlan[]): Date[] => days.flatMap((d) => d.free);

/** A finished article waiting for a time: its topic's priority (1 first) and when it was last changed. */
export interface Ready {
  id: string;
  priority: number;
  updatedAt: Date;
}

/** The finished articles in the order they get a time: the topic's priority first, then the one waiting longest. */
export const readyOrder = <T extends Ready>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => a.priority - b.priority || a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id));

/** Which article goes in which free time: one each, in order, until either runs out. */
export function fillPlan<T extends Ready>(ready: readonly T[], free: readonly Date[]): { post: T; at: Date }[] {
  const order = readyOrder(ready);
  return order.slice(0, free.length).map((post, i) => ({ post, at: free[i]! }));
}

/** A month (`YYYY-MM`) as calendar weeks from `weekStart` (0 Sunday … 6 Saturday), `null` for the days outside it. */
export function monthGrid(month: string, weekStart: number): (string | null)[][] {
  const first = new Date(`${month}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** The month before or after `month`. */
export function shiftMonth(month: string, n: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
