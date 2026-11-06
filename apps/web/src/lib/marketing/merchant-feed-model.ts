// S13 · PR 589 (register "Merchant Center feed — feed from the catalogue, brand EXTAS, BDT") — the product feed, without
// the database: which products may go in (Google refuses an item without a photo, a price or a description: such a
// product is left out and counted by reason), each item's fields, and the RSS 2.0 file with Google's `g:` fields.
// Every price is the shop's own; a struck price only where the shop shows one (the card's `wasMinor`, PR 38).
// PR 589 follow-up: with `ads.merchantFeed.variants` on, a product goes in as one item per live size and colour
// (Google's variants: the items share `item_group_id` = the product, each with its colour, size, price, photo and stock).
import { majorPrice } from '../shop/structured-data';

export interface FeedProduct {
  id: string;
  title: string;
  description: string | null;
  /** The product page, absolute. */
  link: string;
  /** The main photo, absolute. */
  image: string | null;
  priceMinor: number | null;
  wasMinor: number | null;
  inStock: boolean;
  brand: string;
  category: string | null;
  /** PR 589 follow-up: its live sizes and colours (read only while the feed lists one item per variant). */
  variants?: readonly FeedVariant[];
}

/** PR 589 follow-up: one size and colour of a product, as its own feed item. */
export interface FeedVariant {
  id: string;
  /** The colour's and the size's names as the shop shows them (null: the product has none). */
  colour: string | null;
  size: string | null;
  /** The product page opened on this colour and size, absolute. */
  link: string;
  /** The photo of this colour (else the product's main photo), absolute. */
  image: string | null;
  priceMinor: number | null;
  inStock: boolean;
}

export const FEED_REASONS = ['noImage', 'noPrice', 'noDescription', 'soldOut'] as const;
export type FeedReason = (typeof FEED_REASONS)[number];

/** Why a product cannot go in (empty: it can). Sold-out products are left out only while `outOfStock` is off. */
export function reasonsOf(p: FeedProduct, outOfStock: boolean): FeedReason[] {
  const out: FeedReason[] = [];
  if (!p.image) out.push('noImage');
  if (p.priceMinor == null || p.priceMinor <= 0) out.push('noPrice');
  if (!p.description?.trim()) out.push('noDescription');
  if (!p.inStock && !outOfStock) out.push('soldOut');
  return out;
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  image: string;
  availability: 'in_stock' | 'out_of_stock';
  /** `1500.00 BDT`: the struck price while one shows, else the price. */
  price: string;
  /** The price the shop asks, only beside a struck price. */
  salePrice: string | null;
  brand: string;
  productType: string | null;
  /** PR 589 follow-up: the product a size-and-colour item belongs to, and that item's colour and size (else null). */
  groupId: string | null;
  colour: string | null;
  size: string | null;
}

/** Plain words from an article-like description (tags out, spaces folded), at most Google's 5,000 characters. */
export function plain(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000); // hardcode-ok: Google's own limit for a description
}

/** A size-and-colour item's title: the product's, then its colour and size (Google: name what tells the variants apart). */
export function variantTitle(title: string, v: Pick<FeedVariant, 'colour' | 'size'>): string {
  return [title, v.colour, v.size].filter((x) => x && x.trim()).join(' - ');
}

/**
 * The items that may go in, and how many products were left out for each reason (a product counts once per reason).
 * PR 589 follow-up: `perVariant` lists a product that may go in as one item per size and colour with a price (a sold-out
 * one only while `outOfStock`); a product without such a list stays one item.
 */
export function feedItems(products: readonly FeedProduct[], currency: string, outOfStock: boolean, perVariant = false): { items: FeedItem[]; left: Record<FeedReason, number> } {
  const left: Record<FeedReason, number> = { noImage: 0, noPrice: 0, noDescription: 0, soldOut: 0 }; // hardcode-ok: counters starting at zero
  const items: FeedItem[] = [];
  const money = (minor: number) => `${majorPrice(minor, currency)} ${currency}`;
  for (const p of products) {
    const why = reasonsOf(p, outOfStock);
    for (const r of why) left[r] += 1;
    if (why.length) continue;
    const struck = p.wasMinor != null && p.wasMinor > p.priceMinor!;
    const sold = perVariant ? (p.variants ?? []).filter((v) => v.priceMinor != null && v.priceMinor > 0 && (v.inStock || outOfStock)) : [];
    if (sold.length) {
      for (const v of sold)
        items.push({
          id: v.id,
          title: variantTitle(p.title, v).slice(0, 150), // hardcode-ok: Google's own limit for a title
          description: plain(p.description!),
          link: v.link,
          image: v.image ?? p.image!,
          availability: v.inStock ? 'in_stock' : 'out_of_stock',
          price: money(v.priceMinor!),
          salePrice: null,
          brand: p.brand,
          productType: p.category,
          groupId: p.id,
          colour: v.colour,
          size: v.size,
        });
      continue;
    }
    items.push({
      id: p.id,
      title: p.title.slice(0, 150), // hardcode-ok: Google's own limit for a title
      description: plain(p.description!),
      link: p.link,
      image: p.image!,
      availability: p.inStock ? 'in_stock' : 'out_of_stock',
      price: money(struck ? p.wasMinor! : p.priceMinor!),
      salePrice: struck ? money(p.priceMinor!) : null,
      brand: p.brand,
      productType: p.category,
      groupId: null,
      colour: null,
      size: null,
    });
  }
  return { items, left };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** The RSS 2.0 file Merchant Center fetches (Google's product data specification, `g:` namespace). */
export function feedXml(head: { title: string; link: string; country: string }, items: readonly FeedItem[]): string {
  const tag = (name: string, value: string | null) => (value ? `<${name}>${esc(value)}</${name}>` : '');
  const lines = items.map(
    (i) =>
      `<item>${tag('g:id', i.id)}${tag('g:title', i.title)}${tag('g:description', i.description)}${tag('g:link', i.link)}${tag('g:image_link', i.image)}` +
      `${tag('g:availability', i.availability)}${tag('g:price', i.price)}${tag('g:sale_price', i.salePrice)}${tag('g:brand', i.brand)}` +
      `${tag('g:condition', 'new')}${tag('g:product_type', i.productType)}${tag('g:item_group_id', i.groupId)}${tag('g:color', i.colour)}${tag('g:size', i.size)}<g:shipping>${tag('g:country', head.country)}</g:shipping></item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>${tag('title', head.title)}${tag('link', head.link)}\n${lines.join('\n')}\n</channel></rss>\n`;
}
