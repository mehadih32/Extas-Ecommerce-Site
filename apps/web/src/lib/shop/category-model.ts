// PR 45 — the category page as data (demo 21-category.js PAGES.category): what the shopper asked for lives in the
// address (`?size=M&colour=navy&sort=low&page=2`), so a filtered page can be shared, reloaded and gone back to, and the
// server draws exactly that page. This file reads and writes that address and cuts the list into pages; the filters
// (PR 46, category-filter.ts) and the sorts (PR 47, category-sort.ts) work on the same state. Pure: no React, no DB.
import type { CategoryPageSettings, CategorySort } from '@extas/settings';

/** One product of the page with what the filters, the sorts and the counts need (built from a ShopCard). */
export interface CatItem {
  id: string;
  /** The card's price, minor units (the cheapest live variant). */
  price: number | null;
  /** The struck price, only when the honesty rule of PR 38 allows one. */
  was: number | null;
  /** Colour keys, in the product's own order. */
  colours: string[];
  /** One row per live variant: its size key, its colour key and whether it can be bought now. */
  stock: Array<{ size: string; colour: string | null; inStock: boolean }>;
  fit: string | null;
  inStock: boolean;
  /** When it was published (ms), for "newest". */
  published: number;
  /** Approved reviews: the average and how many. */
  rating: number;
  reviews: number;
  /** Tag slugs (for a "tag" quick chip). */
  tags: string[];
}

export const PRICE_BAND_IDS = ['lo', 'mid', 'hi'] as const;
export type Band = (typeof PRICE_BAND_IDS)[number];

export interface CatState {
  sizes: string[];
  colours: string[];
  fits: string[];
  prices: Band[];
  /** Ticked quick chips with a filter of their own (price under/over, tag), by chip id. */
  chips: string[];
  sale: boolean;
  stock: boolean;
  sort: CategorySort;
  page: number;
}

/** The address words, one per filter (repeated for several values: `?size=M&size=L`). */
export const Q = { size: 'size', colour: 'colour', fit: 'fit', price: 'price', chip: 'chip', sale: 'sale', stock: 'stock', sort: 'sort', page: 'page' } as const;

export type SearchParams = Record<string, string | string[] | undefined>;

const MAX_VALUES = 40;
const MAX_PAGE = 500;

function all(sp: SearchParams, key: string): string[] {
  const v = sp[key];
  const list = Array.isArray(v) ? v : v == null ? [] : [v];
  return [...new Set(list.map((x) => x.trim()).filter((x) => x && x.length <= 80))].slice(0, MAX_VALUES);
}

const yes = (sp: SearchParams, key: string) => all(sp, key).some((v) => v === '1' || v === 'true');

/** The state an address asks for. A sort the owner does not offer falls back to his first (demo cat_ui). */
export function parseState(sp: SearchParams, sorts: readonly CategorySort[]): CatState {
  const sort = all(sp, Q.sort)[0];
  const page = Number.parseInt(all(sp, Q.page)[0] ?? '', 10);
  return {
    sizes: all(sp, Q.size),
    colours: all(sp, Q.colour),
    fits: all(sp, Q.fit),
    prices: all(sp, Q.price).filter((b): b is Band => (PRICE_BAND_IDS as readonly string[]).includes(b)),
    chips: all(sp, Q.chip),
    sale: yes(sp, Q.sale),
    stock: yes(sp, Q.stock),
    sort: sort && sorts.includes(sort as CategorySort) ? (sort as CategorySort) : (sorts[0] ?? 'rec'),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** How many filters are on (the Filter button's badge, demo cat_activeCount). */
export function activeCount(s: CatState): number {
  return s.sizes.length + s.colours.length + s.fits.length + s.prices.length + s.chips.length + (s.sale ? 1 : 0) + (s.stock ? 1 : 0);
}

/** The query for a state, `?…` or '' — the defaults (the first sort, page 1) are left out, so the clean address is the page. */
export function queryOf(s: CatState, defaultSort: CategorySort): string {
  const q = new URLSearchParams();
  for (const v of s.sizes) q.append(Q.size, v);
  for (const v of s.colours) q.append(Q.colour, v);
  for (const v of s.fits) q.append(Q.fit, v);
  for (const v of s.prices) q.append(Q.price, v);
  for (const v of s.chips) q.append(Q.chip, v);
  if (s.sale) q.set(Q.sale, '1');
  if (s.stock) q.set(Q.stock, '1');
  if (s.sort !== defaultSort) q.set(Q.sort, s.sort);
  if (s.page > 1) q.set(Q.page, String(s.page));
  const out = q.toString();
  return out ? `?${out}` : '';
}

export type ListGroup = 'sizes' | 'colours' | 'fits' | 'prices' | 'chips';
export type FlagGroup = 'sale' | 'stock';

/** The state with one value switched on or off; any change of filter starts again at page 1. */
export function toggled(s: CatState, group: ListGroup | FlagGroup, value?: string): CatState {
  if (group === 'sale' || group === 'stock') return { ...s, [group]: !s[group], page: 1 };
  if (value == null) return s;
  const list = s[group] as string[];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...s, [group]: next, page: 1 } as CatState;
}

/** Every filter off; the sort stays (demo cat-clear). */
export function cleared(s: CatState): CatState {
  return { ...s, sizes: [], colours: [], fits: [], prices: [], chips: [], sale: false, stock: false, page: 1 };
}

/** Whether the address carries anything but the page itself (such a page stays out of search engines). */
export function isRefined(s: CatState, defaultSort: CategorySort): boolean {
  return queryOf(s, defaultSort) !== '';
}

/** Sold-out styles kept in place, moved after the rest, or left out (`category.page.soldOut`). */
export function placeSoldOut<T extends Pick<CatItem, 'inStock'>>(list: readonly T[], place: CategoryPageSettings['soldOut']): T[] {
  if (place === 'show') return [...list];
  const live = list.filter((p) => p.inStock);
  return place === 'hide' ? live : [...live, ...list.filter((p) => !p.inStock)];
}

export interface PageCut<T> {
  shown: T[];
  /** The next page's number, or null when everything is shown. */
  next: number | null;
}

/** Pages 1 … page of the list ("Show more" adds the next page under the ones shown). */
export function pageCut<T>(list: readonly T[], page: number, size: number): PageCut<T> {
  const n = Math.max(1, size) * Math.max(1, page);
  return { shown: list.slice(0, n), next: list.length > n ? page + 1 : null };
}

/** The progress bar's share (demo cat-more): shown out of every style in the category. */
export function shownShare(shown: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((shown / total) * 100)) : 0;
}

/** The owner's text block split into paragraphs at blank lines. */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
