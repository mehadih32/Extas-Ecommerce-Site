// PR 72 — the matcher the PostgreSQL side of search runs (demo 21-category.js srch_run, D-015 "search understands how
// people type"), and the rules the Meilisearch side is set up with, so both give the same answers:
//   0. phrases are read as one word ("t shirt" → tshirt, "polo shirt" → polo);
//   1. every word is a word of the document, or the start of one (`search.match.prefix`), or — five letters or more —
//      inside one ("shirt" in t-shirt);
//   2. only when nothing matches so: every word within one slip of a document word (two for long words;
//      `search.match.oneTypoAt` / `twoTyposAt`), or of the start of one;
//   3. only when still nothing: each word may also be one of its other words (`search.words.synonyms`) or its singular
//      ("chinos" → chino) — those must match as written (tshirt is not a slip of shirt);
//   4. only when still nothing: the general words ("shirt", "for men", "দাম", or a slip of one) are dropped and 1–3
//      run again.
// A product's score: per word, a whole word of its name counts most, then the start of one, then anything else; ties
// keep the owner's order (rank), then the list's own order. Pure: no database.
import type { SearchMatchSettings, SearchWordsSettings } from '@extas/settings';
import { letters, norm, slips, words } from './text';

/** One thing search can find: a product or a category, its words as search reads them. */
export interface SearchDoc {
  id: string;
  kind: 'product' | 'category';
  /** Its name's words (English and Bengali). */
  name: string[];
  /** Every other word that finds it: category, garment type, colours, fabric, brand, its address. */
  more: string[];
  /** The owner's order: higher first. */
  rank: number;
}

/** The word lists, read once: normalised, phrases longest first. */
export interface WordLists {
  phrases: Array<{ from: string; to: string }>;
  synonyms: Map<string, string[]>;
  general: Set<string>;
}

export function wordLists(w: SearchWordsSettings): WordLists {
  const phrases = w.phrases
    .map((p) => ({ from: norm(p.from), to: norm(p.to).replace(/ /g, '') }))
    .filter((p) => p.from && p.to)
    .sort((a, b) => b.from.length - a.from.length);
  const synonyms = new Map<string, string[]>();
  for (const s of w.synonyms) {
    const k = norm(s.word);
    if (!k) continue;
    const alts = s.alts.map((a) => norm(a).replace(/ /g, '')).filter((a) => a && a !== k);
    synonyms.set(k, [...new Set([...(synonyms.get(k) ?? []), ...alts])]);
  }
  return { phrases, synonyms, general: new Set(w.general.map(norm).filter(Boolean)) };
}

/** The query's words after the phrases are joined. */
export function queryWords(q: string, lists: WordLists): string[] {
  let s = ` ${norm(q)} `;
  for (const p of lists.phrases) {
    const from = ` ${p.from} `;
    while (s.includes(from)) s = s.replace(from, ` ${p.to} `);
  }
  return words(s);
}

/** How many slips a word may carry. */
export function capFor(w: string, m: Pick<SearchMatchSettings, 'oneTypoAt' | 'twoTyposAt'>): number {
  const n = letters(w);
  return n >= m.twoTyposAt ? 2 : n >= m.oneTypoAt ? 1 : 0;
}

type Mode = 'exact' | 'typo';

/** A word found inside a word list: its weight (0 = not found). */
function hitIn(w: string, list: readonly string[], mode: Mode, m: SearchMatchSettings): number {
  let best = 0;
  const n = letters(w);
  const cap = mode === 'typo' ? capFor(w, m) : 0;
  for (const x of list) {
    if (x === w) return 4;
    if (m.prefix && x.startsWith(w)) best = Math.max(best, 3);
    else if (n >= 5 && x.includes(w)) best = Math.max(best, 2);
    else if (cap && best < 1) {
      // a slip of the whole word, or of its start ("panjbi" → panjabi, "hodi" → hoodie while typing)
      if (slips(w, x, cap) <= cap) best = 1;
      else if (m.prefix && n >= 5 && letters(x) > n && slips(w, Array.from(x).slice(0, n).join(''), cap) <= cap - (cap > 1 ? 1 : 0)) best = 1;
    }
  }
  return best;
}

/** A word against one document: the weight of its best hit (a hit in the name counts one more). */
function hitDoc(w: string, d: SearchDoc, mode: Mode, m: SearchMatchSettings): number {
  const inName = hitIn(w, d.name, mode, m);
  if (inName) return inName + 1;
  return hitIn(w, d.more, mode, m);
}

/** The forms a word may take in step 3: itself (it may carry a slip), its other words, its singular. */
function altsOf(w: string, lists: WordLists): string[] {
  const out = [w, ...(lists.synonyms.get(w) ?? [])];
  if (letters(w) >= 4 && w.endsWith('es')) out.push(w.slice(0, -2));
  if (letters(w) >= 4 && w.endsWith('s')) out.push(w.slice(0, -1));
  return [...new Set(out)];
}

export interface Hit {
  id: string;
  score: number;
}

function rank(docs: readonly SearchDoc[], scored: Map<string, number>): Hit[] {
  const at = new Map(docs.map((d, i) => [d.id, i]));
  const byId = new Map(docs.map((d) => [d.id, d]));
  return [...scored]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || byId.get(b.id)!.rank - byId.get(a.id)!.rank || at.get(a.id)! - at.get(b.id)!);
}

function run(docs: readonly SearchDoc[], ws: readonly string[], step: 'exact' | 'typo' | 'alts', lists: WordLists, m: SearchMatchSettings): Hit[] {
  const scored = new Map<string, number>();
  for (const d of docs) {
    let total = 0;
    let ok = true;
    for (const w of ws) {
      let s = 0;
      if (step === 'alts') {
        const alts = altsOf(w, lists);
        // the word itself may carry a slip; another word or a singular must match as written
        s = Math.max(hitDoc(w, d, 'typo', m), ...alts.slice(1).map((a) => hitDoc(a, d, 'exact', m)));
      } else s = hitDoc(w, d, step === 'typo' ? 'typo' : 'exact', m);
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) scored.set(d.id, total);
  }
  return rank(docs, scored);
}

/** Whether a word only describes (a general word, or one slip from a general word of four letters or more). */
export function isGeneral(w: string, lists: WordLists, m: SearchMatchSettings): boolean {
  if (lists.general.has(w)) return true;
  if (letters(w) < m.oneTypoAt) return false;
  for (const g of lists.general) if (letters(g) >= m.oneTypoAt && slips(w, g, 1) <= 1) return true;
  return false;
}

export interface MatchResult {
  hits: Hit[];
  /** The words the answer was found with (after phrases; without the dropped general words). */
  used: string[];
  /** General words left out to find anything (step 4). */
  dropped: string[];
}

/** Steps 1–3 for a list of words. */
export function matchWords(docs: readonly SearchDoc[], ws: readonly string[], lists: WordLists, m: SearchMatchSettings): Hit[] {
  if (!ws.length) return [];
  for (const step of ['exact', 'typo', 'alts'] as const) {
    const r = run(docs, ws, step, lists, m);
    if (r.length) return r;
  }
  return [];
}

/** The whole search over a list of documents (steps 0–4). */
export function matchDocs(docs: readonly SearchDoc[], q: string, lists: WordLists, m: SearchMatchSettings): MatchResult {
  const ws = queryWords(q, lists);
  const first = matchWords(docs, ws, lists, m);
  if (first.length || !ws.length) return { hits: first, used: ws, dropped: [] };
  const keep = ws.filter((w) => !isGeneral(w, lists, m));
  if (!keep.length || keep.length === ws.length) return { hits: [], used: ws, dropped: [] };
  return { hits: matchWords(docs, keep, lists, m), used: keep, dropped: ws.filter((w) => !keep.includes(w)) };
}

/** Every word the documents carry (the vocabulary: "did you mean" picks from it; help never "corrects" one of these). */
export function vocabulary(docs: readonly SearchDoc[]): Set<string> {
  const v = new Set<string>();
  for (const d of docs) for (const w of [...d.name, ...d.more]) v.add(w);
  return v;
}

/**
 * Nothing found: the nearest words the shop knows, one more slip allowed than search allows ("Did you mean …?").
 * Null when no word of the query has a near word, or when every word is already a known word.
 */
export function didYouMean(q: string, vocab: ReadonlySet<string>, lists: WordLists, m: SearchMatchSettings): string | null {
  const ws = queryWords(q, lists);
  let changed = false;
  const out = ws.map((w) => {
    if (vocab.has(w) || lists.general.has(w) || letters(w) < 3) return w;
    const cap = capFor(w, m) + 1;
    let best: string | null = null;
    let bestD = cap + 1;
    for (const v of vocab) {
      if (Math.abs(letters(v) - letters(w)) > cap) continue;
      const d = slips(w, v, cap);
      if (d < bestD || (d === bestD && best !== null && v < best)) {
        best = v;
        bestD = d;
      }
    }
    if (best && bestD <= cap) {
      changed = true;
      return best;
    }
    return w;
  });
  return changed ? out.join(' ') : null;
}

/**
 * Nothing found for all the words together: what each word finds alone. The words that find something, and the
 * documents found by the most of them first (then by score).
 */
export function partialMatch(docs: readonly SearchDoc[], q: string, lists: WordLists, m: SearchMatchSettings): { words: string[]; hits: Hit[] } {
  const ws = queryWords(q, lists).filter((w) => !isGeneral(w, lists, m));
  if (ws.length < 2) return { words: [], hits: [] };
  const per = ws.map((w) => matchWords(docs, [w], lists, m));
  const found = ws.filter((_, i) => per[i]!.length);
  const tally = new Map<string, { n: number; score: number }>();
  per.forEach((hits) => {
    for (const h of hits) {
      const t = tally.get(h.id) ?? { n: 0, score: 0 };
      tally.set(h.id, { n: t.n + 1, score: t.score + h.score });
    }
  });
  const scored = new Map([...tally].map(([id, t]) => [id, t.n * 1000 + t.score]));
  return { words: found, hits: rank(docs, scored) };
}
