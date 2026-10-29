// Follow-ups 35, 61 — the JSON-LD says only what the page shows: the trail, the grid's products, one price or the
// lowest and highest, in stock only with a piece to sell, and never a rating.
import type { ImageSource } from '@extas/media';
import { describe, expect, it } from 'vitest';
import { breadcrumbLd, itemListLd, largestUrl, ldJson, majorPrice, organizationLd, productLd, setInStock, setLd, websiteLd, type LdProduct, type LdSet, type LdShop } from './structured-data';

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

  // ---- PR 222 ----

  it('PR 222: the struck price only where the page shows one, above the price, on a single offer', () => {
    const was = { ...base, wasPrice: true, variants: [{ priceMinor: 85000, stock: 3, wasMinor: 100000 }, { priceMinor: 85000, stock: 1, wasMinor: 100000 }] };
    const offer = (productLd(origin, was)!.offers as Record<string, unknown>);
    expect(offer.priceSpecification).toEqual([{ '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: '1000.00', priceCurrency: 'BDT' }]);
    // the switch off, no struck price, a struck price not above the price, or two different ones: none
    expect((productLd(origin, { ...was, wasPrice: false })!.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
    expect((productLd(origin, base)!.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
    expect((productLd(origin, { ...was, variants: [{ priceMinor: 85000, stock: 1, wasMinor: 85000 }] })!.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
    expect((productLd(origin, { ...was, variants: [{ priceMinor: 85000, stock: 1, wasMinor: 100000 }, { priceMinor: 85000, stock: 1, wasMinor: null }] })!.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
  });

  const shop: LdShop = { name: 'Sample Shop', href: '/', lang: 'en', logo: '/media/logo.png', phone: '+8801700000222', email: 'help@example.test', sameAs: ['https://social.example.test/sample', 'http://insecure.example.test'], languages: ['en', 'bn'] };

  it('PR 222: the shop on its home page, with only what the owner filled in', () => {
    expect(organizationLd(origin, shop)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Sample Shop',
      url: 'https://shop.example.test/',
      logo: 'https://shop.example.test/media/logo.png',
      contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: '+8801700000222', email: 'help@example.test', availableLanguage: ['en', 'bn'] }],
      sameAs: ['https://social.example.test/sample'],
    });
    const bare = organizationLd(origin, { ...shop, logo: null, phone: null, email: null, sameAs: [] })!;
    expect(Object.keys(bare).sort()).toEqual(['@context', '@type', 'name', 'url']);
    expect(organizationLd(origin, { ...shop, name: ' ' })).toBeNull();
    expect(websiteLd(origin, { name: 'Sample Shop', href: '/bn', lang: 'bn' })).toEqual({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Sample Shop', url: 'https://shop.example.test/bn', inLanguage: 'bn' });
    expect(websiteLd(origin, { name: '', href: '/', lang: 'en' })).toBeNull();
  });

  it('PR 222: a set is a Product with one Offer at the set price; in stock only while every piece can be sold', () => {
    const slots = [
      { productId: 'p1', colourIds: [], sizeIds: [], fixedVariantId: null },
      { productId: 'p2', colourIds: ['c1'], sizeIds: [], fixedVariantId: null },
    ];
    const variants = [
      { id: 'v1', productId: 'p1', colourId: 'c1', sizeId: 's1', sellable: 2 },
      { id: 'v2', productId: 'p2', colourId: 'c1', sizeId: 's1', sellable: 1 },
      { id: 'v3', productId: 'p2', colourId: 'c2', sizeId: 's1', sellable: 9 },
    ];
    expect(setInStock(slots, variants)).toBe(true);
    // the allowed colour of the second piece is sold out (another colour does not count)
    expect(setInStock(slots, variants.map((v) => (v.id === 'v2' ? { ...v, sellable: 0 } : v)))).toBe(false);
    // the same product twice needs two pieces
    const twice = [slots[0]!, { ...slots[0]! }];
    expect(setInStock(twice, variants)).toBe(true);
    expect(setInStock(twice, variants.map((v) => (v.id === 'v1' ? { ...v, sellable: 1 } : v)))).toBe(false);
    expect(setInStock([], variants)).toBe(false);

    const set: LdSet = { name: 'Sample duo', href: '/combo/sample-duo', description: null, images: [], currency: 'BDT', payMinor: 280000, wasMinor: 320000, wasPrice: true, inStock: true };
    expect(setLd(origin, set)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Sample duo',
      url: 'https://shop.example.test/combo/sample-duo',
      offers: {
        '@type': 'Offer',
        url: 'https://shop.example.test/combo/sample-duo',
        priceCurrency: 'BDT',
        price: '2800.00',
        priceSpecification: [{ '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: '3200.00', priceCurrency: 'BDT' }],
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    });
    expect((setLd(origin, { ...set, inStock: false, wasMinor: null })!.offers as Record<string, unknown>)).toMatchObject({ availability: 'https://schema.org/OutOfStock' });
    expect((setLd(origin, { ...set, wasPrice: false })!.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
    expect(setLd(origin, { ...set, payMinor: null })).toBeNull();
    expect(JSON.stringify(setLd(origin, set))).not.toContain('aggregateRating');
  });
});
