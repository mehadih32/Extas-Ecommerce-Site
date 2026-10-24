// PR 12 (CN-025) — how the V12.4 designs write numbers, money, shares, ages and days in the admin's language (Western
// digits in both languages, the store's currency from `store.currency`). One object per request, shared by every
// design, so the three Dashboard designs always write the same figure the same way.
import type { AdminView } from '@/lib/admin-page';
import { ageOf } from '@/lib/admin-shell/dashboard';
import { t, type Dict } from '@/lib/i18n';
import { formatMoney, formatNumber, moneyOf, type Money } from '../products/model';

export interface Fmt {
  lang: 'bn' | 'en';
  locale: string;
  timeZone: string;
  currency: string;
  dict: Dict;
  now: Date;
  t(key: string, vars?: Record<string, string | number>): string;
  n(x: number): string;
  money(minor: number): string;
  /** Short money for an axis or a tight tile (৳12K style, from Intl). */
  short(minor: number): string;
  pct(x: number | null | undefined, digits?: number): string;
  /** "3 h", "2 days" since a moment, or "—". */
  ago(iso: string | null | undefined): string;
  /** A shop day (YYYY-MM-DD) as "12 Oct" / "Mon 12 Oct". */
  day(ymd: string, weekday?: boolean): string;
  /** A weekday's short name (0 = Sunday). */
  weekday(i: number): string;
}

export function fmtOf(view: AdminView, currency: string, now: Date): Fmt {
  const money: Money = moneyOf(currency, view.locale);
  const d = view.dict;
  const tt = (key: string, vars?: Record<string, string | number>) => t(d, key, vars);
  const short = (minor: number) => {
    const unit = 10 ** money.digits;
    try {
      return new Intl.NumberFormat(view.locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1, numberingSystem: 'latn' }).format(minor / unit);
    } catch {
      return formatMoney(minor, money);
    }
  };
  const dayFmt = new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' });
  const dayWk = new Intl.DateTimeFormat(view.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' });
  const wk = new Intl.DateTimeFormat(view.locale, { weekday: 'short', timeZone: 'UTC' });
  return {
    lang: view.lang,
    locale: view.locale,
    timeZone: view.timeZone,
    currency,
    dict: d,
    now,
    t: tt,
    n: (x) => formatNumber(Math.round(x), view.locale),
    money: (minor) => formatMoney(minor, money),
    short,
    pct: (x, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`),
    ago: (iso) => {
      const a = ageOf(iso ?? null, now);
      if (!a) return '—';
      return a.unit === 'now' ? tt('dash.age.now') : tt(`dash.age.${a.unit}`, { n: formatNumber(a.n, view.locale) });
    },
    day: (ymd, weekday) => (weekday ? dayWk : dayFmt).format(new Date(`${ymd}T12:00:00Z`)),
    // 2023-01-01 was a Sunday.
    weekday: (i) => wk.format(new Date(Date.UTC(2023, 0, 1 + i, 12))),
  };
}
