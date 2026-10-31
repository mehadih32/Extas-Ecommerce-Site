// S18 · PR 383 (Blueprint F2 q27; SET-01) — empty placeholders never reach the live site. The footer once shipped
// "[your DBID number]", "[number]" and "[support email]"; the owner's legal numbers, contacts and social links are
// owner data typed in later, so a filler value ("TBD", "xxx", "123456", "[…]") could be saved by mistake. This one
// check is used where such a value is saved (the admin's Store details refuses it) and where the shop reads it (a
// caught value is dropped, so the line is simply left out, as when nothing is set).

/** The setting groups whose values the shop prints as the owner's own details. */
export const PLACEHOLDER_GUARDED_PREFIXES = ['legal.', 'contact.', 'social.'] as const;

export const isPlaceholderGuarded = (key: string): boolean => PLACEHOLDER_GUARDED_PREFIXES.some((p) => key.startsWith(p));

const PATTERNS: readonly RegExp[] = [
  /\[[^\]]*\]/, // [your DBID number], [number]
  /\{\{[^}]*\}\}/, // {{dbid}}
  /^<[^>]+>$/, // <dbid>
  /^(tbd|tba|n\/?a|n\.a\.?|na|todo|none|null|undefined|placeholder|sample|example|test|dummy|lorem\b.*)$/i,
  /^[x\-–—.\s?]+$/i, // xxx, XXXX-XXXX, ..., —, ?
  /^0+$/, // 000000
  /^(0?123456789?|1234567890|12345678|1234567|123456|12345)$/,
  /\byour\b.*\b(here|number|name|email|address|id)\b/i, // "your number here"
];

function plainLooksLikePlaceholder(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  return PATTERNS.some((p) => p.test(v));
}

/** True when a text (or any language of a two-language text) is a filler, not a real value. */
export function looksLikePlaceholder(v: unknown): boolean {
  if (typeof v === 'string') return plainLooksLikePlaceholder(v);
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.values(v as Record<string, unknown>).some((x) => typeof x === 'string' && plainLooksLikePlaceholder(x));
  return false;
}

/** The value as the shop should print it: a guarded key's filler becomes `empty` (the line is left out). */
export function withoutPlaceholder<T>(key: string, value: T, empty: T): T {
  return isPlaceholderGuarded(key) && looksLikePlaceholder(value) ? empty : value;
}

/**
 * PR 384 — a stand-in left inside a longer text ("Write to [support email]", "Call [number]"): the owner's own words
 * on the help pages are refused with one. Narrower than `looksLikePlaceholder`: a long text may use brackets for real.
 */
const STAND_IN = /\[(?:your\b[^\]]*|number|phone|e-?mail|support email|address|name|dbid|trade licen[cs]e|bin|link|url|date|amount|price|days?|hours?)\]|\{\{[^}]*\}\}|\b(?:lorem ipsum|TBD|TBA)\b/i;

export const hasStandIn = (text: string): boolean => STAND_IN.test(text);
