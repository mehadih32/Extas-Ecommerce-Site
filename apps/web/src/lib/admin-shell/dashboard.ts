// PR 12 — what the Dashboard (DSH-01, docs/BACKEND-ARCHITECTURE.md §5.2) needs that is not drawing: the greeting's
// part of the day and how old a waiting item is.

export interface DashboardSettings {
  afternoonHour: number;
  eveningHour: number;
}

/** The greeting's part of the day at this hour (0–23, store time zone). */
export function partOfDay(hour: number, s: Pick<DashboardSettings, 'afternoonHour' | 'eveningHour'>): 'morning' | 'afternoon' | 'evening' {
  return hour < s.afternoonHour ? 'morning' : hour < s.eveningHour ? 'afternoon' : 'evening';
}

/** The hour of a moment in a time zone (0–23). */
export function hourIn(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(at)) % 24;
}

export type Age = { unit: 'now' } | { unit: 'm' | 'h' | 'd'; n: number };

/** How long ago, in the largest whole unit that reads well (minutes under an hour, hours under two days). */
export function ageOf(iso: string | null, now: Date): Age | null {
  if (!iso) return null;
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return { unit: 'now' };
  if (min < 60) return { unit: 'm', n: min };
  const h = Math.floor(min / 60);
  return h < 48 ? { unit: 'h', n: h } : { unit: 'd', n: Math.floor(h / 24) };
}
