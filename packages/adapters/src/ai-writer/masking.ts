// S15 · PR 311 (Blueprint A5.1–A5.4, FAQ 55) — the masking layer applied before anything leaves the server.
// `liveAiWriter` (live.ts) runs every assembled prompt through `maskPersonalData` right before handing it to a
// provider's `Completer` — the one place in the whole adapter where text is about to leave the server over HTTP,
// whichever provider or data class (PR 310) routed it there. It is a last, transport-level safety net on top of
// PR 310's provider routing, never a replacement for it: PR 310 decides WHICH company may see a job; this decides
// what a phone number or e-mail address inside the TEXT looks like once it gets there. It never runs on the
// mock/practice writer (nothing ever leaves the server there) and never touches a drafted ANSWER that comes back —
// only what we SEND out.
//
// Two layers, because they serve different jobs (A5.3's "after names and phone numbers are stripped"):
//  - `maskPersonalData` is pattern-based and runs on every live call with no extra information: it catches a
//    Bangladeshi phone number or an e-mail address wherever one appears in the assembled prompt text, a safety net
//    that costs nothing and needs nothing wired up to be useful from day one.
//  - `maskKnownIdentity` is exact-value stripping for a future job that is handed an actual customer record (a
//    review's author, a rider note's customer) — it removes the one name/phone/e-mail/address that job actually
//    knows about, which catches a name no pattern ever could. No caller uses it yet (no job today sends real
//    customer content to a live model — PR 311 builds the layer ahead of the S14/S22 jobs that will), so it is kept
//    ready and fully tested, the same honestly-inert-until-wired shape PR 305's keep-on switch and PR 307's model
//    pick had before any AI key existed.

export interface MaskResult {
  /** The text with anything it recognised replaced by a plain bracketed token. */
  masked: string;
  /** How many replacements were made, for a future audit/diary note — 0 means nothing was found. */
  redactions: number;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// A Bangladeshi mobile number however it is typed: an optional international "00" prefix, an optional "+880"/"880"
// country code, or a bare leading "0", then 1[3-9] and eight more digits, the digits optionally broken up by
// spaces, dots or hyphens (the shop never cares how a number was typed — packages/delivery/src/phone.ts strips the
// same punctuation when it reads one back).
const BD_PHONE_RE = /(?:(?:00)?\+?880[-.\s]?|0)?1[3-9](?:[-.\s]?\d){8}/g;

function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/** Pattern-based safety net: strips every e-mail address and Bangladeshi-shaped phone number it can find. */
export function maskPersonalData(text: string): MaskResult {
  let redactions = 0;
  let masked = text.replace(EMAIL_RE, () => {
    redactions += 1;
    return '[EMAIL]';
  });
  masked = masked.replace(BD_PHONE_RE, (match) => {
    // A full match is "1[3-9]" plus eight more digits, i.e. nine digits once punctuation is stripped — anything
    // shorter is a stray product code or a price, not a phone number, and is left exactly as it was.
    if (countDigits(match) < 9) return match;
    redactions += 1;
    return '[PHONE]';
  });
  return { masked, redactions };
}

/** One job's own customer record: whichever fields it has are stripped from the text, the rest are left out. */
export interface KnownIdentity {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

const IDENTITY_TOKENS: ReadonlyArray<readonly [keyof KnownIdentity, string]> = [
  ['name', '[CUSTOMER]'],
  ['phone', '[PHONE]'],
  ['email', '[EMAIL]'],
  ['address', '[ADDRESS]'],
];

/**
 * Exact-value stripping for a job that already holds the one customer record it is about. Only a value at least
 * three characters long is stripped, so a stray initial or a short honorific is left alone rather than mangling
 * unrelated text; matching is case-insensitive since a name or an address is rarely typed back exactly as stored.
 */
export function maskKnownIdentity(text: string, identity: KnownIdentity): MaskResult {
  let redactions = 0;
  let masked = text;
  for (const [field, token] of IDENTITY_TOKENS) {
    const value = identity[field]?.trim();
    if (!value || value.length < 3) continue;
    const pattern = new RegExp(value.replace(ESCAPE_RE, '\\$&'), 'gi');
    masked = masked.replace(pattern, () => {
      redactions += 1;
      return token;
    });
  }
  return { masked, redactions };
}
