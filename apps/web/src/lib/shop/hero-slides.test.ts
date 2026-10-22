import { describe, expect, it } from 'vitest';
import type { ShopCard, ShopColour } from './catalogue';
import { heroSlidePicks, productColourPath, slideCandidates } from './home-model';

const col = (key: string): ShopColour => ({ key, nameEn: key, nameBn: null, hex: '#112233' });
const card = (id: string, colours: string[], priceMinor: number | null = 150000): ShopCard => ({
  id,
  slug: id,
  nameEn: id,
  nameBn: null,
  garment: 'tee',
  categorySlug: null,
  fit: null,
  priceMinor,
  wasMinor: null,
  colours: colours.map(col),
  badge: null,
  photos: {},
  inStock: true,
  sortRank: 0,
});
const ids = (picks: ReturnType<typeof heroSlidePicks>) => picks.map((p) => `${p.card.id}/${p.colour?.key ?? '-'}`);

describe('the hero pictures (PR 43)', () => {
  it('offers every product in its first colour before any second colour', () => {
    const list = slideCandidates([card('hoodie', ['black', 'olive']), card('tee', ['white'])]);
    expect(list.map((p) => `${p.card.id}/${p.colour?.key}`)).toEqual(['hoodie/black', 'tee/white', 'hoodie/olive']);
  });

  it('a product without a price gives no picture; one without colours draws in its default', () => {
    const list = slideCandidates([card('a', ['red'], null), card('b', [])]);
    expect(list.map((p) => [p.card.id, p.colour])).toEqual([['b', null]]);
  });

  it('takes turns across the categories, at most perCategory each, count in all', () => {
    const groups = [
      [card('h1', ['black', 'olive']), card('h2', ['grey'])],
      [card('p1', ['white', 'maroon'])],
      [card('t1', ['sky']), card('t2', ['ecru']), card('t3', ['black'])],
    ];
    expect(ids(heroSlidePicks(groups, 14, 2))).toEqual(['h1/black', 'p1/white', 't1/sky', 'h2/grey', 'p1/maroon', 't2/ecru']);
    expect(ids(heroSlidePicks(groups, 4, 2))).toEqual(['h1/black', 'p1/white', 't1/sky', 'h2/grey']);
    expect(heroSlidePicks(groups, 14, 1)).toHaveLength(3);
  });

  it('a product listed twice never shows the same colour twice; empty categories are skipped', () => {
    const shared = card('s', ['navy']);
    expect(ids(heroSlidePicks([[shared], [], [shared, card('x', ['red'])]], 10, 3))).toEqual(['s/navy', 'x/red']);
    expect(heroSlidePicks([], 14, 2)).toEqual([]);
  });

  it('a collection is one group in its own order', () => {
    const g = [card('c1', ['a', 'b']), card('c2', ['c'])];
    expect(ids(heroSlidePicks([g], 14, 14))).toEqual(['c1/a', 'c2/c', 'c1/b']);
  });

  it('links to the product opened on that colour', () => {
    expect(productColourPath('/products/', 'oxford shirt', 'sky blue')).toBe('/products/oxford%20shirt?color=sky%20blue');
    expect(productColourPath('/p', 'tee', null)).toBe('/p/tee');
  });
});
