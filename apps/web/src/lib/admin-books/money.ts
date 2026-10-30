// CN-029 qa-gate (PR 615 / 616): what a person types in a money box of the Money → Books pages, in minor units.
// - A comma groups digits, never marks decimals: 1,000 and 10,000 (thousands) and the Bangladeshi 1,00,000 (one lakh).
//   A comma anywhere else (650,5 or 1,,000) is refused, so a decimal comma is never read as a thousand.
// - Bengali digits (০–৯) are read as digits.
// - More decimals than the currency has are refused (never cut off or rounded): 650.005 is not 650.00.
// Null means "not an amount": the form shows the field as wrong and sends nothing.

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** An integer part with grouping commas: thousands (1,000,000) or the Bangladeshi lakh / crore grouping (10,00,000). */
const GROUPED = /^(\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})*,\d{3})$/;

export function typedMinor(text: string, digits: number): number | null {
  const t = [...String(text ?? '').trim()].map((c) => (BN_DIGITS.includes(c) ? String(BN_DIGITS.indexOf(c)) : c)).join('');
  const m = /^([\d,]+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const whole = m[1]!;
  if (whole.includes(',') && !GROUPED.test(whole)) return null;
  const frac = m[2] ?? '';
  if (frac.length > digits) return null;
  const minor = Number(whole.replace(/,/g, '')) * 10 ** digits + Number(frac.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(minor) ? minor : null;
}
