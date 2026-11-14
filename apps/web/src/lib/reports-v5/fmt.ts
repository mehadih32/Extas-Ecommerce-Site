// S28 · PR 714-717 — how the v5 report pages write numbers: the shop's money, Western digits, the admin's locale.
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { CountFormat } from '@/lib/admin-lumen/model';

export interface ReportFmt {
  amount: (minor: number) => string;
  /** Money or "not known" for null. */
  maybe: (minor: number | null, unknown: string) => string;
  num: (n: number) => string;
  /** A fraction as a percentage with one decimal (0.123 → "12.3%"). */
  pct: (fraction: number) => string;
  /** A percentage already in % (12.3 → "12.3%"). */
  pctOf: (v: number | null) => string;
  day: (ymd: string) => string;
  dayShort: (ymd: string) => string;
  format: Extract<CountFormat, { kind: 'money' }>;
  digits: number;
}

export function makeFmt(locale: string, currency: string): ReportFmt {
  const money = moneyOf(currency, locale);
  const dayWith = (o: Intl.DateTimeFormatOptions) => (ymd: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T12:00:00Z`));
    } catch {
      return ymd;
    }
  };
  const one = (v: number) => {
    try {
      return new Intl.NumberFormat(locale, { numberingSystem: 'latn', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
    } catch {
      return String(v);
    }
  };
  return {
    amount: (minor) => formatMoney(minor, money),
    maybe: (minor, unknown) => (minor === null ? unknown : formatMoney(minor, money)),
    num: (n) => formatNumber(n, locale),
    pct: (f) => `${one(f * 100)}%`,
    pctOf: (v) => (v === null ? '—' : `${one(v)}%`),
    day: dayWith({ day: 'numeric', month: 'short', year: 'numeric' }),
    dayShort: dayWith({ day: 'numeric', month: 'short' }),
    format: { kind: 'money', locale, currency, digits: money.digits },
    digits: money.digits,
  };
}
