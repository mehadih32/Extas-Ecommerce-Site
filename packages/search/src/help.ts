// PR 72 (follow-up 73) — help pages in search (demo 07-help-search.js helpMatch): the owner's "If I type 'delivery'
// nothing shows; 'return policy' — nothing". Each help page has words that find it (`search.help.keywords`: English,
// Banglish, Bengali, common misspellings) besides its own title. A keyword is a word or a phrase; it matches whole
// words in a row, any case, with small slips forgiven ("delivary", "retun", "exchnge") — but a word that is a real word
// of something else (another help word, or a product word such as "polo") is never "corrected". Weak words ("policy")
// still find pages, at a quarter of the weight, so a more exact word wins. Pages scoring under half the best are left
// out. The query's words a page used are returned, so the products can be searched again without them ("polo
// delivery" → the delivery page, and the polos). Pure: no database.
import type { SearchMatchSettings } from '@extas/settings';
import { letters, slips, words } from './text';

export interface HelpEntry {
  /** The help page (its slug). */
  id: string;
  /** Words and phrases that find it (its title among them). */
  keywords: readonly string[];
}

export interface HelpHit {
  id: string;
  score: number;
}

export interface HelpMatch {
  hits: HelpHit[];
  /** Positions of the query's words that matched a help page. */
  used: Set<number>;
  /** The query's words (as search reads them). */
  words: string[];
}

interface Index {
  rows: Array<{ id: string; kws: string[][] }>;
  vocab: Set<string>;
  weak: Set<string>;
}

function indexOf(entries: readonly HelpEntry[], weak: readonly string[]): Index {
  const vocab = new Set<string>();
  const rows = entries.map((e) => {
    const kws = e.keywords.map(words).filter((k) => k.length);
    for (const k of kws) for (const w of k) vocab.add(w);
    return { id: e.id, kws };
  });
  return { rows, vocab, weak: new Set(weak.flatMap(words)) };
}

/** 2 = the same word, 1 = a small slip (or, for the last word while typing, the start of the keyword), 0 = no. */
function tokEq(q: string, k: string, isLast: boolean, ix: Index, productWords: ReadonlySet<string>, m: Pick<SearchMatchSettings, 'oneTypoAt' | 'twoTyposAt'>): number {
  if (q === k) return 2;
  if (ix.vocab.has(q) || productWords.has(q)) return 0;
  const lq = letters(q);
  const lk = letters(k);
  if (isLast && lq >= m.oneTypoAt && lk > lq && k.startsWith(q)) return 1;
  if (lq < m.oneTypoAt || lk < m.oneTypoAt || Math.max(lq, lk) <= m.oneTypoAt) return 0;
  const cap = Math.max(lq, lk) > m.twoTyposAt ? 2 : 1;
  return slips(q, k, cap) <= cap ? 1 : 0;
}

/** The help pages a query finds, best first. `productWords`: the shop's product vocabulary (never corrected). */
export function matchHelp(
  q: string,
  entries: readonly HelpEntry[],
  weak: readonly string[],
  productWords: ReadonlySet<string>,
  m: Pick<SearchMatchSettings, 'oneTypoAt' | 'twoTyposAt'>,
): HelpMatch {
  const T = words(q);
  if (!T.length) return { hits: [], used: new Set(), words: T };
  const ix = indexOf(entries, weak);
  const out: Array<{ id: string; score: number; used: Set<number> }> = [];
  for (const row of ix.rows) {
    let best = 0;
    let sum = 0;
    const used = new Set<number>();
    for (const K of row.kws) {
      for (let i = 0; i + K.length <= T.length; i++) {
        let s = 0;
        let ok = true;
        for (let j = 0; j < K.length; j++) {
          const v = tokEq(T[i + j]!, K[j]!, i + j === T.length - 1, ix, productWords, m);
          if (!v) {
            ok = false;
            break;
          }
          s += ix.weak.has(K[j]!) ? v / 4 : v;
        }
        if (!ok) continue;
        s += K.length - 1;
        for (let u = 0; u < K.length; u++) used.add(i + u);
        sum += s;
        if (s > best) best = s;
      }
    }
    if (best > 0) out.push({ id: row.id, score: best + (sum - best) / 10, used });
  }
  if (!out.length) return { hits: [], used: new Set(), words: T };
  // stable: equal scores keep the entries' own order
  out.sort((a, b) => b.score - a.score);
  const top = out[0]!.score;
  const kept = out.filter((x) => x.score >= top * 0.5);
  const used = new Set<number>();
  for (const x of kept) for (const u of x.used) used.add(u);
  return { hits: kept.map((x) => ({ id: x.id, score: x.score })), used, words: T };
}

/** The query without the words a help page used ("polo delivery" → "polo"), or '' when nothing is left. */
export function restAfterHelp(m: HelpMatch): string {
  return m.words.filter((_, i) => !m.used.has(i)).join(' ');
}

/** S12 · PR 248 — one line a found help page can answer with: its text, and the words that point at it. */
export interface HelpLine {
  text: string;
  /** A live rule's key and its own words, a question's words, a way to pay's names (each read as search reads words). */
  keys: readonly string[];
}

/**
 * S12 · PR 248 — the line of a found help page that answers this query: the live rule (or question, or way to pay) that
 * shares the most words with it — "cod" on the delivery page answers with the Cash on Delivery rule's own line, not the
 * page's first one. A word several lines share counts less (shared by two: half); a weak word counts a quarter; the
 * last word may be cut short while typing (3+ letters). Equal lines keep the page's order. No line shares a word: null
 * (the page's first line answers, as before).
 */
export function pickHelpLine(q: string, lines: readonly HelpLine[], weak: readonly string[] = []): string | null {
  const T = words(q);
  if (!T.length) return null;
  const W = new Set(weak.flatMap(words));
  const sets = lines.map((l) => new Set(l.keys.flatMap(words)));
  const hitOf = (K: Set<string>, t: string, last: boolean) => (K.has(t) ? 1 : last && letters(t) >= 3 && [...K].some((k) => k.startsWith(t)) ? 0.5 : 0);
  // a word most lines share ("delivery" on the delivery page) says less than one only this line has ("eid")
  const shared = T.map((t, i) => sets.filter((K) => hitOf(K, t, i === T.length - 1) > 0).length || 1);
  let best: string | null = null;
  let top = 0;
  sets.forEach((K, n) => {
    let s = 0;
    T.forEach((t, i) => {
      const hit = hitOf(K, t, i === T.length - 1) / shared[i]!;
      s += W.has(t) ? hit / 4 : hit;
    });
    if (s > top) {
      top = s;
      best = lines[n]!.text;
    }
  });
  return best;
}
