// S16 · PR 351 (B3.10, Blueprint §59 answer 24: "report frequency set by the owner"; recommended time 22:00) — the
// money report to the owner (`money.report`, off as shipped):
//   - daily: from the time set (store time) to the end of that day, for that day so far;
//   - weekly: on the weekday set, from the time set, for the last 7 days (that day included);
//   - monthly: on the day of the month set (1–28), from the time set, for the whole month before.
// A report is due for the rest of that store day, so a worker that was down at the time still sends it later the same
// day; its key (D:/W:/M: and the day or month) makes it one run per period, however often the worker looks. The words
// are the figures of Money → Profit & loss (books-profit.ts), never a second calculation. Read-only: nothing moves money.
import type { MoneyReportSettings } from '@extas/settings';
import words from '../data/money-report-words.json';
import type { ProfitReport } from './books-profit';

export interface MoneyReportDue {
  /** One per period: `D:2026-11-01`, `W:2026-11-07`, `M:2026-10`. */
  key: string;
  from: string;
  to: string;
}

/** The store's local day (YYYY-MM-DD), minutes after midnight and weekday (0 = Sunday) at `at`. */
export function localClock(at: Date, timeZone: string): { day: string; minutes: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: new Date(`${day}T00:00:00Z`).getUTCDay() };
}

const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The report due at `now` in the store's time zone, or null (off, not the day, or before the time). */
export function moneyReportDue(now: Date, timeZone: string, s: MoneyReportSettings): MoneyReportDue | null {
  if (!s.enabled) return null;
  const c = localClock(now, timeZone);
  const [h, m] = s.at.split(':').map(Number) as [number, number];
  if (c.minutes < h * 60 + m) return null;
  if (s.frequency === 'daily') return { key: `D:${c.day}`, from: c.day, to: c.day };
  if (s.frequency === 'weekly') return c.weekday === s.weekday ? { key: `W:${c.day}`, from: shift(c.day, -6), to: c.day } : null;
  if (Number(c.day.slice(8, 10)) !== s.monthDay) return null;
  const lastOfPrev = shift(`${c.day.slice(0, 7)}-01`, -1);
  return { key: `M:${lastOfPrev.slice(0, 7)}`, from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
}

/** The period the report would cover if it went today (any day, any time): for the preview on Money → Profit & loss. */
export function moneyReportPreview(now: Date, timeZone: string, s: Pick<MoneyReportSettings, 'frequency'>): MoneyReportDue {
  const day = localClock(now, timeZone).day;
  if (s.frequency === 'daily') return { key: `D:${day}`, from: day, to: day };
  if (s.frequency === 'weekly') return { key: `W:${day}`, from: shift(day, -6), to: day };
  const lastOfPrev = shift(`${day.slice(0, 7)}-01`, -1);
  return { key: `M:${lastOfPrev.slice(0, 7)}`, from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
}

/** The store day the next report goes (today while its time has not passed), or null while off. */
export function moneyReportNextDay(now: Date, timeZone: string, s: MoneyReportSettings): string | null {
  if (!s.enabled) return null;
  const c = localClock(now, timeZone);
  const [h, m] = s.at.split(':').map(Number) as [number, number];
  const startAt = c.minutes < h * 60 + m ? 0 : 1;
  for (let i = startAt; i <= 62; i += 1) {
    const day = shift(c.day, i);
    const ok = s.frequency === 'daily' || (s.frequency === 'weekly' ? new Date(`${day}T00:00:00Z`).getUTCDay() === s.weekday : Number(day.slice(8, 10)) === s.monthDay);
    if (ok) return day;
  }
  return null;
}

/** An amount in minor units as plain text with its currency ("12,345.50 BDT"), Western digits. */
export function moneyText(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return `${(minor / 10 ** digits).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })} ${currency}`;
}

const fill = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

/** The report's words: Sales (delivered) first with Ordered value beside it, then profit down to net profit. */
export function moneyReportText(r: ProfitReport, due: Pick<MoneyReportDue, 'from' | 'to'>, lang: 'bn' | 'en', currency: string): string {
  const w = words[lang];
  const amt = (v: number | null) => (v === null ? w.unknown : moneyText(v, currency));
  const period = due.from === due.to ? due.from : `${due.from} – ${due.to}`;
  const lines = [
    fill(w.title, { period }),
    fill(w.sales, { amount: amt(r.salesMinor), orders: r.orders }),
    fill(w.ordered, { amount: amt(r.orderedMinor) }),
    fill(w.gross, { amount: amt(r.grossProfitMinor) }),
    fill(w.contribution, { amount: amt(r.contributionMinor) }),
    fill(w.ads, { amount: amt(r.adsMinor) }),
    fill(w.fixed, { amount: r.fixedMinor === null ? w.noFixed : amt(r.fixedMinor) }),
    fill(w.net, { amount: amt(r.netProfitMinor) }),
    ...(r.uncosted.orders ? [fill(w.uncosted, { orders: r.uncosted.orders })] : []),
    w.more,
  ];
  return lines.join('\n');
}
