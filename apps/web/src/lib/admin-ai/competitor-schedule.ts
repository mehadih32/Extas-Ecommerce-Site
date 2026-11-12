// S15 · PR 337 — split out of `competitor-list.ts`/`competitor-recheck.ts` so neither needs to import the other
// (the same reason `errors.ts` sits below `control-room.ts`/`model-picks.ts`): this file sits below both.
//
// A preview only, the exact same shape PR 308 already shipped for `AiAgent.schedule` — see
// `competitor-recheck.ts`'s own header comment for the full, honest reason no automatic runner reads this yet.
export type CompetitorSchedule = 'weekly' | 'monthly' | null;

const SCHEDULE_DAYS: Record<'weekly' | 'monthly', number> = { weekly: 7, monthly: 30 };
const DAY_MS = 86_400_000; // hardcode-ok: a unit conversion, not a business number

/** `null` for "no schedule", or a competitor never yet run (due now — the same "due immediately" convention a
 * never-run cron entry would read). */
export function nextDueAt(schedule: CompetitorSchedule, lastRunAt: Date | null, now: Date): Date | null {
  if (!schedule) return null;
  if (!lastRunAt) return now;
  return new Date(lastRunAt.getTime() + SCHEDULE_DAYS[schedule] * DAY_MS);
}

export function isDue(schedule: CompetitorSchedule, lastRunAt: Date | null, now: Date): boolean {
  const due = nextDueAt(schedule, lastRunAt, now);
  return due != null && due.getTime() <= now.getTime();
}
