// PR 572 — a rule's own page link: what it says, the links that change one choice, a card's size words.
import { describe, expect, it } from 'vitest';
import { cardSizeWords, isFiltered, listHref, pairTitle, parseListQuery, toggleHas } from './combo-list-model';

const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
const size = (key: string, ok = true) => ({ key, label: key, ok, sets: 1, out: [] });

describe('parseListQuery', () => {
  it('reads the filters and drops anything odd', () => {
    const q = parseListQuery({ has: 'black,navy,black,<x>', size: 'M', sort: 'price', all: '1', style: 'polo', tier: '3', tpl: 'L4' });
    expect(q).toEqual({ has: ['black', 'navy'], size: 'M', sort: 'price', all: true, style: 'polo', tier: 3, tpl: 'L4' });
    expect(parseListQuery({ sort: 'cheapest', tier: '4', tpl: 'javascript:' })).toMatchObject({ sort: 'best', tier: null, tpl: null, has: [] });
    expect(isFiltered(parseListQuery({}))).toBe(false);
    expect(isFiltered(parseListQuery({ size: 'M' }))).toBe(true);
  });
});

describe('listHref / toggleHas', () => {
  const q = parseListQuery({ has: 'black', sort: 'new', all: '1' });
  it('writes the link with one change, dropping empty values', () => {
    expect(listHref('/combos/r', q, { size: 'L' })).toBe('/combos/r?has=black&size=L&sort=new&all=1');
    expect(listHref('/combos/r', parseListQuery({}), {})).toBe('/combos/r');
  });
  it('turns a colour chip on and off and folds "See all"', () => {
    expect(toggleHas('/b', q, 'navy')).toBe('/b?has=black%2Cnavy&sort=new');
    expect(toggleHas('/b', q, 'black')).toBe('/b?sort=new');
  });
});

describe('cardSizeWords', () => {
  it('says my size`s state when "My size" is on', () => {
    expect(cardSizeWords(t, { sizes: [size('M')], openSizes: 1 }, 'M')).toEqual({ text: 'ctpl.list.inSize{"size":"M"}', ok: true });
    expect(cardSizeWords(t, { sizes: [size('M', false)], openSizes: 0 }, 'M').ok).toBe(false);
  });
  it('says the sizes in short words otherwise', () => {
    expect(cardSizeWords(t, { sizes: [size('S'), size('M')], openSizes: 2 }, null).text).toBe('ctpl.list.sizesAll{"from":"S","to":"M"}');
    expect(cardSizeWords(t, { sizes: [], openSizes: 3 }, null).text).toBe('ctpl.list.sizesEach');
    expect(cardSizeWords(t, { sizes: [size('S'), size('M', false), size('L')], openSizes: 2 }, null).text).toBe('ctpl.list.sizesLeft{"list":"S · L"}');
  });
  it('names a pair by its colours', () => {
    expect(pairTitle({ pieces: [{ productId: 'p', colourId: 'a' }, { productId: 'p', colourId: 'b' }] }, (id) => id.toUpperCase())).toBe('A + B');
  });
});
