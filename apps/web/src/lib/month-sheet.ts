// S16 · PR 346 (B3.9 "month-end close sheet"; BACKEND-ARCHITECTURE §5 MNY-05) — Money → Month-end
// (`/admin/money/month-end`): one page per month that makes the month tally, read-only:
//   - the total per service (every CostEntry of the month: what goes to the ERP on a summary line, and what stays in the
//     shop's own ledger, such as paid messages);
//   - what the ERP has: each day's latest summary and the month's fixed costs, accepted, waiting, refused or not made;
//   - what is still not posted: the days whose latest summary the ERP has not accepted (their cost lines with them);
//   - the differences the books match found in the month (PR 616), and the month's close (open, closed, re-opened).
// The monthly expense push of the older plan is replaced by the daily summary and the monthly fixed costs (CN-028,
// docs/RETAIL-ERP-MODEL.md; BACKEND-ARCHITECTURE line 3): nothing extra is pushed from here, so nothing is sent twice.
// Sending, closing and putting a difference right stay on Money → Books (PR 616–618). Nothing here moves money.
import type { PrismaClient } from '@extas/db/client';
import { closedMonths, openLinkOf, sendStates } from '@extas/inventory';
import { dayStart, nextDay } from '@extas/metrics';

type Db = Pick<PrismaClient, 'costEntry' | 'erpDailySummary' | 'erpFixedCostMonth' | 'erpBooksSend' | 'booksDifference' | 'booksPeriodClose' | 'erpStoreLink'>;

export type SendWord = 'ACCEPTED' | 'WAITING' | 'REFUSED' | 'NONE';
export interface MonthSheet {
  month: string;
  linked: boolean;
  services: { service: string; minor: number; count: number; toErp: boolean }[];
  totals: { minor: number; toErpMinor: number; shopOnlyMinor: number };
  days: { total: number; accepted: number; waiting: number; refused: number; none: number; notPosted: string[] };
  fixedCosts: SendWord;
  differences: { open: number; fixed: number; overridden: number };
  close: { state: 'OPEN' | 'CLOSED' | 'REOPENED'; result: string | null; override: boolean; at: string | null };
}

/** The month's days (YYYY-MM-DD) from its first up to `lastDay` (today, or the month's last day). */
export function monthDays(month: string, from: string | null, lastDay: string): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month) && d <= lastDay; d = nextDay(d)) if (!from || d >= from) out.push(d);
  return out;
}

const word = (s: { accepted: boolean; refused: boolean } | undefined): SendWord => (!s ? 'WAITING' : s.accepted ? 'ACCEPTED' : s.refused ? 'REFUSED' : 'WAITING');

/** The month-end sheet of one store and month (`today` is the store's own day, YYYY-MM-DD). */
export async function monthSheet(db: Db, storeId: number, month: string, timeZone: string, today: string): Promise<MonthSheet> {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const nextFirst = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  const from = dayStart(first, timeZone);
  const to = dayStart(nextFirst, timeZone);
  const dFrom = new Date(`${first}T00:00:00Z`);
  const dTo = new Date(`${nextFirst}T00:00:00Z`);
  const [byDay, byTime, link] = await Promise.all([
    // a cost on a summary line counts on its own day; any other on the day it happened
    db.costEntry.groupBy({ by: ['service', 'summaryLine'], where: { storeId, costDate: { gte: dFrom, lt: dTo } }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.costEntry.groupBy({ by: ['service', 'summaryLine'], where: { storeId, costDate: null, occurredAt: { gte: from, lt: to } }, _sum: { amountMinor: true }, _count: { _all: true } }),
    openLinkOf(db as never, storeId),
  ]);
  const svc = new Map<string, { service: string; minor: number; count: number; toErp: boolean }>();
  for (const g of [...byDay, ...byTime]) {
    const toErp = g.summaryLine !== null;
    const k = `${g.service}|${toErp}`;
    const s = svc.get(k) ?? { service: g.service, minor: 0, count: 0, toErp };
    svc.set(k, { ...s, minor: s.minor + (g._sum.amountMinor ?? 0), count: s.count + g._count._all });
  }
  const services = [...svc.values()].sort((a, b) => b.minor - a.minor || a.service.localeCompare(b.service));
  const toErpMinor = services.filter((s) => s.toErp).reduce((n, s) => n + s.minor, 0);
  const shopOnlyMinor = services.filter((s) => !s.toErp).reduce((n, s) => n + s.minor, 0);
  const base: MonthSheet = {
    month,
    linked: Boolean(link),
    services,
    totals: { minor: toErpMinor + shopOnlyMinor, toErpMinor, shopOnlyMinor },
    days: { total: 0, accepted: 0, waiting: 0, refused: 0, none: 0, notPosted: [] },
    fixedCosts: 'NONE',
    differences: { open: 0, fixed: 0, overridden: 0 },
    close: { state: 'OPEN', result: null, override: false, at: null },
  };
  if (!link) return base;

  const lastDay = nextFirst <= today ? new Date(dTo.getTime() - 86_400_000).toISOString().slice(0, 10) : today;
  const days = monthDays(month, link.startDay, lastDay);
  const [summaries, fixed, diffs, closes, closed] = await Promise.all([
    db.erpDailySummary.findMany({ where: { linkId: link.id, date: { gte: dFrom, lt: dTo } }, orderBy: [{ date: 'asc' }, { version: 'desc' }], select: { id: true, date: true } }),
    db.erpFixedCostMonth.findFirst({ where: { linkId: link.id, month: dFrom }, orderBy: { version: 'desc' }, select: { id: true } }),
    db.booksDifference.groupBy({ by: ['status'], where: { linkId: link.id, date: { gte: dFrom, lt: dTo } }, _count: { _all: true } }),
    db.booksPeriodClose.findFirst({ where: { linkId: link.id, level: 'MONTH', periodStart: dFrom }, orderBy: { version: 'desc' }, select: { result: true, override: true, reopens: true, createdAt: true } }),
    closedMonths(db as never, link.id),
  ]);
  const latest = new Map<string, string>();
  for (const s of summaries) {
    const d = s.date.toISOString().slice(0, 10);
    if (!latest.has(d)) latest.set(d, s.id);
  }
  const states = await sendStates(db as never, link.id, [...latest.values(), ...(fixed ? [fixed.id] : [])]);
  const out = { total: days.length, accepted: 0, waiting: 0, refused: 0, none: 0, notPosted: [] as string[] };
  for (const d of days) {
    const id = latest.get(d);
    const w = id ? word(states.get(id)) : 'NONE';
    if (w === 'ACCEPTED') out.accepted += 1;
    else {
      if (w === 'REFUSED') out.refused += 1;
      else if (w === 'NONE') out.none += 1;
      else out.waiting += 1;
      out.notPosted.push(d);
    }
  }
  const count = (s: string) => diffs.find((g) => g.status === s)?._count._all ?? 0;
  return {
    ...base,
    days: out,
    fixedCosts: fixed ? word(states.get(fixed.id)) : 'NONE',
    differences: { open: count('PENDING') + count('MISMATCH'), fixed: count('FIXED'), overridden: count('OVERRIDDEN') },
    close: { state: closed.has(month) ? 'CLOSED' : closes ? 'REOPENED' : 'OPEN', result: closes?.result ?? null, override: closes?.override ?? false, at: closes?.createdAt.toISOString() ?? null },
  };
}
