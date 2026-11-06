// S13 · PR 282 — the marketing calendar's pure parts (no database): days on the shop's clock (`YYYY-MM-DD`), the view's
// range, which items fall in it and where their bars and marks sit, the month marks of the header, the owner's plan
// line as typed, and the order of the day-by-day list. Every number here is a length or a guard, never a business number.
import { utcToWall } from '../shop/seasonal-home-model';

/** The calendar's lanes, in the order they show (the owner's own plan lines first). */
export const CALENDAR_LANES = ['plan', 'campaign', 'ads', 'message', 'home', 'festive', 'content', 'social'] as const;
export type CalendarLane = (typeof CALENDAR_LANES)[number];

export type CalendarState = 'live' | 'scheduled' | 'ended' | 'off';

/** One thing on the calendar. Days are on the shop's clock; `ends` is the last day (inclusive). */
export interface CalendarItem {
  id: string;
  lane: CalendarLane;
  title: { en: string; bn: string | null };
  starts: string;
  /** The last day (inclusive); null with `open` = runs on until stopped; null without = one day. */
  ends: string | null;
  open: boolean;
  state: CalendarState;
  /** A word about it shown in small print (the channel, the platform, the language, the band count…), not translated. */
  detail: string | null;
  /** Small numbers the page words itself ({orders, delivered, pages} for a campaign). */
  counts?: Record<string, number>;
  /** Single days marked on the bar (a festive rule's last order day per band). */
  marks?: { day: string; label: string }[];
  /** The admin page it is managed on (null: none yet). */
  href: string | null;
  /** The owner's own plan line: it can be changed here (follow-up 656: and the campaign it is tied to, if any). */
  own?: { note: string | null; archived: boolean; campaign?: { id: string; name: string } | null };
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day

/** A real day typed as `YYYY-MM-DD`, or null. */
export function dayOf(v: unknown): string | null {
  const m = typeof v === 'string' ? DAY_RE.exec(v.trim()) : null;
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? m[0] : null;
}

/** The day an instant falls on, on the shop's clock. */
export const dayAt = (at: Date, timeZone: string): string => utcToWall(at, timeZone).slice(0, 10);

const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
/** `day` moved by `n` days. */
export const addDays = (day: string, n: number): string => new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10);
/** Days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((ms(b) - ms(a)) / DAY_MS);
/** A DATE column's value as its day (Prisma gives midnight UTC). */
export const dateDay = (d: Date): string => d.toISOString().slice(0, 10);
/** A day as a DATE column's value. */
export const dayDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

export interface CalendarRange {
  from: string;
  /** The last day shown (inclusive). */
  to: string;
  days: number;
}

/** The view: `days` days from `from` (the shop's today unless another real day is asked for). */
export function calendarRange(today: string, days: number, asked?: unknown): CalendarRange {
  const from = dayOf(asked) ?? today;
  return { from, to: addDays(from, days - 1), days };
}

/**
 * Follow-up 656 — the month view: the whole month holding the asked real day (else today), from its 1st to its last day.
 */
export function monthRange(today: string, asked?: unknown): CalendarRange {
  const base = dayOf(asked) ?? today;
  const from = `${base.slice(0, 8)}01`;
  const [y, m] = base.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = addDays(next, -1);
  return { from, to, days: daysBetween(from, to) + 1 };
}

/** The first day of the month before / after the view's month (the month view's earlier and later). */
export const monthStep = (r: CalendarRange, n: -1 | 1): string => (n < 0 ? `${addDays(r.from, -1).slice(0, 8)}01` : addDays(r.to, 1));

/** A day's weekday, 1 = Monday … 7 = Sunday (ISO). */
export const isoWeekday = (day: string): number => new Date(ms(day)).getUTCDay() || 7; // hardcode-ok: Sunday is 7 in ISO weeks

/**
 * The month view's weeks: whole weeks from the week holding the 1st to the week holding the last day, starting on
 * `firstDay` (1–7, the shop's own locale's first day of the week); days outside the month are marked `out`.
 */
export function monthWeeks(r: CalendarRange, firstDay: number): { day: string; out: boolean }[][] {
  const start = addDays(r.from, -((isoWeekday(r.from) - firstDay + 7) % 7));
  const weeks: { day: string; out: boolean }[][] = [];
  for (let d = start; d <= r.to; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, n) => addDays(d, n)).map((day) => ({ day, out: day < r.from || day > r.to })));
  }
  return weeks;
}

/** The items on one day: a festive rule on its band days only, anything else on every day it runs. */
export function itemsOn<T extends Pick<CalendarItem, 'starts' | 'ends' | 'open' | 'marks'>>(items: readonly T[], day: string): T[] {
  return items.filter((i) => (i.marks?.length ? i.marks.some((m) => m.day === day) : i.starts <= day && (i.ends ?? (i.open ? day : i.starts)) >= day));
}

/** The item's last day as the view sees it (an open item runs past any view). */
const lastDay = (i: Pick<CalendarItem, 'starts' | 'ends' | 'open'>, r: CalendarRange) => i.ends ?? (i.open ? addDays(r.to, 1) : i.starts);

/** Whether any of the item's days (or any of its marks) falls in the view. */
export function inRange(i: Pick<CalendarItem, 'starts' | 'ends' | 'open' | 'marks'>, r: CalendarRange): boolean {
  if (i.marks?.length) return i.marks.some((m) => m.day >= r.from && m.day <= r.to);
  return i.starts <= r.to && lastDay(i, r) >= r.from;
}

/** The bar's place in the view, in percent of its width (a one-day item is one day wide). */
export function barOf(i: Pick<CalendarItem, 'starts' | 'ends' | 'open'>, r: CalendarRange): { left: number; width: number } {
  const a = Math.max(0, daysBetween(r.from, i.starts));
  const b = Math.min(r.days, daysBetween(r.from, lastDay(i, r)) + 1);
  const pct = (n: number) => Math.round((n / r.days) * 1000) / 10;
  return { left: pct(a), width: Math.max(pct(1), pct(b - a)) };
}

/** A mark's place in the view, in percent (null: outside it). */
export function markAt(day: string, r: CalendarRange): number | null {
  const n = daysBetween(r.from, day);
  return n < 0 || n >= r.days ? null : Math.round((n / r.days) * 1000) / 10;
}

/** The header's marks: the view's first day and the first of every month inside it. */
export function monthMarks(r: CalendarRange): { day: string; left: number }[] {
  const out: { day: string; left: number }[] = [];
  for (let n = 0; n < r.days; n++) {
    const day = addDays(r.from, n);
    if (n === 0 || day.endsWith('-01')) out.push({ day, left: Math.round((n / r.days) * 1000) / 10 });
  }
  return out;
}

/** The day-by-day list: by first day in the view, then lane order, then title. */
export function agendaOrder(r: CalendarRange) {
  const first = (i: CalendarItem) => {
    const days = i.marks?.length ? i.marks.map((m) => m.day).filter((d) => d >= r.from) : [i.starts];
    const d = days.sort()[0] ?? i.starts;
    return d < r.from ? r.from : d;
  };
  return (a: CalendarItem, b: CalendarItem) => first(a).localeCompare(first(b)) || CALENDAR_LANES.indexOf(a.lane) - CALENDAR_LANES.indexOf(b.lane) || a.title.en.localeCompare(b.title.en);
}

/** Where an item stands on `today`, from its days. */
export function stateByDays(starts: string, ends: string | null, today: string): CalendarState {
  if (starts > today) return 'scheduled';
  return ends !== null && ends < today ? 'ended' : 'live';
}

// ---- the owner's plan line as typed ----

export const PLAN_TITLE_MAX = 80; // hardcode-ok: a text-length guard
export const PLAN_NOTE_MAX = 280; // hardcode-ok: a text-length guard
/** The longest plan line, in days (a guard against a typo such as 2207 for 2027). */
export const PLAN_SPAN_MAX = 366; // hardcode-ok: a typo guard

export interface PlanInput {
  title: string;
  titleBn: string | null;
  starts: string;
  ends: string | null;
  note: string | null;
  /** Follow-up 656: the campaign (Marketing › Campaigns) the line belongs to, or null. */
  campaignId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? undefined : s;
};

/** The plan line as the form sends it; `bad` names every field that is wrong. */
export function planInput(b: Record<string, unknown>): { ok: true; value: PlanInput } | { ok: false; bad: string[] } {
  const title = text(b.title, PLAN_TITLE_MAX);
  const titleBn = text(b.titleBn, PLAN_TITLE_MAX);
  const note = text(b.note, PLAN_NOTE_MAX);
  const starts = dayOf(b.starts);
  const endsEmpty = b.ends === undefined || b.ends === null || (typeof b.ends === 'string' && !b.ends.trim());
  const ends = endsEmpty ? null : dayOf(b.ends);
  const noCampaign = b.campaignId === undefined || b.campaignId === null || b.campaignId === '';
  const campaignId = !noCampaign && typeof b.campaignId === 'string' && UUID_RE.test(b.campaignId) ? b.campaignId.toLowerCase() : null;
  const bad = [
    !title ? 'title' : '',
    titleBn === undefined ? 'titleBn' : '',
    !starts ? 'starts' : '',
    (!endsEmpty && !ends) || (ends && starts && (ends < starts || daysBetween(starts, ends) >= PLAN_SPAN_MAX)) ? 'ends' : '',
    note === undefined ? 'note' : '',
    !noCampaign && !campaignId ? 'campaignId' : '',
  ].filter(Boolean);
  if (bad.length) return { ok: false, bad };
  return { ok: true, value: { title: title!, titleBn: titleBn ?? null, starts: starts!, ends: ends && ends !== starts ? ends : null, note: note ?? null, campaignId } };
}
