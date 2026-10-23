// Follow-ups 35, 61 — the JSON-LD says only what the page shows: the trail, the grid's products, one price or the
// lowest and highest, in stock only with a piece to sell, and never a rating.
import type { ImageSource } from '@extas/media';
import { describe, expect, it } from 'vitest';
import { breadcrumbLd, itemListLd, largestUrl, ldJson, majorPrice, productLd, type LdProduct } from './structured-data';

const origin = new URL('https://shop.example.test');
const base: LdProduct = {
  name: 'Sample polo',
  href: '/p/sample-polo',
  description: 'A sample',
  images: ['/media/a.jpg'],
  brand: 'Sample store',
  category: 'Polos',
  currency: 'BDT',
  onSale: true,
  variants: [
    { priceMinor: 85000, stock: 3 },
    { priceMinor: 85000, stock: 0 },
  ],
};

describe('structured data', () => {
  it('the trail is absolute, in order, and needs at least two steps', () => {
    const ld = breadcrumbLd(origin, [
      { name: 'Home', href: '/bn' },
      { name: 'Polos', href: '/bn/collections/polos' },
    ]);
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://shop.example.test/bn' },
        { '@type': 'ListItem', position: 2, name: 'Polos', item: 'https://shop.example.test/bn/collections/polos' },
      ],
    });
    expect(breadcrumbLd(origin, [{ name: 'Home', href: '/' }])).toBeNull();
  });

  it('the list holds the products the grid shows, and nothing for an empty grid', () => {
    const ld = itemListLd(origin, 'Polos', [{ name: 'A', href: '/p/a' }]);
    expect(ld?.numberOfItems).toBe(1);
    expect(ld?.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, url: 'https://shop.example.test/p/a', name: 'A' }]);
    expect(itemListLd(origin, 'Polos', [])).toBeNull();
  });

  it('one price is an Offer in the currency`s own units, in stock with a piece to sell; no rating ever', () => {
    const ld = productLd(origin, base)!;
    expect(ld.offers).toMatchObject({ '@type': 'Offer', price: '850.00', priceCurrency: 'BDT', availability: 'https://schema.org/InStock' });
    expect(ld.image).toEqual(['https://shop.example.test/media/a.jpg']);
    expect(ld.brand).toEqual({ '@type': 'Brand', name: 'Sample store' });
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|review/i);
  });

  it('different prices are an AggregateOffer; sold out or off sale is OutOfStock; no price is no product', () => {
    const agg = productLd(origin, { ...base, variants: [{ priceMinor: 85000, stock: 1 }, { priceMinor: 95000, stock: 0 }, { priceMinor: null, stock: 4 }] })!;
    expect(agg.offers).toMatchObject({ '@type': 'AggregateOffer', lowPrice: '850.00', highPrice: '950.00', offerCount: 2 });
    expect((productLd(origin, { ...base, variants: [{ priceMinor: 85000, stock: 0 }] })!.offers as { availability: string }).availability).toMatch(/OutOfStock$/);
    expect((productLd(origin, { ...base, onSale: false })!.offers as { availability: string }).availability).toMatch(/OutOfStock$/);
    expect(productLd(origin, { ...base, variants: [{ priceMinor: null, stock: 2 }] })).toBeNull();
  });

  it('a drawing-only product sends no image; empty words are left out', () => {
    const ld = productLd(origin, { ...base, images: [], description: '  ', brand: null, category: null })!;
    expect(ld).not.toHaveProperty('image');
    expect(ld).not.toHaveProperty('description');
    expect(ld).not.toHaveProperty('brand');
    expect(ld).not.toHaveProperty('category');
  });

  it('prices follow the currency`s decimals; a name cannot end the script', () => {
    expect(majorPrice(85000, 'BDT')).toBe('850.00');
    expect(majorPrice(850, 'JPY')).toBe('850');
    expect(ldJson({ name: '</script><b>' })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });

  it('the largest copy of a photo, JPEG first at the same width', () => {
    const src = {
      variants: [
        { preset: 'a', format: 'webp', width: 1200, height: 1500, url: '/m/w1200.webp' },
        { preset: 'a', format: 'jpeg', width: 1200, height: 1500, url: '/m/j1200.jpg' },
        { preset: 'b', format: 'jpeg', width: 600, height: 750, url: '/m/j600.jpg' },
      ],
    } as unknown as ImageSource;
    expect(largestUrl(src)).toBe('/m/j1200.jpg');
    expect(largestUrl(null)).toBeNull();
  });
});
