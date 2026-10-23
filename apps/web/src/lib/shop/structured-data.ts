// PR 45 / 222 · follow-ups 35, 61 (Blueprint C12.1 "visible price and availability matching JSON-LD", C12.4, A4 §9):
// the JSON-LD the shop's pages carry, built only from what the page itself draws: the breadcrumb trail, the category
// page's list of products, and the product page's product with its price and stock. Never a rating or a review until
// real review rows exist (PR 223), never a price the page does not show. Pure: the pages pass their own data in.
import type { ImageSource } from '@extas/media';

export interface LdCrumb {
  name: string;
  /** The page's own address (path, in the page's language); the last crumb is the page itself. */
  href: string;
}

export interface LdListItem {
  name: string;
  href: string;
}

export interface LdOfferVariant {
  /** Minor units (poisha), the price the page shows; null = no price, left out. */
  priceMinor: number | null;
  /** Pieces that can be sold now. */
  stock: number;
}

export interface LdProduct {
  name: string;
  href: string;
  description: string | null;
  /** The photos the page shows (their largest copies), in order; none when the page draws the garment instead. */
  images: string[];
  /** The product's brand; the store's name for its own label (C12.4: the real brand field). */
  brand: string | null;
  category: string | null;
  currency: string;
  /** false: a sold-out, taken-off or archived product (the page shows everything sold out). */
  onSale: boolean;
  variants: readonly LdOfferVariant[];
}

type Ld = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

/** An absolute address on the shop's own origin (the origin the request came in on). */
export function absolute(origin: URL | string, href: string): string {
  return new URL(href, origin).toString();
}

/** The currency's decimal places (BDT: 2), so 85000 poisha is "850.00". */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function majorPrice(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  return (minor / 10 ** d).toFixed(d);
}

export function breadcrumbLd(origin: URL | string, crumbs: readonly LdCrumb[]): Ld | null {
  if (crumbs.length < 2) return null;
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absolute(origin, c.href) })),
  };
}

export function itemListLd(origin: URL | string, name: string, items: readonly LdListItem[]): Ld | null {
  if (!items.length) return null;
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, url: absolute(origin, x.href), name: x.name })),
  };
}

/**
 * The product with its offer: one Offer when every priced variant costs the same, else an AggregateOffer with the
 * lowest and highest price. In stock only while the product is on sale and a priced variant has a piece to sell.
 * No priced variant: no product data at all (an offer without a price is not one).
 */
export function productLd(origin: URL | string, p: LdProduct): Ld | null {
  const priced = p.variants.filter((v): v is LdOfferVariant & { priceMinor: number } => typeof v.priceMinor === 'number' && v.priceMinor >= 0);
  if (!priced.length) return null;
  const url = absolute(origin, p.href);
  const inStock = p.onSale && priced.some((v) => v.stock > 0);
  const availability = `${CONTEXT}/${inStock ? 'InStock' : 'OutOfStock'}`;
  const prices = priced.map((v) => v.priceMinor);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const offers: Ld =
    low === high
      ? { '@type': 'Offer', url, priceCurrency: p.currency, price: majorPrice(low, p.currency), availability, itemCondition: `${CONTEXT}/NewCondition` }
      : {
          '@type': 'AggregateOffer',
          url,
          priceCurrency: p.currency,
          lowPrice: majorPrice(low, p.currency),
          highPrice: majorPrice(high, p.currency),
          offerCount: priced.length,
          availability,
          itemCondition: `${CONTEXT}/NewCondition`,
        };
  const out: Ld = { '@context': CONTEXT, '@type': 'Product', name: p.name, url };
  if (p.description?.trim()) out.description = p.description.trim();
  if (p.images.length) out.image = p.images.map((src) => absolute(origin, src));
  if (p.brand?.trim()) out.brand = { '@type': 'Brand', name: p.brand.trim() };
  if (p.category?.trim()) out.category = p.category.trim();
  out.offers = offers;
  return out;
}

/** The largest copy of a photo (any format the browser is given), for a search engine to fetch. */
export function largestUrl(src: ImageSource | null | undefined): string | null {
  if (!src?.variants.length) return null;
  // widest first; of the same width, JPEG (every crawler reads it)
  const best = [...src.variants].sort((a, b) => b.width - a.width || Number(b.format === 'jpeg') - Number(a.format === 'jpeg'))[0];
  return best?.url ?? null;
}

/** One `<script type="application/ld+json">` body: JSON with `<` escaped, so a name can never close the script. */
export function ldJson(data: Ld | readonly Ld[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
