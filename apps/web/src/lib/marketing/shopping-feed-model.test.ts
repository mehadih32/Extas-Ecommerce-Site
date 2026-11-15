import { describe, expect, it } from 'vitest';
import type { FeedProduct } from './merchant-feed-model';
import { descriptionFrom, feedCounts, feedProblems, needBarcode } from './shopping-feed-model';

const p = (o: Partial<FeedProduct>): FeedProduct => ({ id: 'p', title: 'Polo', description: 'Nice polo', link: 'l', image: 'i', priceMinor: 1000, wasMinor: null, inStock: true, brand: 'B', category: 'Polo', photos: 5, ownLabel: true, ...o });

describe('shopping feed problems', () => {
  it('lists no description and no photo as rejected, few photos and sold out as warnings', () => {
    const out = feedProblems([p({ id: 'a', description: ' ' }), p({ id: 'b', image: null }), p({ id: 'c', photos: 2 }), p({ id: 'd', inStock: false }), p({ id: 'e' })]);
    expect(out.map((x) => [x.productId, x.key, x.severity])).toEqual([
      ['a', 'noDescription', 'bad'],
      ['b', 'noPhoto', 'bad'],
      ['c', 'fewPhotos', 'warn'],
      ['d', 'soldOut', 'warn'],
    ]);
    expect(out.find((x) => x.key === 'fewPhotos')?.n).toBe(2);
  });
  it('lists a product without a price as rejected, once under its own kind', () => {
    const out = feedProblems([p({ priceMinor: null })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'price', severity: 'bad' });
  });
  it('counts a product once however many rejections it has', () => {
    const products = [p({ id: 'a', description: null, image: null }), p({ id: 'b' }), p({ id: 'c', photos: 1 })];
    expect(feedCounts(products, feedProblems(products))).toEqual({ live: 3, rejected: 1, approved: 2 });
  });
  it('counts the products whose brand is not marked as the shop own', () => {
    expect(needBarcode([p({ ownLabel: true }), p({ ownLabel: false }), p({ ownLabel: undefined })])).toBe(2);
  });
  it('writes the description from the product own facts only', () => {
    const parts = { head: 'Buy {name} online in Bangladesh.', category: '{category}.', sizes: 'Sizes {sizes}.' };
    expect(descriptionFrom(parts, { title: 'Polo', category: 'Polo shirts', sizes: ['S', 'M', 'XL'] })).toBe('Buy Polo online in Bangladesh. Polo shirts. Sizes S-XL.');
    expect(descriptionFrom(parts, { title: 'Cap', category: null, sizes: [] })).toBe('Buy Cap online in Bangladesh.');
    expect(descriptionFrom(parts, { title: 'Cap', category: null, sizes: ['One'] })).toBe('Buy Cap online in Bangladesh. Sizes One.');
  });
});
