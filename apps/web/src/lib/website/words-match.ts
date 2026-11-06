// S02 · PR 79 (register "Front-end editing: open the page, change a label, publish"; BACKEND-ARCHITECTURE WEB-05) —
// which shop words a page shows: the edit panel on the shop page sends the texts it sees (text, placeholders, labels for
// screen readers) and gets back every dictionary word whose text, in the page's language, is one of them — the owner's
// word when he has one, else the shop's; a {slot} matches whatever the shop filled in. Pure: no database.
import type { LabelOverrides } from '../shop/dict';
import { defaultWord, WORD_KEYS, wordRow, type WordLang, type WordRow } from './words';

/** The most texts one page may send (a long page has a few hundred). */
export const PAGE_TEXTS_MAX = 3000;
/** The longest text looked at (a word is at most 300 letters, filled slots make it longer). */
export const PAGE_TEXT_LEN = 600;

/** One text as the page shows it: spaces collapsed, ends trimmed. */
export const normText = (s: string): string => s.replace(/\s+/g, ' ').trim();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A word with at least two letters outside its {slots} (a bare "{v}" or "·" would match anything). */
const wordy = (s: string) => (s.replace(/\{\w+\}/g, '').match(/\p{L}/gu)?.length ?? 0) >= 2;

export interface PageWord extends WordRow {
  /** The page's texts this word showed as. */
  seen: string[];
}

/** Every word the page shows, in dictionary order, with the texts it showed as. */
export function matchWords(labels: LabelOverrides | null, lang: WordLang, texts: readonly string[]): PageWord[] {
  const page = [...new Set(texts.map((t) => normText(t).slice(0, PAGE_TEXT_LEN)).filter(Boolean))].slice(0, PAGE_TEXTS_MAX);
  const exact = new Set(page);
  const out: PageWord[] = [];
  for (const key of WORD_KEYS) {
    // a "|" splits a word over two lines in the shop ("Cash on| Delivery"): each piece is looked for on its own
    const pieces = normText(labels?.[key]?.[lang] || defaultWord(lang, key))
      .split('|')
      .map(normText)
      .filter(wordy);
    const seen = new Set<string>();
    for (const piece of pieces) {
      if (!/\{\w+\}/.test(piece)) {
        if (exact.has(piece)) seen.add(piece);
        continue;
      }
      const re = new RegExp(`^${piece.split(/\{\w+\}/).map(escape).join('.+?')}$`, 'su');
      for (const t of page) if (re.test(t)) seen.add(t);
    }
    if (seen.size) out.push({ ...wordRow(key, labels), seen: [...seen] });
  }
  return out;
}
