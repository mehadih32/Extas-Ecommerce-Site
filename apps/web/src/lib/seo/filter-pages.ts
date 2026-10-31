// S11 · PR 227 — which filtered collection pages search engines may list (Blueprint C12.1, App. answers #7: "indexed only
// where it genuinely earns traffic, not every combination"). Pure. Every filtered, sorted or later page points to its
// clean collection page (PR 220), except a page the owner named in `seo.filterPages`: exactly one filter (size, colour
// or fit) with one value on that collection, nothing else in the address, the switch on, and at least `minProducts`
// styles on it. Such a page names itself (with its one filter) as its own canonical address and carries the owner's
// name for it. The sitemap (PR 228) lists the same pages.
import type { SeoFilterKind, SeoFilterPage, SeoFilterPages } from '@extas/settings';
import { filterItems } from '../shop/category-filter';
import { Q, type CatItem, type CatState } from '../shop/category-model';

const GROUP: Record<SeoFilterKind, 'sizes' | 'colours' | 'fits'> = { size: 'sizes', colour: 'colours', fit: 'fits' };

/** The one filter of a state, when it has exactly one (one size, colour or fit, nothing else, the default order, page 1). */
export function singleFilter(s: CatState, defaultSort: string): { filter: SeoFilterKind; value: string } | null {
  if (s.prices.length || s.chips.length || s.sale || s.stock || s.sort !== defaultSort || s.page > 1) return null;
  const set = (Object.keys(GROUP) as SeoFilterKind[]).filter((k) => s[GROUP[k]].length);
  if (set.length !== 1) return null;
  const values = s[GROUP[set[0]!]];
  return values.length === 1 ? { filter: set[0]!, value: values[0]! } : null;
}

/** The owner's row for this collection and filter, when the switch is on. The value matches exactly, as the shop's
 *  filters do (`?colour=Navy` filters nothing when the colour is `navy`, so it stays a page that points elsewhere). */
export function namedFilterPage(policy: SeoFilterPages, category: string, one: { filter: SeoFilterKind; value: string } | null): SeoFilterPage | null {
  if (!policy.enabled || !one) return null;
  return policy.pages.find((p) => p.category === category && p.filter === one.filter && p.value === one.value) ?? null;
}

/** The page's own address: the collection with its one filter. */
export const filterPagePath = (p: Pick<SeoFilterPage, 'category' | 'filter' | 'value'>): string => `/collections/${p.category}?${new URLSearchParams({ [Q[p.filter]]: p.value }).toString()}`;

/** How many styles a filtered page shows (sold-out ones left out when the collection hides them): the page and the
 *  sitemap (PR 228) count the same. */
export function filterPageStyles(items: readonly CatItem[], state: CatState, hideSoldOut: boolean): number {
  return filterItems(hideSoldOut ? items.filter((i) => i.inStock) : items, state, { cuts: [], chipTests: new Map() }).length;
}

/** Whether a named filter page is listed: enough styles on it. */
export const filterPageListed = (policy: SeoFilterPages, styles: number): boolean => policy.enabled && styles >= policy.minProducts;
