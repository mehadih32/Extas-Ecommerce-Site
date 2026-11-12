// S15 · PR 308 (C1.6) — each agent's own schedule: when its recurring, time-based work runs. Most of the seven
// agents' work is event-triggered ("on every order", "when a product is added") and fires whenever its own trigger
// happens, any time of day — that is unaffected by this PR. A few jobs (a nightly size-chart tune-up, a weekly
// competitor check, a daily report comment) are instead time-based, and C1.6 says every one of those needs its own
// schedule inside AI 360. Three honest modes: `always` (no time restriction — the default, and the only mode most
// agents ever need), `daily` (once a day at the owner's own clock time) and `weekly` (on the owner's own chosen
// weekdays, same clock time), both read in the store's own time zone, never the server's.
//
// This only stores, validates and previews the setting (the next moment it would fire) — it does not run anything.
// No AI job runner reads a schedule yet (that engine is a later PR), exactly as PR 305's pause switch and PR 307's
// model pick were both built, honestly inert, before any AI key ever existed. `AiAgent.schedule` is additive and
// already in the schema (unused until now); every existing agent keeps `null` (= `always`) until the owner picks
// something else.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { dayStart, nextDay, ymdIn } from '@extas/metrics';
import { AiError } from './errors';
import { isAiAgentKey } from './agents';

export type ScheduleMode = 'always' | 'daily' | 'weekly';

export interface AgentSchedule {
  mode: ScheduleMode;
  /** "HH:MM", 24-hour, the store's own time zone. Present for `daily` and `weekly`. */
  time?: string;
  /** 0 (Sunday) .. 6 (Saturday), at least one, no duplicates, ascending. Present for `weekly` only. */
  days?: number[];
}

export const ALWAYS_SCHEDULE: Readonly<AgentSchedule> = { mode: 'always' };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

function isValidDays(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.length <= 7 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(v).size === v.length;
}

/**
 * Validates an owner-submitted schedule, or throws `INVALID_SCHEDULE` (422). `null`/`undefined` means "always" —
 * resetting to no restriction is always valid, the same as PR 307's `null` provider resetting to the practice
 * writer.
 */
export function parseScheduleInput(input: unknown): AgentSchedule {
  if (input === null || input === undefined) return ALWAYS_SCHEDULE;
  if (typeof input !== 'object') throw new AiError(422, 'INVALID_SCHEDULE', ['schedule']);
  const mode = (input as Record<string, unknown>).mode;
  if (mode === 'always') return ALWAYS_SCHEDULE;
  if (mode === 'daily') {
    const time = (input as Record<string, unknown>).time;
    if (!isValidTime(time)) throw new AiError(422, 'INVALID_SCHEDULE', ['time']);
    return { mode: 'daily', time };
  }
  if (mode === 'weekly') {
    const time = (input as Record<string, unknown>).time;
    const days = (input as Record<string, unknown>).days;
    if (!isValidTime(time)) throw new AiError(422, 'INVALID_SCHEDULE', ['time']);
    if (!isValidDays(days)) throw new AiError(422, 'INVALID_SCHEDULE', ['days']);
    return { mode: 'weekly', time, days: [...days].sort((a, b) => a - b) };
  }
  throw new AiError(422, 'INVALID_SCHEDULE', ['mode']);
}

/**
 * Reads a stored `AiAgent.schedule` (a free-form `Json?`) back into a schedule, defensively — bad or legacy data
 * never breaks the page, it is simply read as "always" (the same instinct as PR 307's quiet fallback to the
 * practice writer when a stored pick no longer checks out).
 */
export function normalizeStoredSchedule(json: unknown): AgentSchedule {
  try {
    return parseScheduleInput(json ?? null);
  } catch {
    return ALWAYS_SCHEDULE;
  }
}

function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The moment a given "HH:MM" falls on a given shop day, in the store's own time zone — `dayStart`'s midnight plus
 * that many minutes. (A day with a clock change can be off by the change's size for a time very close to it; that
 * is a preview of a future run, not a financial figure, so this stays simple rather than reimplementing
 * `dayStart`'s own two-pass offset trick for an arbitrary time.) */
function instantAt(ymd: string, time: string, timeZone: string): Date {
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(dayStart(ymd, timeZone).getTime() + (hh * 60 + mm) * 60_000);
}

/**
 * The next moment this schedule fires at or after `now`, in the store's own time zone — `null` for `always` (there
 * is no time-based run to wait for; the agent's work is purely event-triggered). Looks at today first, then up to
 * seven days ahead, so a `weekly` schedule always finds its next day within one week.
 */
export function nextRunAt(schedule: AgentSchedule, now: Date, timeZone: string): Date | null {
  if (schedule.mode === 'always' || !schedule.time) return null;
  let ymd = ymdIn(now, timeZone);
  for (let i = 0; i <= 7; i++) {
    if (schedule.mode === 'weekly' && !schedule.days?.includes(weekdayOf(ymd))) {
      ymd = nextDay(ymd);
      continue;
    }
    const at = instantAt(ymd, schedule.time, timeZone);
    if (at.getTime() >= now.getTime()) return at;
    ymd = nextDay(ymd);
  }
  return null; // unreachable for a valid schedule (a `weekly` one always has a day within 7) — kept honest, not thrown
}

/**
 * Sets one agent's own schedule (`null` resets to "always", always valid). A no-op when it already is what was
 * asked, so a double tap writes once.
 */
export async function setAgentSchedule(deps: { db: PrismaClient }, who: { actor: Actor; ctx?: RequestContext }, key: string, input: unknown): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  const schedule = parseScheduleInput(input);
  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const before = normalizeStoredSchedule(row.schedule);
    if (JSON.stringify(before) === JSON.stringify(schedule)) return;
    await tx.aiAgent.update({
      where: { key },
      data: { schedule: schedule.mode === 'always' ? Prisma.DbNull : (schedule as unknown as Prisma.InputJsonValue) },
    });
    await audit(tx, who.actor, { action: 'ai.agent.schedule', entityType: 'AiAgent', entityId: row.id, before: { schedule: before }, after: { schedule } }, who.ctx ?? {});
  });
}
