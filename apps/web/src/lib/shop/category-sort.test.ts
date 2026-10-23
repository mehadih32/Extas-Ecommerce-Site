// PR 47 — the sorts the owner offers, in his order, and what each one does.
import { categorySettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import type { CatItem } from './category-model';
import { sortItems, sortOptions } from './category-sort';

const it0 = (id: string, o: Partial<CatItem>): CatItem => ({ id, price: 100, was: null, colours: [], stock: [], fit: null, inStock: true, published: 0, rating: 0, reviews: 0, tags: [], ...o });
const list = [
  it0('a', { price: 900, published: 1, rating: 4, reviews: 2 }),
  it0('b', { price: null, published: 3 }),
  it0('c', { price: 500, published: 2, rating: 5, reviews: 1 }),
  it0('d', { price: 900, published: 0, rating: 4, reviews: 9 }),
];
const ids = (l: CatItem[]) => l.map((p) => p.id);

describe('PR 47 · sorts', () => {
  it('the demo four by default, in its order, each with the dictionary words; "newest" waits until the owner adds it', () => {
    const o = sortOptions(categorySettings['category.sort'].default);
    expect(o.map((x) => x.id)).toEqual(['rec', 'low', 'high', 'top']);
    expect(o[0]!.label).toEqual({ key: 'cat.sort.rec' });
    const own = sortOptions({ options: ['new', 'rec'], labels: { new: { en: 'Just in', bn: 'একদম নতুন' } } });
    expect(own).toEqual([
      { id: 'new', label: { en: 'Just in', bn: 'একদম নতুন' } },
      { id: 'rec', label: { key: 'cat.sort.rec' } },
    ]);
  });

  it("recommended keeps the owner's order", () => {
    expect(ids(sortItems(list, 'rec'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('price sorts never lift a style without a price, and ties keep the owner order', () => {
    expect(ids(sortItems(list, 'low'))).toEqual(['c', 'a', 'd', 'b']);
    expect(ids(sortItems(list, 'high'))).toEqual(['a', 'd', 'c', 'b']);
  });

  it('newest by publish date; top rated by stars, then by how many reviews, unrated last', () => {
    expect(ids(sortItems(list, 'new'))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(sortItems(list, 'top'))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('a sort never changes the list it was given', () => {
    const copy = [...list];
    sortItems(list, 'low');
    expect(list).toEqual(copy);
  });
});
