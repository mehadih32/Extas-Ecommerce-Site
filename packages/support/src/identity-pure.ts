// PR 427 — identity resolution without a database (Blueprint B4.5: "the moment the customer types a phone number in the
// chat, grab it from the text"): the Bangladeshi mobile numbers in a message's words, the way customers really type them
// — Bengali or English digits, "+880", "880", "00880" or "0" in front, split by spaces, dashes, dots or brackets. Each
// is checked by the one normaliser (phoneNormalizeBD, PR 555) and answered as it is stored (+8801…). A longer run of
// digits (an order number, an amount stuck to it) is never cut down to a number.
import { maskPhone, phoneNormalizeBD, type PhoneMask } from '@extas/customers/pure';

/** Bengali digits (০-৯) as 0-9. */
const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

/** What may stand between two groups of one number: one or two of space, dash, dot, brackets. */
const JOIN = /^[\s\-.()]{1,2}$/;
/** The most digits a number written with its country code can have (00 880 1712 345678). */
const MAX_DIGITS = 15;
/** A message read for numbers is cut here (a message is at most 8000 characters). */
const MAX_CHARS = 8000;

/** Where each valid mobile number stands in `text` (start and end in the text as written), first seen first. */
export function phoneSpans(text: string | null | undefined, max = 3): { start: number; end: number; e164: string }[] {
  const s = asciiDigits((text ?? '').slice(0, MAX_CHARS));
  const groups = [...s.matchAll(/\+?\d+/g)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  const found: { start: number; end: number; e164: string }[] = [];
  for (let i = 0; i < groups.length && found.length < max; ) {
    // a group glued to a letter or another digit run on its left is part of a code, not a number
    const before = s[groups[i]!.start - 1];
    if (before && /[\p{L}\p{N}_/#]/u.test(before)) {
      i++;
      continue;
    }
    let raw = '';
    let best: { e164: string; next: number; end: number } | null = null;
    for (let j = i; j < groups.length; j++) {
      if (j > i && !JOIN.test(s.slice(groups[j - 1]!.end, groups[j]!.start))) break;
      raw += groups[j]!.text;
      if (raw.replace(/\D/g, '').length > MAX_DIGITS) break;
      const after = s[groups[j]!.end];
      const p = phoneNormalizeBD(raw);
      if (p.ok && !(after && /[\p{L}_/]/u.test(after))) best = { e164: p.e164, next: j + 1, end: groups[j]!.end };
    }
    if (best) {
      found.push({ start: groups[i]!.start, end: best.end, e164: best.e164 });
      i = best.next;
    } else i++;
  }
  return found;
}

/** The valid mobile numbers in `text`, first seen first, each once, as stored (+8801712345678); at most `max`. */
export function phonesInText(text: string | null | undefined, max = 3): string[] {
  const out: string[] = [];
  for (const f of phoneSpans(text, Number.MAX_SAFE_INTEGER)) {
    if (out.length >= max) break;
    if (!out.includes(f.e164)) out.push(f.e164);
  }
  return out;
}

/** PR 434: `text` with every mobile number in it masked the shop's one way (`customers.phoneMask`); the rest unchanged. */
export function maskPhonesInText(text: string, mask: PhoneMask): string {
  let out = '';
  let at = 0;
  for (const f of phoneSpans(text, Number.MAX_SAFE_INTEGER)) {
    out += text.slice(at, f.start) + maskPhone(f.e164, mask);
    at = f.end;
  }
  return out + text.slice(at);
}

/** A number as stored (+8801…) when it is a valid Bangladeshi mobile, else null. */
export function e164Of(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = phoneNormalizeBD(raw);
  return p.ok ? p.e164 : null;
}
