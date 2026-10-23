// PR 46 — the filters are built from the category's own products, with live counts (owner, 19 Oct 18:38).
import { categorySettings, type CategoryToolbar } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { bandOf, chipList, chipTests, cutsFor, facets, filterItems, liveCount, priceCuts, priceStep, type SizeMeta } from './category-filter';
import { parseState, type CatItem } from './category-model';

const F = categorySettings['category.filters'].default;
const TB = categorySettings['category.toolbar'].default as CategoryToolbar;
const SORTS = ['rec', 'low', 'high', 'top'] as const;
const T = (n: number) => n * 100; // taka → poisha

function item(id: string, o: Partial<CatItem> & { sizes?: string[] } = {}): CatItem {
  const colours = o.colours ?? ['navy'];
  const sizes = o.sizes ?? ['M', 'L'];
  return {
    id,
    price: T(1000),
    was: null,
    colours,
    stock: o.stock ?? colours.flatMap((c) => sizes.map((s) => ({ size: s, colour: c, inStock: true }))),
    fit: 'Regular fit',
    inStock: true,
    published: 0,
    rating: 0,
    reviews: 0,
    tags: [],
    ...o,
  };
}

const SIZES = new Map<string, SizeMeta>(
  ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '30', '32', '34'].map((k, i) => [k, { key: k, label: k, order: i * 10 }]),
);

describe('PR 46 · K1 price bands come from the category itself', () => {
  it('rounds to the steps a price list uses (৳50 below ৳500, ৳100 below ৳2,000 …)', () => {
    expect(priceStep(T(400), F.priceSteps)).toBe(T(50));
    expect(priceStep(T(1500), F.priceSteps)).toBe(T(100));
    expect(priceStep(T(4000), F.priceSteps)).toBe(T(250));
    expect(priceStep(T(20000), F.priceSteps)).toBe(T(500));
  });

  it('polos at ৳850–1,190 get two bands that both hold styles, not the old fixed ৳800 / ৳1,200', () => {
    const cuts = priceCuts([T(850), T(950), T(990), T(1050), T(1150), T(1190)], F.priceSteps);
    expect(cuts).toEqual([T(1000), T(1100)]);
  });

  it('one style, or everything at one price, has no price filter', () => {
    expect(priceCuts([T(900)], F.priceSteps)).toEqual([]);
    expect(priceCuts([T(900), T(920)], F.priceSteps)).toEqual([]);
    expect(priceCuts([null, T(900)], F.priceSteps)).toEqual([]);
  });

  it("the owner's own cut points win, and an empty list means no price filter there", () => {
    const items = [item('a', { price: T(400) }), item('b', { price: T(4000) })];
    expect(cutsFor('caps', items, { ...F, priceCuts: { caps: [T(300), T(600)] } })).toEqual([T(300), T(600)]);
    expect(cutsFor('caps', items, { ...F, priceCuts: { caps: [] } })).toEqual([]);
    expect(bandOf(T(300), [T(300), T(600)])).toBe('mid');
    expect(bandOf(T(299), [T(300), T(600)])).toBe('lo');
    expect(bandOf(T(601), [T(300), T(600)])).toBe('hi');
    expect(bandOf(null, [T(300), T(600)])).toBeNull();
  });
});

describe('PR 46 · options only from what the category carries, counts that are live', () => {
  const items = [
    item('a', { colours: ['navy', 'white'], sizes: ['M', 'L', 'XL'], fit: 'Regular fit', price: T(850) }),
    item('b', { colours: ['navy'], sizes: ['M', '3XL'], fit: 'Slim fit', price: T(1190), was: T(1400) }),
    item('c', { colours: ['black'], sizes: ['L'], fit: 'Regular fit', price: T(990), inStock: false, stock: [{ size: 'L', colour: 'black', inStock: false }] }),
  ];
  const ctx = { cuts: cutsFor('polos', items, F), chipTests: chipTests(TB) };

  it('sizes in the shop order up to the largest present; colours with the most-carried first; fits present', () => {
    const f = facets(items, parseState({}, SORTS), ctx, F, SIZES);
    expect(f.sizes.letters.map((o) => o.value)).toEqual(['M', 'L', 'XL', '3XL']);
    expect(f.colours.map((o) => [o.value, o.count])).toEqual([
      ['navy', 2],
      ['white', 1],
      ['black', 1],
    ]);
    expect(f.fits.map((o) => o.value)).toEqual(['Regular fit', 'Slim fit']);
  });

  it('a size counts only where it can be bought now (in a chosen colour), and one sold out everywhere is crossed out, not hidden (SIM-F-035)', () => {
    const f = facets(items, parseState({}, SORTS), ctx, F, SIZES);
    const L = f.sizes.letters.find((o) => o.value === 'L')!;
    expect(L.count).toBe(1); // c's L is sold out
    const inBlack = facets(items, parseState({ colour: 'black' }, SORTS), ctx, F, SIZES);
    expect(inBlack.sizes.letters.find((o) => o.value === 'L')).toMatchObject({ count: 0, off: true });
    expect(inBlack.sizes.letters.map((o) => o.value)).toContain('L');
    const hide = facets(items, parseState({ colour: 'black' }, SORTS), ctx, { ...F, zero: 'hide' }, SIZES);
    expect(hide.sizes.letters.map((o) => o.value)).not.toContain('L');
  });

  it('counts follow the other filters: with Slim fit on, navy counts one', () => {
    const s = parseState({ fit: 'Slim fit' }, SORTS);
    expect(liveCount(items, s, ctx, 'colours', 'navy')).toBe(1);
    expect(liveCount(items, s, ctx, 'colours', 'white')).toBe(0);
    expect(filterItems(items, s, ctx).map((p) => p.id)).toEqual(['b']);
  });

  it('within a group the values add up (navy or white); across groups they narrow', () => {
    expect(filterItems(items, parseState({ colour: ['white', 'black'] }, SORTS), ctx).map((p) => p.id)).toEqual(['a', 'c']);
    expect(filterItems(items, parseState({ colour: ['white', 'black'], fit: 'Slim fit' }, SORTS), ctx)).toEqual([]);
  });

  it('on sale is only a struck price the honesty rule allowed; in stock leaves sold-out styles out', () => {
    expect(filterItems(items, parseState({ sale: '1' }, SORTS), ctx).map((p) => p.id)).toEqual(['b']);
    expect(filterItems(items, parseState({ stock: '1' }, SORTS), ctx).map((p) => p.id)).toEqual(['a', 'b']);
    const f = facets(items, parseState({}, SORTS), ctx, F, SIZES);
    expect(f.sale.count).toBe(1);
    expect(f.stock).toMatchObject({ count: 2, shown: true });
  });

  it('"in stock only" is not offered where nothing is sold out; one fit alone is no choice', () => {
    const live = items.slice(0, 1);
    const f = facets(live, parseState({}, SORTS), { cuts: [], chipTests: new Map() }, F, SIZES);
    expect(f.stock?.shown).toBe(false);
    expect(f.fits).toEqual([]);
    expect(f.prices).toEqual([]);
  });

  it('a group the owner switched off has no options', () => {
    const off = { ...F, groups: F.groups.map((g) => ({ ...g, on: g.id !== 'colour' })) };
    expect(facets(items, parseState({}, SORTS), ctx, off, SIZES).colours).toEqual([]);
  });

  it('waists are their own row when a category has both', () => {
    const mixed = [item('t', { sizes: ['M'] }), item('w', { sizes: ['30', '32'] })];
    const f = facets(mixed, parseState({}, SORTS), { cuts: [], chipTests: new Map() }, F, SIZES);
    expect(f.sizes.letters.map((o) => o.value)).toEqual(['M']);
    expect(f.sizes.waists.map((o) => o.value)).toEqual(['30', '32']);
  });
});

describe('PR 46 · 14.3 the quick chips the owner ticked', () => {
  const words = { sale: 'On sale', stock: 'In stock', band: (b: string) => b, under: () => 'under', over: () => 'over', colour: (k: string) => k, size: (k: string) => k };
  const items = [item('a', { fit: 'Regular fit' }), item('b', { fit: 'Slim fit', was: T(1500) })];
  const ctx = { cuts: [], chipTests: chipTests(TB) };

  it('the default ticks give one chip per fit; "My size" waits for Find My Size', () => {
    const chips = chipList(TB, 'polos', items, parseState({}, SORTS), ctx, words);
    expect(chips.map((c) => c.key)).toEqual(['fits:Regular fit', 'fits:Slim fit']);
  });

  it('a chip that would match every style or none is left out, unless it is on', () => {
    const one = [item('a'), item('b')];
    expect(chipList(TB, 'polos', one, parseState({}, SORTS), ctx, words)).toEqual([]);
    const on = chipList(TB, 'polos', one, parseState({ fit: 'Regular fit' }, SORTS), ctx, words);
    expect(on.map((c) => [c.key, c.on])).toEqual([['fits:Regular fit', true]]);
  });

  it("each category can switch its chips off or tick its own; owner chips with a filter of their own work", () => {
    const own: CategoryToolbar = {
      ...TB,
      chips: { ...TB.chips, library: [...TB.chips.library, { id: 'u1000', kind: 'priceUnder', max: T(1000) }] },
      perCategory: { panjabi: { chips: { on: false } }, polos: { chips: { chosen: ['u1000', 'sale'] } } },
    };
    const priced = [item('a', { price: T(900) }), item('b', { price: T(1200), was: T(1500) })];
    const c2 = { cuts: [], chipTests: chipTests(own) };
    expect(chipList(own, 'panjabi', priced, parseState({}, SORTS), c2, words)).toEqual([]);
    expect(chipList(own, 'polos', priced, parseState({}, SORTS), c2, words).map((c) => c.key)).toEqual(['u1000', 'sale']);
    expect(filterItems(priced, parseState({ chip: 'u1000' }, SORTS), c2).map((p) => p.id)).toEqual(['a']);
  });
});
