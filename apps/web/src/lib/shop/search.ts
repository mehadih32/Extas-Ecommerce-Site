// PR 72 / 73 — one search, as the panel and the results page ask it (server only). The catalogue answers through the
// search adapter (@extas/search: Meilisearch when the server has it and its index is current, the shop's PostgreSQL
// catalogue otherwise); the help pages (follow-up 73) are matched here, live, from the pages as they read now — so a
// changed rule or page text is found at once, and a page that says "Coming soon" is never offered. As in the demo
// (07-help-search.js hs_products): the products are searched with every word; only when that finds nothing and a help
// page took some of the words are they searched again without them ("polo delivery" → the delivery page, and polos).
// Without a database (CI, a computer without one) the catalogue is empty and help still answers.
import { getPrisma } from '@extas/db/client';
import { matchHelp, meiliFromEnv, restAfterHelp, searchCatalogue, type CatalogueAnswer, type SettingsReader } from '@extas/search';
import { registry, type Key, type SearchPanelSettings, type SearchResultsSettings, type Value } from '@extas/settings';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import { readPageSettings, type ShopContext } from './context';
import { loadHelp } from './help-data';
import { HELP_SLUGS } from './help-pages';
import { helpEntries, type HelpItem } from './search-model';

const KEYS = ['search.help', 'search.match', 'search.panel', 'search.results'] as const;

/** The settings the search reads, through the shop's resolver (the registry's defaults without a database). */
function reader(): SettingsReader {
  const r = settingsResolver();
  if (r) return { value: (k, o) => r.value(k, o) };
  return { value: async <K extends Key>(k: K) => registry[k].default as Value<K> };
}

export interface SearchOutcome {
  /** The help pages that answer, best first (at most `limit.help`). */
  help: HelpItem[];
  /** All help pages that answered (the count on the results page). */
  helpCount: number;
  /** Product ids, best first. */
  products: string[];
  /** Category ids, best first. */
  categories: string[];
  /** The words the products were found with when a help page took the others ("polo"), else null. */
  rest: string | null;
  /** General words left out to find anything. */
  dropped: string[];
  suggestion: string | null;
  partial: CatalogueAnswer['partial'];
  /** The catalogue could not be searched just now (the page says so). */
  unavailable: boolean;
  panel: SearchPanelSettings;
  results: SearchResultsSettings;
}

/** Search the shop for `q` (already tidied, lib/shop/search-model queryFrom). */
export async function runSearch(c: ShopContext, q: string, opts: { helpMax: (p: SearchPanelSettings, r: SearchResultsSettings) => number }): Promise<SearchOutcome> {
  const set = await readPageSettings(KEYS, c.storeId);
  const panel = set['search.panel'];
  const results = set['search.results'];
  const none: SearchOutcome = { help: [], helpCount: 0, products: [], categories: [], rest: null, dropped: [], suggestion: null, partial: null, unavailable: false, panel, results };
  if (!q) return none;

  const settings = reader();
  const deps = process.env.DATABASE_URL ? { db: getPrisma(), settings, meili: meiliFromEnv() } : null;
  const log = (line: string) => console.warn(`shop: ${line}`);
  const ask = async (words: string): Promise<CatalogueAnswer | null> => {
    if (!deps) return null;
    try {
      return await withTimeout(searchCatalogue(deps, c.storeId, words, { log }), settingsTimeoutMs() * 3);
    } catch (e) {
      log(`search unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
      throw e;
    }
  };

  const helpSet = set['search.help'];
  const [found, help] = await Promise.all([
    ask(q).catch(() => 'down' as const),
    helpSet.on ? loadHelp(c).catch(() => null) : Promise.resolve(null),
  ]);
  if (found === 'down') return { ...none, unavailable: true };

  let hits: HelpItem[] = [];
  let answer = found;
  let rest: string | null = null;
  if (help) {
    const order = [...new Set([...help.set.topics, ...HELP_SLUGS])];
    const { entries, items } = helpEntries(help.models, order, helpSet, c.lang);
    const m = matchHelp(q, entries, helpSet.weak, found?.vocab ?? new Set(), set['search.match']);
    hits = m.hits.flatMap((h) => (items.has(h.id) ? [items.get(h.id)!] : []));
    if (hits.length && !found?.products.length) {
      const left = restAfterHelp(m);
      if (left && left !== q) {
        const again = await ask(left).catch(() => null);
        if (again?.products.length) {
          answer = again;
          rest = left;
        }
      }
    }
  }
  const a = answer;
  return {
    help: hits.slice(0, opts.helpMax(panel, results)),
    helpCount: hits.length,
    products: a?.products ?? [],
    categories: a?.categories ?? [],
    rest,
    dropped: a?.dropped ?? [],
    // a help page answered: "No results" and "Did you mean" would be wrong (demo: "never 'No results'")
    suggestion: hits.length ? null : (a?.suggestion ?? null),
    partial: hits.length ? null : (a?.partial ?? null),
    unavailable: false,
    panel,
    results,
  };
}
