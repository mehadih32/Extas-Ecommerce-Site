// PR 425 follow-up (go-live gate customer 360°, 1 Nov) — the digits a number typed into the Support inbox search is
// looked for by. Before, the search kept only ASCII digits (`\D` strips ০-৯), so a number typed in Bengali digits was
// never searched as a number. Now Bengali digits count as digits, and the country code and the leading 0 are dropped,
// so ০১৭১২-৩৪৫৬৭৮, 01712 345678, +880 1712-345678 and 8801712345678 all look for 1712345678 — which a chat number
// stored in any of those forms contains.

/** The fewest digits that are searched as a number (fewer would match half the inbox). */
export const INBOX_PHONE_MIN_DIGITS = 3;

/** The search's digits (Bengali digits as 0-9), without the country code or the leading 0; '' when too few. */
export function inboxPhoneDigits(q: string): string {
  const digits = q.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');
  const core = digits.replace(/^(?:00)?880(?=1)/, '').replace(/^0+(?=1)/, '');
  return core.length >= INBOX_PHONE_MIN_DIGITS ? core : '';
}
