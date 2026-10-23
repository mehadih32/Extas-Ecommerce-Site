// PR 72 — the search adapter: one call, `searchCatalogue`, answers with the products and categories a query finds, in
// order. Which engine answers (`search.engine.mode`):
// - Meilisearch, when the server has it (MEILI_URL and its key), the mode is 'auto' and its index is current — the
//   index's version (written by the indexer, indexer.ts) equals the catalogue's version now (docs.ts). The query goes
//   in with its phrases joined; when every word together finds nothing, again without the general words (match.ts
//   step 4). Meilisearch's own typo and prefix rules are set from `search.match`, its synonyms from `search.words`.
// - PostgreSQL otherwise — CI, a computer, a server without Meilisearch, an index still catching up after a change, or
//   Meilisearch slow or down (`search.engine.timeoutMs`): the shop's own catalogue, read into a word list kept for
//   `search.engine.cacheSeconds`, searched by match.ts.
// When nothing is found, "did you mean" and "what some of the words find" are worked out on the word list.
import type { PrismaClient } from '@extas/db/client';
import type { Key, SearchEngineSettings, SearchMatchSettings, SearchWordsSettings, Value } from '@extas/settings';
import { catalogueVersion, readDocTexts, toSearchDoc } from './docs';
import { didYouMean, matchDocs, partialMatch, queryWords, vocabulary, wordLists, type SearchDoc, type WordLists } from './match';
import { Meili, type MeiliConfig } from './meili';
import { words } from './text';

export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface SearchDeps {
  db: Pick<PrismaClient, 'product' | 'category' | 'colour'>;
  settings: SettingsReader;
  /** The server's Meilisearch (meiliFromEnv), or null. */
  meili: MeiliConfig | null;
  /** Clock, for tests. */
  now?: () => number;
}

export interface SearchRules {
  engine: SearchEngineSettings;
  match: SearchMatchSettings;
  words: SearchWordsSettings;
}

export async function readRules(settings: SettingsReader, storeId: number): Promise<SearchRules> {
  const [engine, match, w] = await Promise.all([
    settings.value('search.engine', { storeId }),
    settings.value('search.match', { storeId }),
    settings.value('search.words', { storeId }),
  ]);
  return { engine, match, words: w };
}

/** What the version covers besides the catalogue: the rules Meilisearch is set up with. */
export const versionRules = (r: SearchRules) => ({ match: r.match, words: r.words });

export const productIndex = (prefix: string, storeId: number) => `${prefix}-${storeId}`;
export const metaIndex = (prefix: string) => `${prefix}-meta`;

// ---- the word list (PostgreSQL), kept per store ----

interface Kept {
  at: number;
  key: string;
  version: string;
  docs: SearchDoc[];
  vocab: Set<string>;
  lists: WordLists;
}

const kept = new Map<number, Kept>();
const fresh = new Map<number, { at: number; version: string; ok: boolean }>();

/** Forget what was kept (tests; a changed setting is picked up after `cacheSeconds` anyway). */
export function forgetSearchCache(): void {
  kept.clear();
  fresh.clear();
}

async function wordList(deps: SearchDeps, storeId: number, rules: SearchRules): Promise<Kept> {
  const now = deps.now?.() ?? Date.now();
  const key = JSON.stringify(rules.words);
  const k = kept.get(storeId);
  if (k && k.key === key && now - k.at < rules.engine.cacheSeconds * 1000) return k;
  const [version, texts] = await Promise.all([catalogueVersion(deps.db, storeId, versionRules(rules)), readDocTexts(deps.db, storeId)]);
  const docs = texts.map(toSearchDoc);
  const next: Kept = { at: now, key, version, docs, vocab: vocabulary(docs), lists: wordLists(rules.words) };
  kept.set(storeId, next);
  return next;
}

/** Whether Meilisearch's index for the store is current (its version is the catalogue's), kept like the word list. */
async function meiliCurrent(deps: SearchDeps, m: Meili, storeId: number, rules: SearchRules, version: string): Promise<boolean> {
  const now = deps.now?.() ?? Date.now();
  const f = fresh.get(storeId);
  if (f && f.version === version && now - f.at < rules.engine.cacheSeconds * 1000) return f.ok;
  const meta = await m.getDocument<{ v?: string }>(metaIndex(rules.engine.indexPrefix), storeId);
  const ok = meta?.v === version;
  fresh.set(storeId, { at: now, version, ok });
  return ok;
}

export interface CatalogueAnswer {
  engine: 'meilisearch' | 'postgres';
  /** Product ids, best first. */
  products: string[];
  /** Category ids, best first. */
  categories: string[];
  /** The words the answer was found with, and the general words left out to find anything. */
  used: string[];
  dropped: string[];
  /** Nothing found: the nearest words the shop knows, or null. */
  suggestion: string | null;
  /** Nothing found for all the words: what some of them find. */
  partial: { words: string[]; products: string[] } | null;
  /** Every word the shop's products and categories carry (the help matcher never "corrects" one of these). */
  vocab: ReadonlySet<string>;
}

const productIds = (docs: readonly SearchDoc[], ids: readonly string[]) => {
  const products = new Set(docs.filter((d) => d.kind === 'product').map((d) => d.id));
  return ids.filter((id) => products.has(id));
};

async function viaMeili(m: Meili, rules: SearchRules, storeId: number, ws: string[], general: (w: string) => boolean) {
  const index = productIndex(rules.engine.indexPrefix, storeId);
  const ask = async (q: string, kind: 'product' | 'category', limit: number) =>
    (await m.search(index, { q, filter: `kind = "${kind}"`, limit, attributesToRetrieve: ['id'], matchingStrategy: 'all' })).map((h) => String(h.id));
  const q = ws.join(' ');
  let used = ws;
  let products = await ask(q, 'product', rules.engine.maxResults);
  if (!products.length) {
    const keep = ws.filter((w) => !general(w));
    if (keep.length && keep.length < ws.length) {
      used = keep;
      products = await ask(keep.join(' '), 'product', rules.engine.maxResults);
    }
  }
  const categories = await ask(used.join(' '), 'category', rules.engine.maxResults);
  return { products, categories, used };
}

/** The products and categories a query finds, best first, from Meilisearch or PostgreSQL. */
export async function searchCatalogue(deps: SearchDeps, storeId: number, q: string, opts: { log?: (line: string) => void } = {}): Promise<CatalogueAnswer> {
  const rules = await readRules(deps.settings, storeId);
  const list = await wordList(deps, storeId, rules);
  const ws = queryWords(q, list.lists);
  const empty: CatalogueAnswer = { engine: 'postgres', products: [], categories: [], used: ws, dropped: [], suggestion: null, partial: null, vocab: list.vocab };
  if (!ws.length) return empty;

  let answer: Omit<CatalogueAnswer, 'suggestion' | 'partial' | 'vocab'> | null = null;
  if (rules.engine.mode === 'auto' && deps.meili) {
    const m = new Meili(deps.meili, rules.engine.timeoutMs);
    try {
      // the index must hold exactly what the word list holds, so both engines know the same products at any moment
      if (await meiliCurrent(deps, m, storeId, rules, list.version)) {
        const general = (w: string) => list.lists.general.has(w);
        const r = await viaMeili(m, rules, storeId, ws, general);
        const known = new Set(list.docs.map((d) => d.id));
        answer = {
          engine: 'meilisearch',
          products: productIds(list.docs, r.products),
          categories: r.categories.filter((id) => known.has(id)),
          used: r.used,
          dropped: ws.filter((w) => !r.used.includes(w)),
        };
      }
    } catch (e) {
      opts.log?.(`search: the search server did not answer, PostgreSQL answers (${e instanceof Error ? e.message : String(e)})`);
      answer = null;
    }
  }
  if (!answer) {
    const hits = matchDocs(list.docs.filter((d) => d.kind === 'product'), q, list.lists, rules.match);
    const cats = matchDocs(list.docs.filter((d) => d.kind === 'category'), hits.used.join(' ') || q, list.lists, rules.match);
    answer = { engine: 'postgres', products: hits.hits.slice(0, rules.engine.maxResults).map((h) => h.id), categories: cats.hits.map((h) => h.id), used: hits.used, dropped: hits.dropped };
  }
  let suggestion: string | null = null;
  let partial: CatalogueAnswer['partial'] = null;
  if (!answer.products.length) {
    suggestion = didYouMean(q, list.vocab, list.lists, rules.match);
    const p = partialMatch(list.docs.filter((d) => d.kind === 'product'), q, list.lists, rules.match);
    if (p.hits.length) partial = { words: p.words, products: p.hits.slice(0, rules.engine.maxResults).map((h) => h.id) };
  }
  return { ...answer, suggestion, partial, vocab: list.vocab };
}

/** The words of a query, for callers that show them back ("Results for …"). */
export const shownWords = (q: string) => words(q).join(' ');
