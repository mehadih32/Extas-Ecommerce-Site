// PR 72 / 73 — the storefront search's pure parts (no database, no React): the words the address asked for, the
// addresses of the results page (the words kept with the category page's filters and sort, lib/shop/category-model), and
// the help pages as search entries (follow-up 73): each page that has something to say, found by its own title and the
// owner's words for it (`search.help.keywords`), with its first line as the answer under the title (demo
// 07-help-search.js hs_answer: the page's first rule line, its first question, its first paragraph, else its lede).
import type { ImageSource } from '@extas/media';
import type { HelpEntry } from '@extas/search';
import type { CategorySort, HelpSlug, SearchHelpSettings, SearchPanelSettings, ShopIcon } from '@extas/settings';
import { queryOf, type CatState, type SearchParams } from './category-model';
import type { ShopContext } from './context';
import type { HelpModel, TextBlock } from './help-pages';
import { hrefIn, type ShopLang } from './lang';
import { ROUTES } from './routes';

/** The address's word for the query. */
export const QUERY_PARAM = 'q';

/** The live suggestions' address (app/(shop)/(store)/search/suggest/route.ts). */
export const SUGGEST_PATH = `${ROUTES.search}/suggest`;

/** The longest query read from an address (a technical bound against a pasted page, not a shop choice). */
export const MAX_QUERY = 120;

/** The query an address asks for: the first `q`, spaces tidied, cut to MAX_QUERY characters. */
export function queryFrom(sp: SearchParams): string {
  const v = sp[QUERY_PARAM];
  const raw = Array.isArray(v) ? v[0] : v;
  return Array.from((raw ?? '').replace(/\s+/g, ' ').trim()).slice(0, MAX_QUERY).join('').trim();
}

/** The results page for a query (and, optionally, filters and sort in the category page's words). */
export function searchHref(lang: ShopLang, q: string, state?: { s: CatState; defaultSort: CategorySort }): string {
  const p = new URLSearchParams();
  if (q) p.set(QUERY_PARAM, q);
  const rest = state ? queryOf(state.s, state.defaultSort) : '';
  const extra = new URLSearchParams(rest.startsWith('?') ? rest.slice(1) : rest);
  for (const [k, v] of extra) p.append(k, v);
  const qs = p.toString();
  return hrefIn(lang, `${ROUTES.search}${qs ? `?${qs}` : ''}`);
}

/** A chip under an empty search box: one of the owner's popular words, or a category. */
export interface SearchChip {
  text: string;
  href: string;
}

/** The words of the search window, the panel and the results page's box (all from the shop dictionary). */
export interface SearchWords {
  title: string;
  label: string;
  placeholder: string;
  deskPlaceholder: string;
  go: string;
  close: string;
  help: string;
  products: string;
  /** "for “{q}”" */
  for: string;
  categories: string;
  popular: string;
  /** "See all results for “{q}”" */
  seeAll: string;
  /** "See all {n} results for “{q}”" */
  seeAllN: string;
  /** "No products for “{q}” yet — try another word." */
  none: string;
  noneWa: string;
  failed: string;
}

/** Everything the search window needs from the server (a client component's props: plain data only). */
export interface SearchPanelProps {
  lang: ShopLang;
  /** Bengali pages write numbers in Bengali digits (`language.bengali.digits`). */
  bnDigits: boolean;
  suggestUrl: string;
  resultsUrl: string;
  desktopPanel: boolean;
  debounceMs: number;
  minChars: number;
  phoneProducts: number;
  desktopProducts: number;
  words: SearchWords;
  popular: SearchChip[];
  categories: SearchChip[];
  /** wa.me link of "ask us on WhatsApp" with `{q}` in its message still to fill, or null without a number. */
  wa: { number: string; message: string } | null;
}

/** The owner's popular words as chips (each opens its results), and the shown categories that have styles. */
export function searchChips(
  lang: ShopLang,
  popular: readonly string[],
  cats: ReadonlyArray<{ slug: string; nameEn: string; nameBn: string | null; count: number }>,
): { popular: SearchChip[]; categories: SearchChip[] } {
  return {
    popular: popular.map((w) => w.trim()).filter(Boolean).map((w) => ({ text: w, href: searchHref(lang, w) })),
    categories: cats.filter((k) => k.count > 0).map((k) => ({ text: (lang === 'bn' && k.nameBn) || k.nameEn, href: hrefIn(lang, ROUTES.category(k.slug)) })),
  };
}

/** The search window's props, from the page's context and `search.panel` (server side; `{q}` stays to be filled). */
export function searchPanelProps(c: Pick<ShopContext, 'lang' | 'bnDigits' | 't' | 'cats' | 'vars' | 's' | 'flags'>, panel: SearchPanelSettings): SearchPanelProps {
  const t = c.t;
  const k = (key: keyof SearchWords) => t(`search.${key}`);
  const words = Object.fromEntries(
    (['title', 'label', 'placeholder', 'deskPlaceholder', 'go', 'close', 'help', 'products', 'for', 'categories', 'popular', 'seeAll', 'seeAllN', 'none', 'noneWa', 'failed'] as const).map((x) => [x, k(x)]),
  ) as unknown as SearchWords;
  const chips = searchChips(c.lang, panel.popular, c.cats);
  const number = c.s['contact.whatsapp'];
  return {
    lang: c.lang,
    bnDigits: c.bnDigits,
    suggestUrl: hrefIn(c.lang, SUGGEST_PATH),
    resultsUrl: hrefIn(c.lang, ROUTES.search),
    desktopPanel: panel.desktopPanel,
    debounceMs: panel.debounceMs,
    minChars: panel.minChars,
    phoneProducts: panel.phoneProducts,
    desktopProducts: panel.desktopProducts,
    words,
    popular: chips.popular,
    categories: chips.categories,
    wa: c.flags.whatsapp && number ? { number, message: t('search.waMessage', c.vars) } : null,
  };
}

/** Fill `{q}` and `{n}` in a search sentence. */
export const fillQ = (text: string, vars: { q?: string; n?: string | number }) =>
  text.replace(/\{(q|n)\}/g, (m, k: 'q' | 'n') => (vars[k] === undefined ? m : String(vars[k])));

/** The first words a block says (a paragraph's text, a list's first item). */
function firstText(blocks: readonly TextBlock[]): string | null {
  for (const b of blocks) {
    if (b.kind === 'p' && b.text.trim()) return b.text.trim();
    if (b.kind === 'ul' && b.items[0]?.trim()) return b.items[0].trim();
  }
  return null;
}

/** The line under a help page's title in search: the first thing the page says. */
export function helpAnswer(m: Pick<HelpModel, 'qa' | 'sections' | 'lede' | 'channels'>): string | null {
  const q = m.qa[0]?.q?.trim();
  if (q) return q;
  for (const s of m.sections) {
    const line = s.title?.trim() || firstText(s.blocks);
    if (line) return line;
  }
  if (m.channels.length) return m.channels.map((c) => c.title).join(' · ');
  return m.lede?.trim() || null;
}

export interface HelpItem {
  slug: HelpSlug;
  title: string;
  answer: string | null;
  href: string;
}

/** One product in the live suggestions: words and addresses already in the page's language. */
export interface SuggestProduct {
  id: string;
  name: string;
  href: string;
  price: string | null;
  was: string | null;
  garment: string | null;
  hex: string;
  photo: ImageSource | null;
}

/** What the panel's live suggestions get (`/search/suggest?q=`). */
export interface SuggestAnswer {
  q: string;
  help: Array<HelpItem & { icon: ShopIcon }>;
  categories: Array<{ name: string; href: string }>;
  products: SuggestProduct[];
  /** Every product the results page will list for the query. */
  total: number;
  /** The words the products were found with when a help page took the others, else null. */
  rest: string | null;
  /** The results page for the query. */
  all: string;
  /** The catalogue could not be searched just now (the panel says so; the results page tries again). */
  failed?: boolean;
}

/**
 * The help pages search can offer, in the help centre's order: only pages that have something to say (a page that
 * says "Coming soon" is no answer), each found by its title and the owner's words for it. Off (`search.help.on`): none.
 */
export function helpEntries(
  models: Readonly<Record<HelpSlug, HelpModel>>,
  order: readonly HelpSlug[],
  set: SearchHelpSettings,
  lang: ShopLang,
): { entries: HelpEntry[]; items: Map<string, HelpItem> } {
  const entries: HelpEntry[] = [];
  const items = new Map<string, HelpItem>();
  if (!set.on) return { entries, items };
  for (const slug of order) {
    const m = models[slug];
    if (!m || m.soon || items.has(slug)) continue;
    entries.push({ id: slug, keywords: [m.title, ...(set.keywords[slug] ?? [])] });
    items.set(slug, { slug, title: m.title, answer: helpAnswer(m), href: hrefIn(lang, ROUTES.help(slug)) });
  }
  return { entries, items };
}
