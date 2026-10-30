// ERP amounts (decimal text, as the ERP sends them) in the shop's minor units. Used by the webhook worker (PR 196), the
// v6 event pull (PR 608) and the buying price (PR 609); kept in its own file so none of them imports another.

/** An ERP decimal (text) in minor units of a currency, rounded half up at the currency's last digit. */
export function decimalToMinor(text: string | null, digits: number): number | null {
  if (text === null) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(digits + 1, '0');
  let minor = Number(m[2]) * 10 ** digits + Number(frac.slice(0, digits) || '0');
  if (Number(frac[digits]) >= 5) minor += 1;
  return m[1] ? -minor : minor;
}
