// PR 72 — how search reads words (demo 07-help-search.js hs_norm / hs_dist, 21-category.js srch_norm): lower case; the
// two ways Bengali letters with a dot (ড় ঢ় য়) can be typed made one; the invisible joiners dropped; Bengali digits read
// as 0–9; an apostrophe or a hyphen joins ("t-shirt" = tshirt, "don't" = dont); any other mark is a space. The slip
// count is the edit distance with two swapped neighbours counted as one slip ("hoddie" is one slip from hoodie).
// Pure: no database, no settings.

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** A text as search reads it: lower case, one space between words, nothing but letters and digits. */
export function norm(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[‌‍]/g, '')
    .replace(/['’`-]/g, '')
    .replace(/[^a-z0-9ঀ-৿\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a text, as search reads them. */
export function words(text: string | null | undefined): string[] {
  const n = norm(text);
  return n ? n.split(' ') : [];
}

/** Letters in a word (a Bengali vowel sign counts as one, like a Latin letter). */
export const letters = (w: string): number => Array.from(w).length;

/** Slips between two words (insert, delete, change, or two neighbours swapped), stopping early past `cap`. */
export function slips(a: string, b: string, cap: number): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > cap) return cap + 1;
  const d: number[][] = [];
  for (let i = 0; i <= x.length; i++) d[i] = [i];
  for (let j = 0; j <= y.length; j++) d[0]![j] = j;
  for (let i = 1; i <= x.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= y.length; j++) {
      const c = x[i - 1] === y[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + c);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[x.length]![y.length]!;
}

/** A short, stable fingerprint of a text (FNV-1a, base 36): tells two versions of the word lists apart. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
