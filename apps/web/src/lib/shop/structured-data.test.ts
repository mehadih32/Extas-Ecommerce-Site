// Follow-ups 35, 61 — the JSON-LD says only what the page shows: the trail, the grid's products, one price or the
// lowest and highest, in stock only with a piece to sell, and never a rating.
import type { ImageSource } from '@extas/media';
import { describe, expect, it } from 'vitest';
import { articleLd, offerTerms, breadcrumbLd, faqLd, itemListLd, largestUrl, ldJson, majorPrice, organizationLd, productLd, reviewsPart, setInStock, setLd, websiteLd, type LdArticle, type LdProduct, type LdReviews, type LdSet, type LdShop } from './structured-data';

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

  it('follow-up 515: the offer carries the exchange window and free delivery only as the page states them', () => {
    const offer = (p: Partial<LdProduct>) => productLd(origin, { ...base, ...p })!.offers as Record<string, unknown>;
    expect(offer({}).hasMerchantReturnPolicy).toBeUndefined();
    expect(offer({}).shippingDetails).toBeUndefined();
    expect(offer({ returns: { hours: 72, exchangeOnly: true, country: 'BD' } }).hasMerchantReturnPolicy).toEqual({
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'BD',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 3,
      refundType: 'https://schema.org/ExchangeRefund',
    });
    // a window in part of a day counts as the whole day; returns too: no exchange-only refund type
    expect(offerTerms({ currency: 'BDT', returns: { hours: 30, exchangeOnly: false, country: 'BD' } }).hasMerchantReturnPolicy).toMatchObject({ merchantReturnDays: 2 });
    expect(offerTerms({ currency: 'BDT', returns: { hours: 30, exchangeOnly: false, country: 'BD' } }).hasMerchantReturnPolicy).not.toHaveProperty('refundType');
    expect(offerTerms({ currency: 'BDT', returns: { hours: 0, exchangeOnly: true, country: 'BD' } })).toEqual({});
    expect(offerTerms({ currency: 'BDT', returns: { hours: 72, exchangeOnly: true, country: 'bd' } })).toEqual({});
    const priced = offer({ variants: [{ priceMinor: 85000, stock: 1 }, { priceMinor: 95000, stock: 1 }], freeShipping: { country: 'BD' } });
    expect(priced['@type']).toBe('AggregateOffer');
    expect(priced.shippingDetails).toEqual({ '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'BDT' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'BD' } });
  });

  it('follow-up 514: colours and sizes as a ProductGroup with one Product per variant (Google`s variant markup), only as the page draws them', () => {
    const v = (sku: string, colour: string | null, size: string | null, priceMinor: number | null, stock: number, wasMinor: number | null = null) => ({ sku, colour, size, priceMinor, stock, wasMinor, href: `/p/sample-polo?${colour ? `color=${colour.toLowerCase()}&` : ''}size=${size}`, images: colour ? [`/media/${colour.toLowerCase()}.jpg`] : [] });
    const group = { id: 'prod-1', variants: [v('POLO-NAVY-M', 'Navy', 'M', 85000, 3, 100000), v('POLO-NAVY-L', 'Navy', 'L', 85000, 0), v('POLO-RED-M', 'Red', 'M', 90000, 1), v('POLO-RED-XL', 'Red', 'XL', null, 4)] };
    const g = productLd(origin, { ...base, group, wasPrice: true, returns: { hours: 72, exchangeOnly: true, country: 'BD' } })!;
    expect(g).toMatchObject({ '@context': 'https://schema.org', '@type': 'ProductGroup', name: 'Sample polo', url: 'https://shop.example.test/p/sample-polo', productGroupID: 'prod-1', variesBy: ['https://schema.org/color', 'https://schema.org/size'], brand: { '@type': 'Brand', name: 'Sample store' }, category: 'Polos' });
    expect(g).not.toHaveProperty('offers');
    const kids = g.hasVariant as Record<string, unknown>[];
    // a variant without a price is not one the page sells: left out
    expect(kids.map((k) => k.sku)).toEqual(['POLO-NAVY-M', 'POLO-NAVY-L', 'POLO-RED-M']);
    expect(kids[0]).toMatchObject({ '@type': 'Product', name: 'Sample polo · Navy · M', color: 'Navy', size: 'M', image: ['https://shop.example.test/media/navy.jpg'] });
    expect(kids[0]!.offers).toMatchObject({ '@type': 'Offer', url: 'https://shop.example.test/p/sample-polo?color=navy&size=M', price: '850.00', priceCurrency: 'BDT', availability: 'https://schema.org/InStock', hasMerchantReturnPolicy: { merchantReturnDays: 3 } });
    // the struck price only beside the variant the page shows it on
    expect((kids[0]!.offers as Record<string, unknown>).priceSpecification).toBeDefined();
    expect((kids[2]!.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
    expect((kids[1]!.offers as Record<string, unknown>).availability).toBe('https://schema.org/OutOfStock');
    expect(productLd(origin, { ...base, group, wasPrice: false })!.hasVariant).toSatisfy((x: Record<string, Record<string, unknown>>[]) => x.every((k) => !k.offers!.priceSpecification));
    // off sale: every variant out of stock, archived for good: discontinued
    expect((productLd(origin, { ...base, group, onSale: false, retired: true })!.hasVariant as Record<string, Record<string, unknown>>[]).map((k) => k.offers!.availability)).toEqual(Array(3).fill('https://schema.org/Discontinued'));
    // one colour only: varies by size alone, no colour on the variants is invented
    const sizes = productLd(origin, { ...base, group: { id: 'prod-2', variants: [v('S-M', null, 'M', 85000, 1), v('S-L', null, 'L', 85000, 1)] } })!;
    expect(sizes.variesBy).toEqual(['https://schema.org/size']);
    expect((sizes.hasVariant as Record<string, unknown>[])[0]).not.toHaveProperty('color');
    expect((sizes.hasVariant as Record<string, unknown>[])[0]).not.toHaveProperty('image');
    // one priced variant, a missing SKU or nothing that varies: the plain Product as before
    expect(productLd(origin, { ...base, group: { id: 'x', variants: [v('ONE', 'Navy', 'M', 85000, 1), v('TWO', 'Navy', 'L', null, 1)] } })!['@type']).toBe('Product');
    expect(productLd(origin, { ...base, group: { id: 'x', variants: [v('', 'Navy', 'M', 85000, 1), v('TWO', 'Navy', 'L', 85000, 1)] } })!['@type']).toBe('Product');
    expect(productLd(origin, { ...base, group: { id: 'x', variants: [v('A', 'Navy', 'M', 85000, 1), v('B', 'Navy', 'M', 85000, 1)] } })!['@type']).toBe('Product');
    expect(productLd(origin, { ...base, group: null })!['@type']).toBe('Product');
    // the rating sits on the group
    const rated = productLd(origin, { ...base, group, reviews: { average: 4.5, total: 2, reviews: [] } })!;
    expect(rated.aggregateRating).toMatchObject({ ratingValue: '4.5', reviewCount: 2 });
    expect(ldJson(g)).not.toContain('</');
  });

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

  describe('S11 · PR 223: a rating only from real review rows', () => {
    const real: LdReviews = {
      average: 4.333,
      total: 3,
      reviews: [
        { rating: 5, author: ' Sample buyer ', title: 'Good fit', body: ' Sample review. ', published: '2026-11-01' },
        { rating: 4, author: null, title: null, body: 'No name given', published: null },
        { rating: 4, author: 'Sample two', title: null, body: '', published: 'yesterday' },
      ],
    };

    it('the page`s own average and count, and each named card as a Review', () => {
      const ld = productLd(origin, { ...base, reviews: real })!;
      expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: '4.3', reviewCount: 3, bestRating: 5, worstRating: 1 });
      expect(ld.review).toEqual([
        {
          '@type': 'Review',
          reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 },
          author: { '@type': 'Person', name: 'Sample buyer' },
          name: 'Good fit',
          reviewBody: 'Sample review.',
          datePublished: '2026-11-01',
        },
        // a card without a name is not sent alone (it still counts in the average); an odd date is left out
        { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: 4, bestRating: 5, worstRating: 1 }, author: { '@type': 'Person', name: 'Sample two' } },
      ]);
    });

    it('nothing at all without a real review: none passed, a zero count, an average outside 1–5, a bad star', () => {
      for (const r of [null, undefined, { ...real, total: 0 }, { ...real, average: 0 }, { ...real, average: 6 }, { ...real, average: Number.NaN }, { ...real, total: 1.5 }]) {
        expect(JSON.stringify(productLd(origin, { ...base, reviews: r }))).not.toMatch(/aggregateRating|"review"/);
      }
      expect(reviewsPart({ ...real, reviews: [{ rating: 7, author: 'X', title: null, body: 'x', published: null }] })).toEqual({
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.3', reviewCount: 3, bestRating: 5, worstRating: 1 },
      });
      // never more reviews than the count says
      expect((reviewsPart({ average: 5, total: 1, reviews: [real.reviews[0]!, real.reviews[0]!] }).review as unknown[]).length).toBe(1);
      // a product without a price sends nothing, rating included
      expect(productLd(origin, { ...base, variants: [{ priceMinor: null, stock: 1 }], reviews: real })).toBeNull();
    });
  });

  it('S11 · PR 224: FAQPage from the questions the page shows; none without a real answer', () => {
    const ld = faqLd(origin, '/bn/help/faq', [
      { question: ' Do you deliver outside Dhaka? ', answer: ' Yes, sample answer. ' },
      { question: 'No answer?', answer: '  ' },
      { question: 'Do you deliver outside Dhaka?', answer: 'A second copy' },
    ]);
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      url: 'https://shop.example.test/bn/help/faq',
      mainEntity: [{ '@type': 'Question', name: 'Do you deliver outside Dhaka?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, sample answer.' } }],
    });
    expect(faqLd(origin, '/help/faq', [])).toBeNull();
    expect(faqLd(origin, '/help/faq', [{ question: 'Q?', answer: '' }])).toBeNull();
  });
});

describe('PR 249 · articleLd (BlogPosting, only what the article page shows, an honest byline)', () => {
  const a: LdArticle = {
    href: '/bn/journal/polo-dhowa',
    headline: ' পোলো কীভাবে ধোবেন ',
    description: 'ঠান্ডা পানিতে, উল্টো করে।',
    lang: 'bn',
    published: '2026-11-02T06:00:00.000Z',
    modified: null,
    section: 'যত্ন',
    author: { name: 'Suta', ai: true },
    shop: 'Sample store',
  };
  const shop = { '@type': 'Organization', name: 'Sample store', url: 'https://shop.example.test/' };
  it('an AI author is sent as the shop itself, never as a person', () => {
    expect(articleLd(origin, a)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'পোলো কীভাবে ধোবেন',
      url: 'https://shop.example.test/bn/journal/polo-dhowa',
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://shop.example.test/bn/journal/polo-dhowa' },
      inLanguage: 'bn',
      author: shop,
      publisher: shop,
      description: 'ঠান্ডা পানিতে, উল্টো করে।',
      datePublished: '2026-11-02T06:00:00.000Z',
      dateModified: '2026-11-02T06:00:00.000Z',
      articleSection: 'যত্ন',
    });
  });
  it('a staff author by the name the page shows; a real edit moves dateModified; empty parts are left out', () => {
    const ld = articleLd(origin, { ...a, author: { name: 'Rafi', ai: false }, modified: '2026-11-05T06:00:00.000Z', description: null, section: null })!;
    expect(ld.author).toEqual({ '@type': 'Person', name: 'Rafi' });
    expect(ld.dateModified).toBe('2026-11-05T06:00:00.000Z');
    expect(ld).not.toHaveProperty('description');
    expect(ld).not.toHaveProperty('articleSection');
    expect(articleLd(origin, { ...a, author: null })!.author).toEqual(shop);
  });
  it('nothing without the shop`s name or a headline', () => {
    expect(articleLd(origin, { ...a, shop: ' ' })).toBeNull();
    expect(articleLd(origin, { ...a, headline: '' })).toBeNull();
  });
});

