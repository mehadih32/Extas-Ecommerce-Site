// PR 45 — the category page's address, pages and sold-out place.
import { describe, expect, it } from 'vitest';
import { activeCount, cleared, isRefined, pageCut, paragraphs, parseState, placeSoldOut, queryOf, shownShare, toggled } from './category-model';

const SORTS = ['rec', 'low', 'high', 'top'] as const;

describe('PR 45 · the address holds what the shopper chose', () => {
  it('reads every filter, keeps one sort the owner offers, and pages from 1', () => {
    const s = parseState({ size: ['M', 'L', 'M'], colour: 'navy', fit: 'Regular fit', price: ['lo', 'nope'], sale: '1', stock: 'true', sort: 'low', page: '3' }, SORTS);
    expect(s).toMatchObject({ sizes: ['M', 'L'], colours: ['navy'], fits: ['Regular fit'], prices: ['lo'], sale: true, stock: true, sort: 'low', page: 3 });
    expect(activeCount(s)).toBe(7);
  });

  it('a sort the owner switched off, or a page that is no number, falls back', () => {
    const s = parseState({ sort: 'new', page: '-2' }, SORTS);
    expect(s.sort).toBe('rec');
    expect(s.page).toBe(1);
    expect(parseState({ page: '99999' }, SORTS).page).toBe(500);
  });

  it('writes the same address back, leaving out the defaults (the clean address is the page)', () => {
    const s = parseState({ size: ['M', 'L'], colour: 'navy', sale: '1', sort: 'low', page: '2' }, SORTS);
    expect(queryOf(s, 'rec')).toBe('?size=M&size=L&colour=navy&sale=1&sort=low&page=2');
    expect(parseState(Object.fromEntries(new URLSearchParams(queryOf(s, 'rec')).entries()), SORTS).sort).toBe('low');
    const plain = parseState({}, SORTS);
    expect(queryOf(plain, 'rec')).toBe('');
    expect(isRefined(plain, 'rec')).toBe(false);
    expect(isRefined({ ...plain, page: 2 }, 'rec')).toBe(true);
  });

  it('a filter switched on or off starts again at page 1; Clear all keeps the sort', () => {
    const s = parseState({ size: 'M', sort: 'high', page: '4' }, SORTS);
    expect(toggled(s, 'sizes', 'M')).toMatchObject({ sizes: [], page: 1 });
    expect(toggled(s, 'sizes', 'L')).toMatchObject({ sizes: ['M', 'L'], page: 1 });
    expect(toggled(s, 'sale')).toMatchObject({ sale: true, page: 1 });
    expect(cleared(toggled(s, 'stock'))).toMatchObject({ sizes: [], stock: false, sort: 'high', page: 1 });
  });

  it('a value that is too long, or too many values, are not read', () => {
    expect(parseState({ size: 'x'.repeat(81) }, SORTS).sizes).toEqual([]);
    expect(parseState({ size: Array.from({ length: 60 }, (_, i) => `s${i}`) }, SORTS).sizes).toHaveLength(40);
  });
});

describe('PR 45 · pages and the progress line', () => {
  const list = Array.from({ length: 30 }, (_, i) => i);
  it('"Show more" adds the next page under the ones shown', () => {
    expect(pageCut(list, 1, 12)).toEqual({ shown: list.slice(0, 12), next: 2 });
    expect(pageCut(list, 2, 12).shown).toHaveLength(24);
    expect(pageCut(list, 3, 12)).toEqual({ shown: list, next: null });
    expect(pageCut([], 1, 12)).toEqual({ shown: [], next: null });
  });

  it('the bar shows the share of the whole category', () => {
    expect(shownShare(12, 30)).toBe(40);
    expect(shownShare(30, 30)).toBe(100);
    expect(shownShare(0, 0)).toBe(0);
  });

  it('sold-out styles stay, go last or go (category.page.soldOut)', () => {
    const l = [
      { id: 'a', inStock: false },
      { id: 'b', inStock: true },
      { id: 'c', inStock: true },
    ];
    expect(placeSoldOut(l, 'show').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(placeSoldOut(l, 'last').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(placeSoldOut(l, 'hide').map((x) => x.id)).toEqual(['b', 'c']);
  });

  it("the owner's text block splits at blank lines", () => {
    expect(paragraphs('One line\nand more.\n\n  Two.  \n\n\n')).toEqual(['One line and more.', 'Two.']);
    expect(paragraphs(undefined)).toEqual([]);
  });
});
