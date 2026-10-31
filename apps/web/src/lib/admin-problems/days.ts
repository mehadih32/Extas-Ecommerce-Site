// S21 · PR 423 — the date view of Customer problems in the shop's own time zone (`store.timeZone`): which days a view
// means and where each day starts. Pure.

/** The calendar day (YYYY-MM-DD) of an instant in the time zone. */
export function dayOf(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** The day `n` days after (or before, when negative) a calendar day. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The time zone's offset from UTC at an instant (milliseconds). */
function offsetAt(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second')) - Math.floor(at.getTime() / 1000) * 1000;
}

/** 00:00 of a calendar day in the time zone, as an instant. */
export function dayStartAt(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetAt(new Date(guess), timeZone);
  return new Date(guess - offsetAt(new Date(first), timeZone));
}

export const VIEWS = ['today', 'yesterday', 'week', 'all'] as const;
export type ProblemsWhen = (typeof VIEWS)[number] | { day: string };

/** What the page's `when` means: one of the views, or a day (YYYY-MM-DD); anything else is today. */
export function parseWhen(raw: string | undefined): ProblemsWhen {
  if (raw && (VIEWS as readonly string[]).includes(raw)) return raw as ProblemsWhen;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))) return { day: raw };
  return 'today';
}

/** The window a view covers: [from, to). `week` is the last 7 days with today; `all` the last `showDays` days. */
export function windowOf(when: ProblemsWhen, now: Date, timeZone: string, showDays: number): { from: Date; to: Date; days: number } {
  const today = dayOf(now, timeZone);
  const span = (first: string, days: number) => ({
    from: dayStartAt(first, timeZone),
    to: dayStartAt(addDays(first, days), timeZone),
    days,
  });
  if (typeof when === 'object') return span(when.day, 1);
  if (when === 'yesterday') return span(addDays(today, -1), 1);
  if (when === 'week') return span(addDays(today, -6), 7);
  if (when === 'all') return span(addDays(today, 1 - showDays), showDays);
  return span(today, 1);
}
