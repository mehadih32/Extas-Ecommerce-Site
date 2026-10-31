// S11 · PR 227 — which filtered collection pages search engines may list: only one the owner named, with exactly one
// filter and one value and nothing else in the address, while the switch is on and the page shows enough styles.
import { describe, expect, it } from 'vitest';
import { CATEGORY_SORTS, SEO_FILTER_PAGES_DEFAULT, type SeoFilterPages } from '@extas/settings';
import { parseState } from '../shop/category-model';
import type { CatItem } from '../shop/category-model';
import { filterPageListed, filterPagePath, filterPageStyles, namedFilterPage, singleFilter } from './filter-pages';

const state = (sp: Record<string, string | string[]>) => parseState(sp, CATEGORY_SORTS);
const navy = { category: 'polos', filter: 'colour' as const, value: 'navy', label: { en: 'Navy polos', bn: 'নেভি পোলো' } };
const on: SeoFilterPages = { ...SEO_FILTER_PAGES_DEFAULT, enabled: true, pages: [navy, { category: 'polos', filter: 'size', value: 'XL', label: { en: 'Polos in XL', bn: 'XL পোলো' } }] };

describe('filter pages (PR 227)', () => {
  it('one filter with one value is a single filter; anything more, or another order or page, is not', () => {
    expect(singleFilter(state({ colour: 'navy' }), 'rec')).toEqual({ filter: 'colour', value: 'navy' });
    expect(singleFilter(state({ size: 'XL' }), 'rec')).toEqual({ filter: 'size', value: 'XL' });
    expect(singleFilter(state({}), 'rec')).toBeNull();
    expect(singleFilter(state({ colour: ['navy', 'black'] }), 'rec')).toBeNull();
    expect(singleFilter(state({ colour: 'navy', size: 'XL' }), 'rec')).toBeNull();
    expect(singleFilter(state({ colour: 'navy', sort: 'new' }), 'rec')).toBeNull();
    expect(singleFilter(state({ colour: 'navy', page: '2' }), 'rec')).toBeNull();
    expect(singleFilter(state({ colour: 'navy', sale: '1' }), 'rec')).toBeNull();
    expect(singleFilter(state({ colour: 'navy', stock: '1' }), 'rec')).toBeNull();
  });

  it('only a page the owner named, on its own collection, while the switch is on (the value exactly, as the filters match)', () => {
    expect(namedFilterPage(on, 'polos', { filter: 'colour', value: 'navy' })).toBe(navy);
    expect(namedFilterPage(on, 'polos', { filter: 'colour', value: 'black' })).toBeNull();
    expect(namedFilterPage(on, 'polos', { filter: 'colour', value: 'Navy' })).toBeNull();
    expect(namedFilterPage(on, 'shirts', { filter: 'colour', value: 'navy' })).toBeNull();
    expect(namedFilterPage(on, 'polos', { filter: 'fit', value: 'navy' })).toBeNull();
    expect(namedFilterPage(on, 'polos', null)).toBeNull();
    expect(namedFilterPage({ ...on, enabled: false }, 'polos', { filter: 'colour', value: 'navy' })).toBeNull();
  });

  it('names its own address with its one filter, and is listed only with enough styles', () => {
    expect(filterPagePath(navy)).toBe('/collections/polos?colour=navy');
    expect(filterPagePath({ category: 'polos', filter: 'size', value: 'X L' })).toBe('/collections/polos?size=X+L');
    expect(filterPageListed(on, 4)).toBe(true);
    expect(filterPageListed(on, 3)).toBe(false);
    expect(filterPageListed({ ...on, minProducts: 1 }, 1)).toBe(true);
    expect(filterPageListed({ ...on, enabled: false }, 40)).toBe(false);
  });

  it('counts the styles the filtered page shows, sold-out ones left out when the collection hides them', () => {
    const item = (id: string, colours: string[], inStock: boolean): CatItem => ({ id, price: 100, was: null, colours, stock: [], fit: null, inStock, published: 0, rating: 0, reviews: 0, tags: [] });
    const items = [item('a', ['navy'], true), item('b', ['navy', 'black'], false), item('c', ['black'], true)];
    expect(filterPageStyles(items, state({ colour: 'navy' }), false)).toBe(2);
    expect(filterPageStyles(items, state({ colour: 'navy' }), true)).toBe(1);
    expect(filterPageStyles(items, state({ colour: 'white' }), false)).toBe(0);
  });
});
