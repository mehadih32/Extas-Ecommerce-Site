// PR 77 follow-up (667) — the page "Open the page" opens on Website › Page layouts: the picked product for the product
// pages (else the first by name; New in while the shop has none), one category's own page, the home page and the bag.
import { describe, expect, it } from 'vitest';
import { layoutOpenPath } from './layouts-admin';

const products = [{ slug: 'classic-panjabi' }, { slug: 'essential-pique-polo' }];
const base = { cat: null, products, askedProd: null, productPrefix: '/p' };

describe('the page Page layouts opens (PR 77 follow-up)', () => {
  it('the product pages open the picked product, else the first, under the owner`s prefix', () => {
    expect(layoutOpenPath({ ...base, page: 'product', askedProd: 'essential-pique-polo' })).toEqual({ path: '/p/essential-pique-polo', prod: 'essential-pique-polo' });
    expect(layoutOpenPath({ ...base, page: 'product' })).toEqual({ path: '/p/classic-panjabi', prod: 'classic-panjabi' });
    expect(layoutOpenPath({ ...base, page: 'product', askedProd: 'gone' }).prod).toBe('classic-panjabi');
    expect(layoutOpenPath({ ...base, page: 'product', productPrefix: '/shop/' }).path).toBe('/shop/classic-panjabi');
  });

  it('a shop with no product opens New in; the other pages open their own', () => {
    expect(layoutOpenPath({ ...base, page: 'product', products: [] })).toEqual({ path: '/collections/new-in', prod: null });
    expect(layoutOpenPath({ ...base, page: 'home' }).path).toBe('/');
    expect(layoutOpenPath({ ...base, page: 'bag' }).path).toBe('/bag');
    expect(layoutOpenPath({ ...base, page: 'category' }).path).toBe('/collections/new-in');
    expect(layoutOpenPath({ ...base, page: 'category', cat: 'polos' }).path).toBe('/collections/polos');
  });
});
