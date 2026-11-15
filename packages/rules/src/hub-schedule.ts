// Parity round 3, lane F5 · PR 858 — the Rules page's "Start on a later date" (prototype Rules › More options). The owner types the new numbers
// and a date after today; Save schedules them instead of changing the rule now. On that day the numbers are written by the rules clock (the
// owner's own choice, nothing reaches a buyer except what the rule already does). Pure, so the date rules and the "which are due" split are
// tested without a database. The setting that holds the list is `rules.hub.schedule` (registry-rules-hub.ts).
import type { HubScheduleEntry } from '@extas/settings';

/** The furthest a change may be scheduled ahead (days): a typo in the year must not hide a change for years. */
export const SCHEDULE_MAX_DAYS = 400; // hardcode-ok: a safety bound on a typed date, not a business rule

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10); // hardcode-ok: ms in a day

/** null when `from` is a real date after `today` and not too far ahead; else why not. */
export function scheduleDateProblem(from: unknown, today: string): 'date' | 'past' | 'far' | null {
  if (typeof from !== 'string' || !DAY.test(from) || Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from) return 'date';
  if (from <= today) return 'past';
  if (from > addDays(today, SCHEDULE_MAX_DAYS)) return 'far';
  return null;
}

/** The entries whose day has come (today included), oldest first, and the ones still waiting. */
export function splitDue(entries: readonly HubScheduleEntry[], today: string): { due: HubScheduleEntry[]; waiting: HubScheduleEntry[] } {
  const due = entries.filter((e) => e.from <= today).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return { due, waiting: entries.filter((e) => e.from > today) };
}

/** The list with one row's entry replaced (or removed when `next` is null): a row has at most one scheduled change. */
export function withEntry(entries: readonly HubScheduleEntry[], rowId: string, next: HubScheduleEntry | null): HubScheduleEntry[] {
  const rest = entries.filter((e) => e.rowId !== rowId);
  return next ? [...rest, next] : rest;
}
