// S08 · PR 193 — holiday mode (Blueprint B1.14), with no database: safe in the storefront and the admin's browser code.
// Everything comes in as the `delivery.holiday` setting and the store's time zone; nothing is written and no day or
// word is fixed in code.
//
//   off     the switch is off, the dates are missing, or the break is over — say nothing;
//   ahead   the break starts within `showDaysBefore` days: the notice shows, the checkout promise is the usual one;
//   on      today is one of the break's days: the notice shows, and the checkout says the order ships from the day
//           after the break (`resume`) instead of the usual hours — honest, never a refused parcel.
// The site is never taken down: nothing here closes checkout or hides a page.
import { daysBetween, fillEidText, formatDay, localParts, type LocalText } from './eid';
import { langOf, type TextContext } from './text';

export interface HolidayConfig {
  enabled: boolean;
  /** The first day nothing is sent, `YYYY-MM-DD` (store time zone). */
  from: string | null;
  /** The last day nothing is sent. */
  to: string | null;
  showDaysBefore: number;
  /** The shop-wide notice: {from}, {to}, {resume}. */
  notice: LocalText;
  /** At checkout and on the thank-you page during the break: {resume}. */
  promise: LocalText;
}

export type HolidayStatus = { state: 'off' } | { state: 'ahead' | 'on'; from: string; to: string; resume: string; daysLeft: number };

/** The day after `day` (`YYYY-MM-DD`). */
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** Where the store is against the break now. `daysLeft`: whole days until the first day (0 once it started). */
export function holidayStatus(config: HolidayConfig, now: Date, timeZone: string): HolidayStatus {
  if (!config.enabled || !config.from || !config.to || config.from > config.to) return { state: 'off' };
  const { day } = localParts(now, timeZone);
  if (day > config.to) return { state: 'off' };
  const base = { from: config.from, to: config.to, resume: nextDay(config.to) };
  if (day >= config.from) return { state: 'on', ...base, daysLeft: 0 };
  const daysLeft = daysBetween(day, config.from);
  return daysLeft <= config.showDaysBefore ? { state: 'ahead', ...base, daysLeft } : { state: 'off' };
}

const textIn = (t: LocalText, ctx: TextContext) => (langOf(ctx.locale) === 'bn' ? t.bn : t.en);

/** The notice line (home, bag, checkout), or null while there is nothing to say. */
export function holidayNotice(config: HolidayConfig, status: HolidayStatus, ctx: TextContext): string | null {
  if (status.state === 'off') return null;
  return fillEidText(textIn(config.notice, ctx), { from: formatDay(status.from, ctx.locale), to: formatDay(status.to, ctx.locale), resume: formatDay(status.resume, ctx.locale) });
}

/** The promise during the break ("ships from 12 Apr"), in place of the usual hours; null outside the break. */
export function holidayPromise(config: HolidayConfig, status: HolidayStatus, ctx: TextContext): string | null {
  if (status.state !== 'on') return null;
  return fillEidText(textIn(config.promise, ctx), { resume: formatDay(status.resume, ctx.locale) });
}
