// PR 67 — the rows at the foot of the product page: which categories pair with a product, the desktop's one slider,
// the phone's remembered products and the desktop grid that is never empty.
import { shopMoreSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { garmentGroup, mergeRows, pairCategories, pushRecent, readRecent, recentPool } from './pdp-rows';

const set = shopMoreSettings['pdp.rows'].default;
const diagramFor = { trouser: 'bottom' };
const counts: Record<string, number> = { polos: 6, tshirts: 3, shirts: 2, panjabi: 1, trousers: 2, hoodies: 1, extras: 2 };
const count = (s: string) => counts[s] ?? 0;
const cards = (...ids: string[]) => ids.map((id) => ({ id }));

describe('garmentGroup', () => {
  it('the size-chart diagram makes a bottom, the setting may name a kind, any other garment is a top', () => {
    expect(garmentGroup('trouser', diagramFor, set.groupOf)).toBe('bottom');
    expect(garmentGroup('polo', diagramFor, set.groupOf)).toBe('top');
    expect(garmentGroup('accessory', diagramFor, set.groupOf)).toBe('other');
    expect(garmentGroup(null, diagramFor, set.groupOf)).toBe('other');
  });
});

describe('pairCategories', () => {
  it('a top pairs with bottoms first, a bottom with tops (demo pdp_rowCats)', () => {
    expect(pairCategories(set, { slug: 'polos', group: 'top' }, count)).toEqual(['trousers', 'shirts']);
    expect(pairCategories(set, { slug: 'trousers', group: 'bottom' }, count)).toEqual(['polos', 'shirts']);
    expect(pairCategories(set, { slug: 'extras', group: 'other' }, count)).toEqual(['polos', 'trousers']);
  });

  it('skips its own, missing and empty categories, and the owner pairing comes first', () => {
    const none = (s: string) => (s === 'trousers' ? 0 : count(s));
    expect(pairCategories(set, { slug: 'polos', group: 'top' }, none)).toEqual(['shirts', 'tshirts']);
    const own = { ...set, byCategory: { polos: ['extras', 'nothing-here'] } };
    expect(pairCategories(own, { slug: 'polos', group: 'top' }, count)).toEqual(['extras', 'trousers']);
  });

  it('with too few other categories, its own category closes the list when it holds another product', () => {
    const only = (s: string) => (s === 'polos' ? 6 : s === 'trousers' ? 2 : 0);
    expect(pairCategories(set, { slug: 'polos', group: 'top' }, only)).toEqual(['trousers', 'polos']);
    const lone = (s: string) => (s === 'panjabi' ? 1 : 0);
    expect(pairCategories(set, { slug: 'panjabi', group: 'top' }, lone)).toEqual([]);
  });
});

describe('mergeRows', () => {
  it('takes the rows in turn, each product once, never the product itself, at most max', () => {
    expect(mergeRows([cards('a', 'b', 'c'), cards('x', 'a', 'y')], 10, 'c').map((x) => x.id)).toEqual(['a', 'x', 'b', 'y']);
    expect(mergeRows([cards('a', 'b', 'c'), cards('x', 'y')], 3, 'zz')).toHaveLength(3);
    expect(mergeRows([], 4, 'a')).toEqual([]);
  });
});

describe('the remembered products', () => {
  it('the opened product goes first, each once, the oldest fall off', () => {
    expect(pushRecent(undefined, 'p1', 3)).toBe('p1');
    expect(pushRecent('p1.p2.p3', 'p2', 3)).toBe('p2.p1.p3');
    expect(pushRecent('p1.p2.p3', 'p4', 3)).toBe('p4.p1.p2');
  });

  it('reads only well-formed ids (a tampered cookie cannot inject anything)', () => {
    expect(readRecent('a.b.a.<script>.c', 10)).toEqual(['a', 'b', 'c']);
    expect(readRecent('', 5)).toEqual([]);
    expect(readRecent('a.b.c.d', 2)).toEqual(['a', 'b']);
    expect(pushRecent('a.b', 'bad id!', 5)).toBe('a.b');
  });
});

describe('recentPool (the desktop grid, never empty)', () => {
  it('recent first, then similar styles that are not the product nor in the rows; whole pages, at most three', () => {
    const r = recentPool(cards('r1', 'r2'), cards('p', 'r1', 'f1', 'f2', 'row1', 'f3'), ['p', 'row1'], 4);
    expect(r.list.map((x) => x.id)).toEqual(['r1', 'r2', 'f1', 'f2', 'f3']);
    expect(r.kind).toBe('mix');
    expect(recentPool(cards('a', 'b', 'c', 'd', 'e'), [], [], 4).kind).toBe('recent');
    // a recently viewed product stays even when it is in the rows above (only the fill leaves those out)
    expect(recentPool(cards('row1'), cards('row1', 'f1'), ['row1'], 4).list.map((x) => x.id)).toEqual(['row1', 'f1']);
    const fill = recentPool([], cards(...'abcdefghijklmnop'.split('')), [], 4);
    expect(fill.kind).toBe('fill');
    expect(fill.list).toHaveLength(12);
    expect(recentPool([], [], [], 4).list).toEqual([]);
  });
});
