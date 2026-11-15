// Parity round 3, lane F — figures the way the prototype v5 writes them: the store currency's own symbol with no
// decimals ("৳1,23,450"), grouping and digits by the store's currency, Western digits always. Pure.
const GROUPING: Readonly<Record<string, string>> = { BDT: 'en-IN', INR: 'en-IN', PKR: 'en-IN', NPR: 'en-IN' }; // hardcode-ok: digit grouping of the lakh/crore currencies

const fmt = (currency: string, frac: number) =>
  new Intl.NumberFormat(GROUPING[currency] ?? 'en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', minimumFractionDigits: 0, maximumFractionDigits: frac });

/** Minor units → "৳1,23,450" (null = the page's "not known" word, passed in). */
export function moneyOf(minor: number | null, currency: string, unknown = '–'): string {
  if (minor === null) return unknown;
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2; // hardcode-ok: ISO default fraction digits
  return fmt(currency, 0).format(minor / 10 ** digits);
}

/** The currency's own symbol alone ("৳"), for words like "per ৳1". */
export function symbolOf(currency: string): string {
  return fmt(currency, 0).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
}

export const numOf = (x: number | null, frac = 0, locale = 'en-US'): string => (x === null ? '–' : new Intl.NumberFormat(locale, { numberingSystem: 'latn', maximumFractionDigits: frac }).format(x));

/** Sales per 1 unit of spend, one decimal ("৳4.2"), null while unknown. */
export const perOf = (x: number | null, currency: string): string => (x === null ? '–' : `${symbolOf(currency)}${x.toFixed(1)}`);
