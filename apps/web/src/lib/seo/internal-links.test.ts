// S11 · PR 231 — "More collections": sub-collections or sisters first, then the parent and the other mains; never itself,
// never an empty one, at most `max`.
import { describe, expect, it } from 'vitest';
import type { ShopCategory } from '../shop/shell-model';
import { relatedCollections } from './internal-links';

const cat = (slug: string, count: number, children: Array<[string, number]> = []): ShopCategory => ({
  slug,
  nameEn: slug,
  nameBn: null,
  garment: null,
  count,
  children: children.map(([s, n]) => ({ slug: s, nameEn: s, nameBn: null, count: n })),
});
const tree = [cat('polos', 9, [['pique', 4], ['knit', 5], ['empty', 0]]), cat('shirts', 3), cat('hoodies', 0), cat('trousers', 2)];
const slugs = (slug: string, max = 6) => relatedCollections(tree, slug, max).map((x) => x.slug);

describe('PR 231 · related collections', () => {
  it('a sub-collection: its sisters, its parent, then the other mains with styles', () => {
    expect(slugs('pique')).toEqual(['knit', 'polos', 'shirts', 'trousers']);
  });
  it('a main collection: its own sub-collections, then the other mains', () => {
    expect(slugs('polos')).toEqual(['pique', 'knit', 'shirts', 'trousers']);
    expect(slugs('shirts')).toEqual(['polos', 'trousers']);
  });
  it('at most max; an unknown collection gets the mains', () => {
    expect(slugs('polos', 2)).toEqual(['pique', 'knit']);
    expect(slugs('gone')).toEqual(['polos', 'shirts', 'trousers']);
  });
});
