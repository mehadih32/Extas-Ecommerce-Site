// PR 427 — identity resolution without a database (Blueprint B4.5: "the moment the customer types a phone number in the
// chat, grab it from the text"): the Bangladeshi mobile numbers in a message's words, the way customers really type them
// — Bengali or English digits, "+880", "880", "00880" or "0" in front, split by spaces, dashes, dots or brackets. Each
// is checked by the one normaliser (phoneNormalizeBD, PR 555) and answered as it is stored (+8801…). A longer run of
// digits (an order number, an amount stuck to it) is never cut down to a number.
import { phoneNormalizeBD } from '@extas/customers/pure';

/** Bengali digits (০-৯) as 0-9. */
const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

/** What may stand between two groups of one number: one or two of space, dash, dot, brackets. */
const JOIN = /^[\s\-.()]{1,2}$/;
/** The most digits a number written with its country code can have (00 880 1712 345678). */
const MAX_DIGITS = 15;
/** A message read for numbers is cut here (a message is at most 8000 characters). */
const MAX_CHARS = 8000;

/** The valid mobile numbers in `text`, first seen first, each once, as stored (+8801712345678); at most `max`. */
export function phonesInText(text: string | null | undefined, max = 3): string[] {
  const s = asciiDigits((text ?? '').slice(0, MAX_CHARS));
  const groups = [...s.matchAll(/\+?\d+/g)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  const found: string[] = [];
  for (let i = 0; i < groups.length && found.length < max; ) {
    // a group glued to a letter or another digit run on its left is part of a code, not a number
    const before = s[groups[i]!.start - 1];
    if (before && /[\p{L}\p{N}_/#]/u.test(before)) {
      i++;
      continue;
    }
    let raw = '';
    let best: { e164: string; next: number } | null = null;
    for (let j = i; j < groups.length; j++) {
      if (j > i && !JOIN.test(s.slice(groups[j - 1]!.end, groups[j]!.start))) break;
      raw += groups[j]!.text;
      if (raw.replace(/\D/g, '').length > MAX_DIGITS) break;
      const after = s[groups[j]!.end];
      const p = phoneNormalizeBD(raw);
      if (p.ok && !(after && /[\p{L}_/]/u.test(after))) best = { e164: p.e164, next: j + 1 };
    }
    if (best) {
      if (!found.includes(best.e164)) found.push(best.e164);
      i = best.next;
    } else i++;
  }
  return found;
}

/** A number as stored (+8801…) when it is a valid Bangladeshi mobile, else null. */
export function e164Of(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = phoneNormalizeBD(raw);
  return p.ok ? p.e164 : null;
}
