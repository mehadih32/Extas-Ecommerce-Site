// SIM-F-048 (PR 179 follow-up) — a Bengali address in Latin letters, for the line printed under it on the courier
// sticker: many riders and hub staff read Latin letters faster than Bengali script. A plain letter-by-letter reading,
// the way people write Bengali in Latin letters ("মাস্টারপাড়া, গাবতলী, বগুড়া" → "Mastarpara, Gabtoli, Bogura"),
// never a translation; the Bengali address stays the one that counts. Pure, no database.
//
// The inherent vowel of a consonant is read as "o", except at the end of a word, before a consonant that ends the
// word's sound cluster after a vowel ("মিরপুর" → "Mirpur"), or where a vowel sign or the hasanta follows. Bengali digits
// become Western digits. Text with no Bengali letter comes back as it is.

/** The script's own letters in Latin (a reading table, not business values). */
const VOWELS: Record<string, string> = { 'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou' };
const SIGNS: Record<string, string> = { 'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou' };
const CONSONANT_TABLE: Record<string, string> = {
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
  'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
  'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y',
};
/** Keys in NFC (ড় is ড + nukta there), the form `letters` gives. */
const CONSONANTS: Record<string, string> = Object.fromEntries(Object.entries(CONSONANT_TABLE).map(([k, v]) => [k.normalize('NFC'), v]));
const MARKS: Record<string, string> = { 'ং': 'ng', 'ঃ': 'h', 'ঁ': '', 'ৎ': 't' };
const HASANTA = '্';
const NUKTA = '়';
const BENGALI = /[ঀ-৿]/;

/** Splits into letters, joining a consonant with its nukta (ড + ় = ড়). */
function letters(text: string): string[] {
  const out: string[] = [];
  for (const ch of text.normalize('NFC')) {
    if (ch === NUKTA && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

const isConsonant = (c: string | undefined): boolean => c !== undefined && c in CONSONANTS;
/** A consonant that carries no vowel sign and no hasanta after it. */
const bare = (cs: readonly string[], i: number): boolean => isConsonant(cs[i]) && !(cs[i + 1] !== undefined && (cs[i + 1]! in SIGNS || cs[i + 1] === HASANTA));

/** Nothing but marks (ং, ঁ …) after this letter in the word. */
const endsAt = (cs: readonly string[], i: number): boolean => !cs.slice(i + 1).some((x) => isConsonant(x) || x in VOWELS);

/** One word (Bengali letters only) in Latin letters. */
function word(cs: readonly string[]): string {
  let out = '';
  let vowelBefore = false;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    if (c in VOWELS) {
      out += VOWELS[c];
      vowelBefore = true;
    } else if (c in SIGNS) {
      out += SIGNS[c];
      vowelBefore = true;
    } else if (c in MARKS) {
      out += MARKS[c];
    } else if (c === HASANTA) {
      vowelBefore = false;
    } else if (isConsonant(c)) {
      // য after a hasanta (য-ফলা) is a "y"
      const follows = cs[i - 1] === HASANTA;
      out += follows && c === 'য' ? 'y' : CONSONANTS[c];
      if (!bare(cs, i)) continue;
      // য় after a vowel glides ("সৈয়দপুর" → Soiydpur): no vowel of its own
      if (c === 'য়'.normalize('NFC') && vowelBefore) continue;
      // ং, ঃ or ঁ right after: the vowel is heard ("নং" → Nong)
      if (cs[i + 1] !== undefined && cs[i + 1]! in MARKS) {
        out += 'o';
        vowelBefore = true;
        continue;
      }
      // the inherent vowel: kept, except at the word's end, and after a vowel before a consonant that is not the
      // word's last sound ("মিরপুর" → Mirpur, "সদর" → Sodor)
      const drop = endsAt(cs, i) || (vowelBefore && isConsonant(cs[i + 1]) && !(bare(cs, i + 1) && endsAt(cs, i + 1)));
      if (!drop) {
        out += 'o';
        vowelBefore = true;
      } else vowelBefore = false;
    } else {
      out += c;
    }
  }
  return out;
}

/** Bengali digits as Western digits. */
const digits = (s: string): string => s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));

/**
 * A Bengali address in Latin letters (each word capitalised), or null when it has no Bengali letter — then the address
 * is already in Latin letters and needs no second line.
 */
export function bengaliToLatin(text: string | null | undefined): string | null {
  if (!text || !BENGALI.test(text)) return null;
  const out = digits(text).replace(/[ঀ-৿]+/g, (run) => {
    const w = word(letters(run));
    return w ? w[0]!.toUpperCase() + w.slice(1) : w;
  });
  return out.replace(/\s+/g, ' ').trim() || null;
}
