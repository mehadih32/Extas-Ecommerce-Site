// S13 · PR 589 — the Merchant Center feed, pure: who goes in and why not, the item's fields (the struck price as the
// price with the shop's price as the sale price), plain descriptions and the escaped RSS file.
import { describe, expect, it } from 'vitest';
import { feedItems, feedXml, plain, reasonsOf, type FeedProduct } from './merchant-feed-model';

const P: FeedProduct = { id: 'p1', title: 'Sample polo', description: 'A **soft** polo.', link: 'https://shop.example/p/sample-polo', image: 'https://shop.example/media/polo.jpg', priceMinor: 150_000, wasMinor: null, inStock: true, brand: 'Sample brand', category: 'Polos' };

describe('merchant feed', () => {
  it('leaves out a product without a photo, a price or a description, and a sold-out one only when asked', () => {
    expect(reasonsOf(P, true)).toEqual([]);
    expect(reasonsOf({ ...P, image: null, priceMinor: null, description: ' ' }, true)).toEqual(['noImage', 'noPrice', 'noDescription']);
    expect(reasonsOf({ ...P, inStock: false }, true)).toEqual([]);
    expect(reasonsOf({ ...P, inStock: false }, false)).toEqual(['soldOut']);
  });
  it('builds the items in the shop currency, the struck price as price and the shop price as sale price', () => {
    const { items, left } = feedItems([P, { ...P, id: 'p2', wasMinor: 200_000, inStock: false }, { ...P, id: 'p3', image: null }], 'BDT', true);
    expect(left).toEqual({ noImage: 1, noPrice: 0, noDescription: 0, soldOut: 0 });
    expect(items[0]).toMatchObject({ price: '1500.00 BDT', salePrice: null, availability: 'in_stock', description: 'A soft polo.' });
    expect(items[1]).toMatchObject({ price: '2000.00 BDT', salePrice: '1500.00 BDT', availability: 'out_of_stock' });
  });
  it('makes plain words of a description', () => {
    expect(plain('<p>Cool</p>\n\n# Fit  _slim_')).toBe('Cool Fit slim');
  });
  it('writes an escaped RSS 2.0 file with the g: fields and the target country', () => {
    const { items } = feedItems([{ ...P, title: 'Polo & cap <set>' }], 'BDT', true);
    const xml = feedXml({ title: 'Sample shop', link: 'https://shop.example/', country: 'BD' }, items);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain('<g:title>Polo &amp; cap &lt;set&gt;</g:title>');
    expect(xml).toContain('<g:price>1500.00 BDT</g:price>');
    expect(xml).toContain('<g:shipping><g:country>BD</g:country></g:shipping>');
    expect(xml).not.toContain('g:sale_price');
  });
});
