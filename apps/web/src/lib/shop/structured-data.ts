// PR 45 / 222 · follow-ups 35, 61 (Blueprint C12.1 "visible price and availability matching JSON-LD", C12.4, A4 §9):
// the JSON-LD the shop's pages carry, built only from what the page itself draws: the breadcrumb trail, the category
// page's list of products, and the product page's product with its price and stock. Never a rating or a review until
// real review rows exist (PR 223), never a price the page does not show. Pure: the pages pass their own data in.
// S11 · PR 222 (follow-up 110, C12.4): the shop itself on the home page (Organization: only what the owner filled in;
// WebSite: the name Google shows above the results), a set page as a Product with one Offer at its set price (in stock
// only while every piece can be sold), and the struck price beside an offer only where the page shows it struck.
// S11 · PR 223 (C12.4): the product's rating and reviews, only from its real approved review rows and only what the
// page itself shows (the summary box's average and count, the cards the page draws), never a made-up number.
// S11 · PR 224 (C4, C12.4): the questions a page really answers (the product's answered questions, the FAQ page) as
// FAQPage, optional: Google shows no FAQ rich result for any site since 7 May 2026, so nothing is promised by it.
// S12 · PR 249 (C11.3, C12.4): a journal article as BlogPosting, only what the article page shows — its headline, the
// description the page carries, its dates, language and topic — with an honest byline: an AI author is never sent as a
// person (the shop itself is named), a staff author by the name the page shows.
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
  /** PR 222: the struck price the page shows beside it (the honest-price rule, PR 38), or null. */
  wasMinor?: number | null;
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
  /** PR 222: send the struck price the page shows (`seo.structuredData.wasPrice`). */
  wasPrice?: boolean;
  /** PR 527: archived for good (not only sold out): the offer says Discontinued while nothing can be bought. */
  retired?: boolean;
  /** PR 223: the reviews block the page draws (real approved rows), or null/absent: no rating, no review sent. */
  reviews?: LdReviews | null;
}

/** PR 223 · one review card the page shows. */
export interface LdReview {
  /** 1–5 stars, as the buyer gave them. */
  rating: number;
  /** The name he chose to show; without one the review is not sent on its own (it still counts in the average). */
  author: string | null;
  title: string | null;
  body: string;
  /** The day it was published (YYYY-MM-DD), or null. */
  published: string | null;
}

/** PR 223 · the page's reviews block: the summary box (every approved review of the product) and its cards. */
export interface LdReviews {
  average: number;
  total: number;
  reviews: readonly LdReview[];
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
  const availability = `${CONTEXT}/${inStock ? 'InStock' : p.retired ? 'Discontinued' : 'OutOfStock'}`;
  const prices = priced.map((v) => v.priceMinor);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // one struck price for every priced variant, above the price, or none (an AggregateOffer never carries one)
  const was = [...new Set(priced.map((v) => v.wasMinor ?? null))];
  const struck = p.wasPrice && was.length === 1 && typeof was[0] === 'number' && was[0] > low ? was[0] : null;
  const offers: Ld =
    low === high
      ? { '@type': 'Offer', url, priceCurrency: p.currency, price: majorPrice(low, p.currency), ...strikethrough(struck, p.currency), availability, itemCondition: `${CONTEXT}/NewCondition` }
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
  Object.assign(out, reviewsPart(p.reviews ?? null));
  return out;
}

const starOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

/**
 * PR 223 · the rating and the reviews beside a product: the average and count the page's summary box shows, and each
 * card the page draws that carries a name. Nothing at all without a real review (no count, an average outside 1–5,
 * or nothing passed): a rating is never sent that the page does not show.
 */
export function reviewsPart(r: LdReviews | null): Ld {
  if (!r || !Number.isInteger(r.total) || r.total < 1 || !Number.isFinite(r.average) || r.average < 1 || r.average > 5) return {};
  const out: Ld = {
    aggregateRating: { '@type': 'AggregateRating', ratingValue: r.average.toFixed(1), reviewCount: r.total, bestRating: 5, worstRating: 1 },
  };
  const items = r.reviews.flatMap((x) => {
    const author = x.author?.trim();
    if (!author || !starOk(x.rating)) return [];
    const one: Ld = { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: x.rating, bestRating: 5, worstRating: 1 }, author: { '@type': 'Person', name: author } };
    if (x.title?.trim()) one.name = x.title.trim();
    if (x.body.trim()) one.reviewBody = x.body.trim();
    if (x.published && /^\d{4}-\d{2}-\d{2}$/.test(x.published)) one.datePublished = x.published;
    return [one];
  });
  if (items.length) out.review = items.slice(0, r.total);
  return out;
}

/** The struck price as Google reads it beside an offer (a StrikethroughPrice price specification), or nothing. */
function strikethrough(wasMinor: number | null, currency: string): Ld {
  if (wasMinor === null) return {};
  return { priceSpecification: [{ '@type': 'UnitPriceSpecification', priceType: `${CONTEXT}/StrikethroughPrice`, price: majorPrice(wasMinor, currency), priceCurrency: currency }] };
}

// ---- PR 222 · the shop itself (home page) ----

export interface LdShop {
  /** The shop's name (`store.name`); without one, nothing is sent. */
  name: string;
  /** The home page in the page's language. */
  href: string;
  lang: 'en' | 'bn';
  /** The largest copy of the owner's logo (`brand.logo`), or null. */
  logo: string | null;
  phone: string | null;
  email: string | null;
  /** The shop's own pages elsewhere (`social.*`), the filled-in ones. */
  sameAs: readonly string[];
  /** The languages the shop answers in. */
  languages: readonly string[];
}

/** Organization: the shop's name and address, and only the logo, contact and social pages the owner filled in. */
export function organizationLd(origin: URL | string, s: LdShop): Ld | null {
  if (!s.name.trim()) return null;
  const out: Ld = { '@context': CONTEXT, '@type': 'Organization', name: s.name.trim(), url: absolute(origin, '/') };
  if (s.logo) out.logo = absolute(origin, s.logo);
  if (s.phone || s.email)
    out.contactPoint = [
      { '@type': 'ContactPoint', contactType: 'customer service', ...(s.phone ? { telephone: s.phone } : {}), ...(s.email ? { email: s.email } : {}), ...(s.languages.length ? { availableLanguage: [...s.languages] } : {}) },
    ];
  const same = s.sameAs.filter((u) => /^https:\/\//.test(u));
  if (same.length) out.sameAs = same;
  return out;
}

/** WebSite: the name Google shows above the shop's results, on the home page. */
export function websiteLd(origin: URL | string, s: Pick<LdShop, 'name' | 'href' | 'lang'>): Ld | null {
  if (!s.name.trim()) return null;
  return { '@context': CONTEXT, '@type': 'WebSite', name: s.name.trim(), url: absolute(origin, s.href), inLanguage: s.lang };
}

// ---- PR 222 · a set page (C12.4: Product + Offer at the set price) ----

export interface LdSetSlot {
  productId: string;
  colourIds: readonly string[];
  sizeIds: readonly string[];
  fixedVariantId: string | null;
}

export interface LdSetVariant {
  id: string;
  productId: string;
  colourId: string | null;
  sizeId: string | null;
  /** Pieces that can be sold now. */
  sellable: number;
}

/** Whether the set can be bought now: every piece has one to sell, and a product used twice has enough for both. */
export function setInStock(slots: readonly LdSetSlot[], variants: readonly LdSetVariant[]): boolean {
  if (!slots.length) return false;
  const allowed = (s: LdSetSlot) =>
    s.fixedVariantId
      ? variants.filter((v) => v.id === s.fixedVariantId)
      : variants.filter((v) => v.productId === s.productId && (!s.colourIds.length || (v.colourId !== null && s.colourIds.includes(v.colourId))) && (!s.sizeIds.length || v.sizeId === null || s.sizeIds.includes(v.sizeId)));
  const pieces = (vs: readonly LdSetVariant[]) => vs.reduce((n, v) => n + Math.max(0, v.sellable), 0);
  if (!slots.every((s) => pieces(allowed(s)) > 0)) return false;
  const byProduct = new Map<string, LdSetSlot[]>();
  for (const s of slots) byProduct.set(s.productId, [...(byProduct.get(s.productId) ?? []), s]);
  return [...byProduct.values()].every((group) => {
    const union = new Map(group.flatMap((s) => allowed(s)).map((v) => [v.id, v]));
    return pieces([...union.values()]) >= group.length;
  });
}

export interface LdSet {
  name: string;
  href: string;
  description: string | null;
  images: string[];
  currency: string;
  /** The set price the page shows (minor units), or null: no price, nothing sent. */
  payMinor: number | null;
  /** The struck price the page shows, or null. */
  wasMinor: number | null;
  wasPrice: boolean;
  /** On sale and every piece can be sold (`setInStock`). */
  inStock: boolean;
}

export function setLd(origin: URL | string, s: LdSet): Ld | null {
  if (s.payMinor === null || s.payMinor < 0 || !s.name.trim()) return null;
  const url = absolute(origin, s.href);
  const struck = s.wasPrice && s.wasMinor !== null && s.wasMinor > s.payMinor ? s.wasMinor : null;
  const out: Ld = { '@context': CONTEXT, '@type': 'Product', name: s.name.trim(), url };
  if (s.description?.trim()) out.description = s.description.trim();
  if (s.images.length) out.image = s.images.map((src) => absolute(origin, src));
  out.offers = {
    '@type': 'Offer',
    url,
    priceCurrency: s.currency,
    price: majorPrice(s.payMinor, s.currency),
    ...strikethrough(struck, s.currency),
    availability: `${CONTEXT}/${s.inStock ? 'InStock' : 'OutOfStock'}`,
    itemCondition: `${CONTEXT}/NewCondition`,
  };
  return out;
}

// ---- PR 224 · the questions a page answers (FAQPage, optional markup) ----

export interface LdQuestion {
  question: string;
  /** The answer as plain text, as the page shows it. */
  answer: string;
}

/** FAQPage from the questions and answers the page itself shows; a question without both words is left out. */
export function faqLd(origin: URL | string, href: string, items: readonly LdQuestion[]): Ld | null {
  const seen = new Set<string>();
  const main = items.flatMap((x) => {
    const q = x.question.trim();
    const a = x.answer.trim();
    if (!q || !a || seen.has(q)) return [];
    seen.add(q);
    return [{ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }];
  });
  if (!main.length) return null;
  return { '@context': CONTEXT, '@type': 'FAQPage', url: absolute(origin, href), mainEntity: main };
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

// ---- PR 249 · a journal article (BlogPosting) ----

export interface LdArticle {
  /** The article's address in the page's language. */
  href: string;
  headline: string;
  description: string | null;
  lang: 'en' | 'bn';
  /** ISO dates as the page shows them (published, and "updated" only on a real edit). */
  published: string | null;
  modified: string | null;
  /** The topic's name, as the page's trail shows it. */
  section: string | null;
  /** The byline: a staff author by name; an AI author or none is the shop itself (never an invented person). */
  author: { name: string; ai: boolean } | null;
  /** The shop's name (`store.name`); without one, nothing is sent. */
  shop: string;
}

export function articleLd(origin: URL | string, a: LdArticle): Ld | null {
  const shop = a.shop.trim();
  const headline = a.headline.trim();
  if (!shop || !headline) return null;
  const url = absolute(origin, a.href);
  const org = { '@type': 'Organization', name: shop, url: absolute(origin, '/') };
  const out: Ld = {
    '@context': CONTEXT,
    '@type': 'BlogPosting',
    headline,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: a.lang,
    author: a.author && !a.author.ai && a.author.name.trim() ? { '@type': 'Person', name: a.author.name.trim() } : org,
    publisher: org,
  };
  if (a.description?.trim()) out.description = a.description.trim();
  if (a.published) out.datePublished = a.published;
  if (a.modified ?? a.published) out.dateModified = a.modified ?? a.published;
  if (a.section?.trim()) out.articleSection = a.section.trim();
  return out;
}
