// Follow-up 606 (PR 167, 176, 177) — minor units and an API's amount, by the currency's own fraction digits (taka and
// dollars 2, yen 0, dinar 3), from one place instead of a hundred written into each adapter. The couriers and gateways
// here are Bangladeshi and take taka, so their amounts are unchanged; `@extas/inventory` re-exports `currencyDigits`.
// It imports nothing, so a browser screen may read it too (`@extas/adapters/money`).

/** The currency's fraction digits (Intl's own table); 2 for a code Intl does not know. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Minor units → the major amount (12345 taka-paisa → 123.45). */
export const minorToMajor = (minor: number, currency: string): number => minor / 10 ** currencyDigits(currency);

/** Minor units → the major amount as text with all its digits (12300 → "123.00"; yen "12300"). */
export const minorToMajorText = (minor: number, currency: string): string => minorToMajor(minor, currency).toFixed(currencyDigits(currency));

/** A major amount (a number or its text) → minor units, rounded; null when it is not a number. */
export function majorToMinor(v: unknown, currency: string): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return Number.isFinite(n) ? Math.round(n * 10 ** currencyDigits(currency)) : null;
}

/** The currency the Bangladeshi couriers and gateways answer in (their own API's, not a shop setting). */
export const API_TAKA = 'BDT'; // hardcode-ok: the Bangladeshi couriers' and gateways' own currency, fixed by their APIs
