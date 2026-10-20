// PR 549, 551, 552 — how a place name and a typed address are compared. One normal form for names and lines, so the
// resolver (PR 551) and the autocomplete (PR 552) always agree:
// - Bengali digits become 0-9; the Bengali letters that are typed in two ways (ড় / ড + nukta, য় / য + nukta) become one;
// - lower case, "&" is "and", apostrophes go, every other mark is a space;
// - the loose key ("fold") is for the spellings people actually type: Gabtoli = Gabtali, Sreepur = Sripur, gonj = ganj,
//   গাবতলী = গাবতলি. It is an exact comparison of two folded keys, never a similarity score (fuzzy scoring turns
//   "Sadar" into sixty wrong hits).

const BN_ZERO = 0x09e6;

/** Bengali digits (০-৯) as 0-9; everything else unchanged. */
export function asciiDigits(s: string): string {
  return s.replace(/[\u09E6-\u09EF]/g, (c) => String(c.charCodeAt(0) - BN_ZERO));
}

/** The Bengali letters with a nukta written as one letter (ড় ঢ় য়). */
function joinNukta(s: string): string {
  return s.replace(/\u09A1\u09BC/g, '\u09DC').replace(/\u09A2\u09BC/g, '\u09DD').replace(/\u09AF\u09BC/g, '\u09DF');
}

/** The normal form of a typed line or a name: lower case words of letters and digits, single spaces. */
export function normalize(s: string | null | undefined): string {
  return joinNukta(asciiDigits(String(s ?? '')))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A place name's matching key: its normal form without a bracketed note ("Nayanpur (Sreepur)" → "nayanpur"). */
export function nameKey(name: string): string {
  return normalize(String(name).replace(/\([^)]*\)/g, ' '));
}

/**
 * The loose key of a normalized key. Latin: sh→s, ph→f, z→j, ee→i, oo→u, y→i, o→a (double letters are kept: Badda is
 * not Boda). Bengali: long and short i / u as one (ী = ি, ঈ = ই, ূ = ু, ঊ = উ), ণ as ন, ষ as শ.
 */
export function fold(key: string): string {
  return key
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/z/g, 'j')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/y/g, 'i')
    .replace(/o/g, 'a')
    .replace(/\u09C0/g, '\u09BF')
    .replace(/\u0988/g, '\u0987')
    .replace(/\u09C2/g, '\u09C1')
    .replace(/\u098A/g, '\u0989')
    .replace(/\u09A3/g, '\u09A8')
    .replace(/\u09B7/g, '\u09B6');
}

/** The words of a typed line, in its normal form. */
export function words(s: string | null | undefined): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

/** True for text with Bengali letters in it. */
export const hasBengali = (s: string): boolean => /[\u0980-\u09FF]/.test(s);
