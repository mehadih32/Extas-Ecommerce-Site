// PR 33, 36 — the pure parts: reading a product page's facts, matching a category, the allowed-link rule, phone
// numbers as typed, and when a product page is a ghost.
import { describe, expect, it } from 'vitest';
import { allowedLink, bestCategory, ghostState, normalizePhone, parseProductPage, plainText } from '../src';

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

describe('reading a product page (PR 33)', () => {
  it('takes the schema.org Product: name, description, brand, colour, material, sizes, photos; the price is information only', () => {
    const html = page(
      ld({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Classic Pique Polo &amp; Co',
        description: '<p>Soft cotton pique.</p><p>Regular fit.</p>',
        brand: { '@type': 'Brand', name: 'Sample Brand' },
        color: 'Navy / White',
        material: '100% Cotton',
        size: ['M', 'L', 'XL'],
        sku: 'SUP-123',
        image: ['/img/a.jpg', { '@type': 'ImageObject', url: 'https://cdn.example.com/b.jpg' }, '/img/a.jpg'],
        offers: { '@type': 'Offer', price: '1450.00', priceCurrency: 'BDT' },
      }),
    );
    const f = parseProductPage(html, 'https://shop.example.com/p/polo', 12);
    expect(f.name).toBe('Classic Pique Polo & Co');
    expect(f.description).toBe('Soft cotton pique.\nRegular fit.');
    expect(f.brand).toBe('Sample Brand');
    expect(f.colours).toEqual(['Navy', 'White']);
    expect(f.material).toBe('100% Cotton');
    expect(f.sizes).toEqual(['M', 'L', 'XL']);
    expect(f.sku).toBe('SUP-123');
    expect(f.price).toEqual({ amount: '1450.00', currency: 'BDT' });
    expect(f.images).toEqual(['https://shop.example.com/img/a.jpg', 'https://cdn.example.com/b.jpg']);
    expect(f.sources).toContain('jsonld');
  });

  it('opens @graph and ProductGroup variants', () => {
    const html = page(
      ld({
        '@graph': [
          { '@type': 'WebPage', name: 'Shop' },
          {
            '@type': 'ProductGroup',
            name: 'Oxford Shirt',
            hasVariant: [
              { '@type': 'Product', color: 'Sky Blue', size: 'M', image: 'https://cdn.example.com/1.jpg', offers: { price: 2100 } },
              { '@type': 'Product', color: 'White', size: 'L' },
            ],
          },
        ],
      }),
    );
    const f = parseProductPage(html, 'https://shop.example.com/x', 5);
    expect(f.name).toBe('Oxford Shirt');
    expect(f.colours).toEqual(['Sky Blue', 'White']);
    expect(f.sizes).toEqual(['M', 'L']);
    expect(f.images).toEqual(['https://cdn.example.com/1.jpg']);
    expect(f.price?.amount).toBe('2100');
  });

  it('falls back to OpenGraph, the first heading and the title; a broken JSON-LD block is skipped', () => {
    const og = page('<script type="application/ld+json">{broken</script><meta property="og:title" content="Linen Shirt"><meta property="og:image" content="//cdn.example.com/l.jpg"><meta name="description" content="Light linen.">');
    const f = parseProductPage(og, 'https://shop.example.com/l', 3);
    expect(f).toMatchObject({ name: 'Linen Shirt', description: 'Light linen.', images: ['https://cdn.example.com/l.jpg'], price: null });
    expect(parseProductPage(page('<title>Chino | Shop</title>', '<h1>Slim <b>Chino</b></h1>'), 'https://s.example.com/', 3).name).toBe('Slim Chino');
    expect(parseProductPage(page('<title>Cargo Pants | Shop</title>'), 'https://s.example.com/', 3).name).toBe('Cargo Pants');
    expect(parseProductPage(page(''), 'https://s.example.com/', 3).name).toBeNull();
  });

  it('caps photo links at the setting and keeps only http(s) links', () => {
    const imgs = Array.from({ length: 20 }, (_, i) => `/i/${i}.jpg`);
    const f = parseProductPage(page(ld({ '@type': 'Product', name: 'X', image: [...imgs, 'javascript:alert(1)', 'data:image/png;base64,AA'] })), 'https://s.example.com/', 4);
    expect(f.images).toHaveLength(4);
    expect(parseProductPage(page(ld({ '@type': 'Product', name: 'X', image: imgs })), 'https://s.example.com/', 0).images).toEqual([]);
  });

  it('plain text drops scripts and tags and decodes entities', () => {
    expect(plainText('<script>alert(1)</script>A&nbsp;&#x26;&#38;<b>B</b>')).toBe('A && B');
  });
});

describe('matching and the allowed-link rule (PR 33)', () => {
  const cats = [
    { id: 'a', nameEn: 'Shirts', nameBn: 'শার্ট' },
    { id: 'b', nameEn: 'Casual Shirts', nameBn: null },
    { id: 'c', nameEn: 'Polos', nameBn: 'পোলো' },
  ];
  it('picks the longest category name whose every word is in the product name', () => {
    expect(bestCategory(cats, 'Casual Oxford Shirt')?.row.id).toBe('b');
    expect(bestCategory(cats, 'Formal Shirt')?.row.id).toBe('a');
    expect(bestCategory(cats, 'Navy Pique Polo')?.row.id).toBe('c');
    expect(bestCategory(cats, 'নেভি পোলো')?.row.id).toBe('c');
    expect(bestCategory(cats, 'Leather Belt')).toBeNull();
  });

  it('allows any public http(s) link, or only the listed sites and their sub-sites', () => {
    expect(allowedLink('https://shop.example.com/p#x', []).toString()).toBe('https://shop.example.com/p');
    expect(allowedLink('https://www.supplier.example.com/p', ['supplier.example.com']).hostname).toBe('www.supplier.example.com');
    for (const [u, hosts] of [
      ['https://other.example.org/p', ['supplier.example.com']],
      ['https://notsupplier.example.com/p', ['supplier.example.com']],
      ['ftp://supplier.example.com/p', []],
      ['https://u:p@supplier.example.com/p', []],
      ['not a link', []],
    ] as const) {
      expect(() => allowedLink(u, hosts), u).toThrow(/HOST_NOT_ALLOWED/);
    }
  });
});

describe('back-in-stock contacts and page state (PR 36)', () => {
  it('writes a phone number as typed in +country form', () => {
    expect(normalizePhone('01711-000 000', '880')).toBe('+8801711000000');
    expect(normalizePhone('+880 1711 000000', '880')).toBe('+8801711000000');
    expect(normalizePhone('008801711000000', '880')).toBe('+8801711000000');
    expect(normalizePhone('8801711000000', '880')).toBe('+8801711000000');
    expect(normalizePhone('12', '880')).toBeNull();
    expect(normalizePhone('call me', '880')).toBeNull();
  });

  it('a page is live, a ghost with its reason, or none (never on the shop)', () => {
    const at = new Date('2026-10-01T00:00:00Z');
    expect(ghostState({ status: 'DRAFT', inStock: true, publishedAt: null, archivedAt: null })).toBeNull();
    expect(ghostState({ status: 'PUBLISHED', inStock: true, publishedAt: at, archivedAt: null })).toEqual({ state: 'live', reason: null });
    expect(ghostState({ status: 'PUBLISHED', inStock: false, publishedAt: at, archivedAt: null })).toEqual({ state: 'ghost', reason: 'soldOut' });
    expect(ghostState({ status: 'UNPUBLISHED', inStock: true, publishedAt: at, archivedAt: null })).toEqual({ state: 'ghost', reason: 'unpublished' });
    expect(ghostState({ status: 'UNPUBLISHED', inStock: false, publishedAt: at, archivedAt: at })).toEqual({ state: 'ghost', reason: 'archived' });
  });
});
