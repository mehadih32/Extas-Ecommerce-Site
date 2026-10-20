// H14 / K10 (CN-008, owner 20 Oct) — the ONE Bangladeshi mobile-number cleaner, the same rules as the approved demo
// (docs/demo/src/07-phone.js). Rule: never refuse a real number because of how it was typed.
//   1. Bengali (০-৯) or mixed digits become 0-9.
//   2. Everything that is not a digit goes (spaces, dashes, +, brackets, dots).
//   3. "00880…" loses the "00"; "880…" loses the "88" (so +880 17… → 017…).
//   4. A 12-digit number starting "00" loses one "0" (a doubled 0 typed by mistake).
//   5. A 10-digit number starting 1[3-9] gets its leading "0".
//   6. Then it must be 01[3-9] and eight more digits (the national mobile plan, not a business setting).
// The words a customer sees come from the shop dictionary (`reason` picks them); this file holds no text. Every form
// that reads a phone number uses this helper rather than its own copy (S04 checkout included).

const MOBILE = /^01[3-9]\d{8}$/;
const BN_ZERO = 0x09e6;

export type PhoneProblem = 'empty' | 'prefix' | 'short';

export interface PhoneBD {
  ok: boolean;
  /** The cleaned digits — written back into the field, so the shopper sees what we will use. */
  digits: string;
  /** 01XXX-XXXXXX when ok. */
  nice: string;
  /** +880… when ok (the form the server and an SMS gateway store). */
  e164: string;
  /** Why it is not a mobile number (null when ok). */
  reason: PhoneProblem | null;
}

/** Bengali digits as Latin digits (everything else untouched). */
export function latinDigits(raw: string): string {
  return raw.replace(/[০-৯]/g, (ch) => String(ch.charCodeAt(0) - BN_ZERO));
}

export function phoneNormalizeBD(raw: string | null | undefined): PhoneBD {
  let d = latinDigits(String(raw ?? '')).replace(/\D/g, '');
  if (d.startsWith('00880')) d = d.slice(2);
  if (d.startsWith('880')) d = d.slice(2);
  if (d.startsWith('00') && d.length === 12) d = d.slice(1);
  if (d.length === 10 && /^1[3-9]/.test(d)) d = `0${d}`;
  if (!d) return { ok: false, digits: '', nice: '', e164: '', reason: 'empty' };
  if (MOBILE.test(d)) return { ok: true, digits: d, nice: `${d.slice(0, 5)}-${d.slice(5)}`, e164: `+88${d}`, reason: null };
  const reason: PhoneProblem = d.startsWith('01') && d.length >= 3 && !/^01[3-9]/.test(d) ? 'prefix' : 'short';
  return { ok: false, digits: d, nice: '', e164: '', reason };
}
