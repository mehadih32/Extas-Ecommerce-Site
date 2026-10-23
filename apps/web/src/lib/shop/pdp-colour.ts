// PR 55 — the product page's colours (Blueprint D3.5 / D3.7, demo 30-product.js pdp_colour, ACT pdp-allcolors): where
// "All N colours" sits, each colour's own address, and where that address points search engines. Pure.
import type { PdpColourSettings, PdpPageSettings } from '@extas/settings';
import { COLOUR_QUERY } from './routes';
import { colourPath } from './product-model';

/**
 * Where "All N colours" goes: `up` on the "Colour – Navy" line from `allColoursFrom` colours, else `row` right after
 * the last swatch (R15 · 2.2), or nowhere (one colour, or switched off).
 */
export function allColoursAt(n: number, set: Pick<PdpColourSettings, 'allColours' | 'allColoursFrom'>): 'up' | 'row' | null {
  if (n < 2 || !set.allColours) return null;
  return n >= set.allColoursFrom ? 'up' : 'row';
}

/** A colour's own address: `/p/<slug>/<colour>` (D3.7), or `/p/<slug>?color=<colour>` while colour paths are off. */
export function colourHref(productHref: string, key: string, set: Pick<PdpPageSettings, 'colourPaths'>): string {
  return set.colourPaths ? colourPath(productHref, key) : `${productHref}?${COLOUR_QUERY}=${encodeURIComponent(key)}`;
}

/**
 * The address a colour page names as its canonical one: the main product (D3.7 default, one strong page) or itself,
 * for the whole shop or for the product's category.
 */
export function canonicalFor(productHref: string, colour: string | null, categorySlug: string | null, set: Pick<PdpPageSettings, 'colourPaths' | 'canonical' | 'canonicalByCategory'>): string {
  if (!colour || !set.colourPaths) return productHref;
  const mode = (categorySlug && set.canonicalByCategory[categorySlug]) || set.canonical;
  return mode === 'colour' ? colourPath(productHref, colour) : productHref;
}
