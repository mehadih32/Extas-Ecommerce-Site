// PR 555 — the ONE Bangladeshi mobile-number normaliser (lessons K10; demo 07-phone.js). Never block a real number
// because of how it was typed: Bengali or mixed digits become 0-9; every non-digit goes; "00880…" drops "00"; "880…"
// drops "88"; a 12-digit "00…" drops one "0"; a 10-digit "1[3-9]…" gets its "0"; then it must be 01[3-9] + 8 digits.
// Every phone box (checkout, account / track order, ad landing, the footer's Join) calls this, never its own copy.
// It has no visible text: `reason` is a code the screen turns into its own words. Client-safe (no database):
// import it from `@extas/delivery/phone`.

/** Bengali digits (০-৯) as 0-9. */
const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

const MOBILE = /^01[3-9]\d{8}$/;
const COUNTRY = '880';
/** Where the local number splits for reading back (01712-345678). */
const SPLIT_AT = 5;

export type PhoneBD =
  | { ok: true; empty: false; /** 01712345678 */ digits: string; /** 01712-345678, said back to the customer */ nice: string; /** +8801712345678, what is stored */ e164: string }
  | { ok: false; empty: boolean; digits: string; /** 'prefix': starts 01 but not 013–019; 'length': anything else */ reason: 'empty' | 'prefix' | 'length' };

export function phoneNormalizeBD(raw: unknown): PhoneBD {
  let d = asciiDigits(String(raw ?? '')).replace(/\D/g, '');
  if (d.startsWith(`00${COUNTRY}`)) d = d.slice(2);
  if (d.startsWith(COUNTRY)) d = d.slice(2);
  if (d.startsWith('00') && d.length === 12) d = d.slice(1);
  if (d.length === 10 && /^1[3-9]/.test(d)) d = `0${d}`;
  if (!d) return { ok: false, empty: true, digits: '', reason: 'empty' };
  if (MOBILE.test(d)) return { ok: true, empty: false, digits: d, nice: `${d.slice(0, SPLIT_AT)}-${d.slice(SPLIT_AT)}`, e164: `+${COUNTRY.slice(0, 2)}${d}` };
  return { ok: false, empty: false, digits: d, reason: d.startsWith('01') && d.length >= 3 && !/^01[3-9]/.test(d) ? 'prefix' : 'length' };
}
