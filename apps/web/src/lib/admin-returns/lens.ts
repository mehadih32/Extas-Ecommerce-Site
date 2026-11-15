// PR 828 (prototype v5, Orders › Returns & exchanges): the chip tabs, the reminder strip and the date bar over the exchange
// cases. Pure: no database, no clock of its own (the caller passes `now`). Every case is in exactly one tab, so the tab
// counts add up; the date range narrows by the day the case was opened (the store's own calendar day).
import { dayOf, validDay } from '@/lib/admin-orders/range';

export type CaseLike = { status: string; kind: string; createdAt: string; oldPieceDueAt: string | null };

/** The chip tabs in the prototype's order. "Handed back" is the hand-back desk's own page, so it is a link, not a list. */
export const RETURN_TABS = ['requests', 'coming', 'handed', 'waiting', 'replace', 'approved', 'declined', 'cancelled'] as const;
export type ReturnTab = (typeof RETURN_TABS)[number];
/** The tabs that list cases here (all but the hand-back link). */
export const LISTED_TABS = RETURN_TABS.filter((x) => x !== 'handed') as readonly Exclude<ReturnTab, 'handed'>[];

/** Which tab a case belongs to. A free replacement is its own tab until it is decided; then it counts where its status says. */
export function tabOf(c: Pick<CaseLike, 'status' | 'kind'>): Exclude<ReturnTab, 'handed'> {
  switch (c.status) {
    case 'REQUESTED':
      return 'requests';
    case 'APPROVED':
    case 'PICKUP_BOOKED':
      return c.kind === 'REPLACEMENT' ? 'replace' : 'coming';
    case 'RECEIVED':
      return 'waiting';
    case 'COMPLETED':
    case 'QC_PASSED':
      return 'approved';
    case 'REJECTED':
    case 'QC_FAILED':
      return 'declined';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'requests';
  }
}

export const isTab = (v: string | undefined): v is Exclude<ReturnTab, 'handed'> => !!v && (LISTED_TABS as readonly string[]).includes(v);

export function countByTab<T extends Pick<CaseLike, 'status' | 'kind'>>(rows: readonly T[]): Record<Exclude<ReturnTab, 'handed'>, number> {
  const out = { requests: 0, coming: 0, waiting: 0, replace: 0, approved: 0, declined: 0, cancelled: 0 };
  for (const r of rows) out[tabOf(r)] += 1;
  return out;
}

/** The reminder strip: what needs a person today. `comingSoon`: an old piece due back within a day (or late). */
export interface Reminders {
  requests: number;
  comingSoon: number;
  waiting: number;
}
export function remindersOf(rows: readonly CaseLike[], now: Date): Reminders {
  const day = 86_400_000;
  return {
    requests: rows.filter((r) => r.status === 'REQUESTED').length,
    comingSoon: rows.filter((r) => (r.status === 'APPROVED' || r.status === 'PICKUP_BOOKED') && !!r.oldPieceDueAt && Date.parse(r.oldPieceDueAt) - now.getTime() < day).length,
    waiting: rows.filter((r) => r.status === 'RECEIVED').length,
  };
}

/** The cases opened inside the range (both days included, in the store's time zone); no range keeps every case. */
export function inRange<T extends Pick<CaseLike, 'createdAt'>>(rows: readonly T[], from: string | undefined, to: string | undefined, timeZone: string): T[] {
  const f = validDay(from);
  const e = validDay(to);
  if (!f && !e) return [...rows];
  return rows.filter((r) => {
    const d = dayOf(new Date(r.createdAt), timeZone);
    return (!f || d >= f) && (!e || d <= e);
  });
}
