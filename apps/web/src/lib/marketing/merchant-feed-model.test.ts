// S13 · PR 589 — the Merchant Center feed, pure: who goes in and why not, the item's fields (the struck price as the
// price with the shop's price as the sale price), plain descriptions and the escaped RSS file; PR 589 follow-up: one item
// per size and colour, grouped by the product.
import { describe, expect, it } from 'vitest';
import { feedItems, feedXml, plain, reasonsOf, variantTitle, type FeedProduct } from './merchant-feed-model';

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

  describe('one item per size and colour (PR 589 follow-up)', () => {
    const V: FeedProduct = {
      ...P,
      variants: [
        { id: 'v1', colour: 'Navy', size: 'M', link: 'https://shop.example/p/sample-polo?color=navy&s=m', image: 'https://shop.example/media/navy.jpg', priceMinor: 150_000, inStock: true },
        { id: 'v2', colour: 'Navy', size: 'L', link: 'https://shop.example/p/sample-polo?color=navy&s=l', image: null, priceMinor: 160_000, inStock: false },
        { id: 'v3', colour: 'Black', size: 'M', link: 'https://shop.example/p/sample-polo?color=black&s=m', image: null, priceMinor: null, inStock: true },
      ],
    };
    it('lists each size and colour with a price as its own item of the product, its photo else the main one', () => {
      const { items } = feedItems([V], 'BDT', true, true);
      expect(items.map((i) => i.id)).toEqual(['v1', 'v2']);
      expect(items[0]).toMatchObject({ groupId: 'p1', colour: 'Navy', size: 'M', title: 'Sample polo - Navy - M', price: '1500.00 BDT', availability: 'in_stock', image: 'https://shop.example/media/navy.jpg', link: 'https://shop.example/p/sample-polo?color=navy&s=m' });
      expect(items[1]).toMatchObject({ price: '1600.00 BDT', availability: 'out_of_stock', image: P.image });
      expect(feedItems([V], 'BDT', false, true).items.map((i) => i.id)).toEqual(['v1']);
    });
    it('stays one item per product while off, or for a product without sizes and colours', () => {
      expect(feedItems([V], 'BDT', true).items).toMatchObject([{ id: 'p1', groupId: null, colour: null, size: null }]);
      expect(feedItems([{ ...P, variants: [] }], 'BDT', true, true).items.map((i) => i.id)).toEqual(['p1']);
      expect(variantTitle('Sample tee', { colour: null, size: 'XL' })).toBe('Sample tee - XL');
    });
    it('writes g:item_group_id, g:color and g:size only on a size-and-colour item', () => {
      const xml = feedXml({ title: 'Sample shop', link: 'https://shop.example/', country: 'BD' }, feedItems([V], 'BDT', true, true).items);
      expect(xml).toContain('<g:id>v1</g:id>');
      expect(xml).toContain('<g:item_group_id>p1</g:item_group_id><g:color>Navy</g:color><g:size>M</g:size>');
      expect(xml).toContain('<g:link>https://shop.example/p/sample-polo?color=navy&amp;s=m</g:link>');
      expect(feedXml({ title: 'x', link: 'https://shop.example/', country: 'BD' }, feedItems([V], 'BDT', true).items)).not.toContain('g:item_group_id');
    });
  });
});
