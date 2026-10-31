// S11 · PR 235 — the pure parts of the redirect manager: how the proxy reads its table (one permanent forward, the
// Bengali twin, the query kept, the WordPress map only once live), the 404 report's suggestion, a combo's colours in
// another order, the owner's list of old links and the addresses a forward may never take over.
import { describe, expect, it } from 'vitest';
import { forwardOf, redirectKey, type RedirectTable } from './redirect-table';
import { colourSetKey, isOwnAddress, parseRedirectCsv, sameColoursSlug, suggestTarget, wordsOf } from './suggest';
import { refererOf } from './not-found';
import { kindOf } from './redirects-admin';

const table = (wordpressLive = false, status: 301 | 308 = 301): RedirectTable => ({
  status,
  wordpressLive,
  rows: new Map([
    ['/pique-polos', { id: 'a', to: '/collections/polos', source: 'category-slug' }],
    ['/product/polo-shirt-navy-l', { id: 'b', to: '/p/essential-pique-polo', source: 'wordpress' }],
    ['/old-eid', { id: 'c', to: '/', source: 'manual' }],
    ['/loop', { id: 'd', to: '/LOOP/', source: 'manual' }],
  ]),
});

describe('the proxy follows the redirect table (PR 235)', () => {
  it('writes every address one way: lower case, no trailing slash, no host or query, %-escapes decoded', () => {
    expect(redirectKey('https://old.example/Product/Polo-Shirt/?x=1#top')).toBe('/product/polo-shirt');
    expect(redirectKey('pique%20polos/')).toBe('/pique polos');
    expect(redirectKey('')).toBe('/');
    expect(redirectKey('//other.example/x')).toBe('/other.example/x'); // never another site
    expect(redirectKey('/\\other.example')).toBe('/other.example');
  });

  it('forwards an old link permanently with the store`s status code, the query kept', () => {
    expect(forwardOf(table(), '/pique-polos', '?colour=navy')).toEqual({ location: '/collections/polos?colour=navy', status: 301, id: 'a' });
    expect(forwardOf(table(false, 308), '/Pique-Polos/')?.status).toBe(308);
    expect(forwardOf(table(), '/old-eid')?.location).toBe('/');
  });

  it('a Bengali address forwards to the Bengali twin of the target', () => {
    expect(forwardOf(table(), '/bn/pique-polos')?.location).toBe('/bn/collections/polos');
    expect(forwardOf(table(), '/bn/old-eid')?.location).toBe('/bn');
  });

  it('the WordPress map forwards only once it is live (go-live day)', () => {
    expect(forwardOf(table(false), '/product/polo-shirt-navy-l/')).toBeNull();
    expect(forwardOf(table(true), '/product/polo-shirt-navy-l/')?.location).toBe('/p/essential-pique-polo');
  });

  it('never forwards the home page, an unknown address or a row pointing at itself', () => {
    expect(forwardOf(table(), '/')).toBeNull();
    expect(forwardOf(table(), '/bn')).toBeNull();
    expect(forwardOf(table(), '/nothing-here')).toBeNull();
    expect(forwardOf(table(), '/loop')).toBeNull();
  });

  it('names each source as the admin shows it', () => {
    expect(['wordpress', 'product-slug', 'category-slug', 'collection-slug', 'combo-order', 'manual', 'import'].map(kindOf)).toEqual(['wordpress', 'renamed', 'renamed', 'renamed', 'combo', 'manual', 'manual']);
  });
});

describe('the 404 report (PR 235)', () => {
  const cands = [
    { path: '/p/essential-pique-polo', label: 'Essential Pique Polo' },
    { path: '/p/pique-polo-long-sleeve', label: 'Pique Polo Long Sleeve' },
    { path: '/collections/panjabi', label: 'Panjabi' },
  ];

  it('drops the old shop`s folders and file endings from an address`s words', () => {
    expect(wordsOf('/product-category/men/panjabi.html')).toEqual(['men', 'panjabi']);
    expect(wordsOf('/shop/')).toEqual([]);
  });

  it('suggests the live page sharing most words, the tighter one on a tie, nothing below the threshold', () => {
    expect(suggestTarget('/product/pique-polo-navy/', cands, 50)).toEqual({ path: '/p/essential-pique-polo', label: 'Essential Pique Polo', percent: 67 });
    expect(suggestTarget('/shop/panjabi-eid-2025/', cands, 30)?.path).toBe('/collections/panjabi');
    expect(suggestTarget('/shop/panjabi-eid-2025/', cands, 50)).toBeNull();
    expect(suggestTarget('/blog/winter-care/', cands, 10)).toBeNull();
    expect(suggestTarget('/', cands, 10)).toBeNull();
  });

  it('keeps only where the visitor came from, never the query', () => {
    expect(refererOf('https://www.facebook.com/groups/x/posts/1?fbclid=secret')).toBe('https://www.facebook.com/groups/x/posts/1');
    expect(refererOf('javascript:alert(1)')).toBeNull();
    expect(refererOf(null)).toBeNull();
  });
});

describe('a combo`s colours in another order (PR 235, Blueprint C12.1)', () => {
  it('gives the same key for any order of the colours of one rule', () => {
    expect(colourSetKey('polo-pairs~navy-black')).toBe(colourSetKey('polo-pairs~black-navy'));
    expect(colourSetKey('x~tee.grey-polo.black')).toBe(colourSetKey('x~polo.black-tee.grey'));
    expect(colourSetKey('no-rule')).toBeNull();
  });

  it('finds the one pair named in another order, never a guess', () => {
    const live = ['polo-pairs~black-navy', 'polo-pairs~black-white', 'polo-pairs~navy-white'];
    expect(sameColoursSlug('polo-pairs~navy-black', live)).toBe('polo-pairs~black-navy');
    expect(sameColoursSlug('polo-pairs~black-navy', live)).toBeNull(); // already its own address
    expect(sameColoursSlug('polo-pairs~red-navy', live)).toBeNull();
    // two pairs with the same colour words (a hyphen inside a colour name): no forward rather than a guess
    expect(sameColoursSlug('a~grey-dark-navy', ['a~dark-grey-navy', 'a~navy-dark-grey'])).toBeNull();
  });
});

describe('the owner`s list of old links (PR 235, PR 587)', () => {
  it('reads old,new per line (comma, semicolon or tab), skips a heading, empty lines and # notes', () => {
    const text = '﻿old,new\n/product/polo-navy/,/p/essential-pique-polo\n\n# the Eid page\nhttps://extas-old.example/eid-2025/;/collections/panjabi\n/lonely\n/tab\t/p/x';
    expect(parseRedirectCsv(text)).toEqual([
      { line: 2, from: '/product/polo-navy/', to: '/p/essential-pique-polo' },
      { line: 5, from: 'https://extas-old.example/eid-2025/', to: '/collections/panjabi' },
      { line: 6, from: '/lonely', to: '' },
      { line: 7, from: '/tab', to: '/p/x' },
    ]);
  });

  it('a first line that is an address is a row, not a heading', () => {
    expect(parseRedirectCsv('/a,/b')).toEqual([{ line: 1, from: '/a', to: '/b' }]);
  });

  it('never lets an old link take over the home page or the shop`s own pages', () => {
    expect(['/', '/bag', '/checkout/thanks/X1', '/account/orders', '/search', '/combos', '/bn/old'].every(isOwnAddress)).toBe(true);
    expect(['/product/polo', '/shop/eid', '/collections/old'].some(isOwnAddress)).toBe(false);
  });
});
