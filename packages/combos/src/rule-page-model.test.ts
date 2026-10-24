// PR 572 — the pure rules of a rule's own page: filter, order, "See all", size words, offer strip, find a pair.
import { describe, expect, it } from 'vitest';
import { commonColours, filterColours, filterPairs, findPair, freeOf, needOf, NO_FILTER, offerNumbers, pairPrice, pricesVary, ruleKeyOf, shownCount, siblingsOf, sizeLine, sortListing, styleGroups, type ListPair } from './rule-page-model';

const size = (key: string, ok = true) => ({ key, label: key, ok, sets: ok ? 3 : 0, out: ok ? [] : [0] });
const pair = (rank: number, cols: [string, string], over: Partial<ListPair> = {}): ListPair => ({
  comboId: `c${rank}`,
  slug: `r~${cols.join('-')}`,
  pieceKey: cols.join('|'),
  pieces: cols.map((c) => ({ productId: 'polo', colourId: c })),
  slots: cols.map((c) => ({ productId: 'polo', colourId: c })),
  sameProduct: true,
  styleKey: 'polo',
  sizes: [size('S'), size('M'), size('L')],
  openSizes: 3,
  price: { pay: 153000, regular: 170000, saving: 17000, was: null, offer: true },
  isNew: false,
  pinned: false,
  pairSales: 0,
  colourSales: 0,
  colourOrder: cols.join(),
  rank,
  ...over,
});

const list = [
  pair(0, ['black', 'navy']),
  pair(1, ['black', 'white'], { isNew: true, sizes: [size('S'), size('M', false), size('L')], openSizes: 2 }),
  pair(2, ['navy', 'white'], { openSizes: 0, sizes: [size('S', false), size('M', false), size('L', false)] }),
  pair(3, ['navy', 'olive'], { price: { pay: 140000, regular: 160000, saving: 20000, was: null, offer: true } }),
];

describe('filterPairs / sortListing', () => {
  it('never lists a sold-out pair and keeps the rule order for best selling', () => {
    expect(filterPairs(list, NO_FILTER).map((p) => p.rank)).toEqual([0, 1, 3]);
  });
  it('keeps pairs that have every chosen colour', () => {
    expect(filterPairs(list, { ...NO_FILTER, has: ['navy'] }).map((p) => p.rank)).toEqual([0, 3]);
    expect(filterPairs(list, { ...NO_FILTER, has: ['navy', 'black'] }).map((p) => p.rank)).toEqual([0]);
  });
  it('keeps pairs open in my size', () => {
    expect(filterPairs(list, { ...NO_FILTER, size: 'M' }).map((p) => p.rank)).toEqual([0, 3]);
  });
  it('orders by sizes, new colours and price, the rule order second', () => {
    expect(sortListing(list, 'sizes').map((p) => p.rank)).toEqual([0, 3, 1, 2]);
    expect(sortListing(list, 'new').map((p) => p.rank)).toEqual([1, 0, 2, 3]);
    expect(sortListing(list, 'price').map((p) => p.rank)).toEqual([3, 0, 1, 2]);
    expect(pricesVary(list)).toBe(true);
    expect(pricesVary(list.slice(0, 2))).toBe(false);
  });
});

describe('shownCount', () => {
  it('shows all up to the limit, then the first ones and "See all"', () => {
    expect(shownCount(12, false, { over: 15, first: 8 })).toEqual({ shown: 12, more: false });
    expect(shownCount(20, false, { over: 15, first: 8 })).toEqual({ shown: 8, more: true });
    expect(shownCount(20, true, { over: 15, first: 8 })).toEqual({ shown: 20, more: false });
  });
});

describe('sizeLine', () => {
  it('says sold out, all, a run, the few left or one size each', () => {
    expect(sizeLine([size('S', false)]).kind).toBe('soldOut');
    expect(sizeLine([size('S'), size('M')])).toMatchObject({ kind: 'all', from: 'S', to: 'M' });
    expect(sizeLine([size('S', false), size('M'), size('L'), size('XL')])).toMatchObject({ kind: 'range', from: 'M', to: 'XL' });
    expect(sizeLine([size('S'), size('M', false), size('L')])).toMatchObject({ kind: 'some', labels: ['S', 'L'], few: true });
    expect(sizeLine([], 2).kind).toBe('each');
    expect(sizeLine([], 0).kind).toBe('soldOut');
  });
});

describe('offer strip, chips, styles', () => {
  it('gives "from" when prices differ', () => {
    expect(offerNumbers(list)).toMatchObject({ one: false, payMinor: 140000, regularMinor: 160000 });
    expect(offerNumbers(list.slice(0, 2))).toMatchObject({ one: true, payMinor: 153000, savingMinor: 17000 });
    expect(offerNumbers([])).toBeNull();
  });
  it('lists the colours in use, in the products` order', () => {
    expect(filterColours(list, ['white', 'olive', 'navy', 'black', 'red'])).toEqual(['white', 'olive', 'navy', 'black']);
  });
  it('groups the open pairs by style', () => {
    expect(styleGroups(list).map((g) => [g.key, g.pairs.length])).toEqual([['polo', 3]]);
  });
});

describe('finding pairs and prices', () => {
  it('finds a pair by its pieces in any order', () => {
    expect(findPair(list, [{ productId: 'polo', colourId: 'navy' }, { productId: 'polo', colourId: 'black' }])?.rank).toBe(0);
    expect(findPair(list, [{ productId: 'polo', colourId: 'red' }, { productId: 'polo', colourId: 'black' }])).toBeNull();
    expect(siblingsOf(list, list[0]!)).toHaveLength(4);
  });
  it('offers a set colour only when that all-same pair is on sale', () => {
    const same = [...list, pair(4, ['black', 'black']), pair(5, ['navy', 'navy'], { openSizes: 0 })];
    expect(commonColours(same, list[0]!, () => ['black', 'navy', 'white'])).toEqual(['black']);
  });
  it('counts stock left after the bag and the same piece twice', () => {
    expect(freeOf({ id: 'v', colourId: 'c', sizeId: 's', sellable: 3, priceMinor: 100 }, { v: 2 })).toBe(1);
    expect(freeOf({ id: 'v', colourId: 'c', sizeId: 's', sellable: 3, priceMinor: null }, {})).toBe(0);
    expect(needOf([{ productId: 'p', colourId: 'a' }, { productId: 'p', colourId: 'a' }], 0)).toBe(2);
  });
  it('looks a mix of piece prices up in the price table, else keeps the pair`s price', () => {
    const cell = { pay: 1, regular: 2, saving: 1, was: null, offer: true };
    const table = { [ruleKeyOf([95000, 85000])]: cell };
    expect(pairPrice(list[0]!, [85000, 95000], table)).toBe(cell);
    expect(pairPrice(list[0]!, [85000, null], table)).toBe(list[0]!.price);
    expect(pairPrice(list[0]!, [10, 20], table)).toBe(list[0]!.price);
  });
});
