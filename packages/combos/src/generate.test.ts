// PR 571 — the generator without a database: the three pairings, the same-colour switch, left-out colours, shared
// sizes and stock, the order (pins, sales, colours), stable keys, the price from the rule, and the cap.
import { describe, expect, it } from 'vitest';
import type { ProductFact } from './facts';
import { cartesian, choose, generatePairs, NO_SALES, sizeRun, type GenRule } from './generate';

const NOW = new Date('2026-10-20T06:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z');
const ROUND = { stepMinor: 1000, direction: 'down' as const };
const SIZES = ['S', 'M', 'L'];

function product(id: string, colours: string[], opts: { price?: number; stock?: number | ((c: string, s: string) => number); style?: string; sizes?: string[]; newColour?: string; inCombos?: boolean } = {}): ProductFact {
  const sizes = (opts.sizes ?? SIZES).map((k, i) => ({ id: `${id}-${k}`, key: k, label: k, order: i }));
  const stock = (c: string, s: string) => (typeof opts.stock === 'function' ? opts.stock(c, s) : (opts.stock ?? 5));
  return {
    id,
    slug: id,
    nameEn: id,
    nameBn: null,
    published: true,
    inCombos: opts.inCombos ?? true,
    categoryIds: [],
    styleKey: opts.style ?? id,
    sortRank: 0,
    colours: colours.map((c, i) => ({ id: `${id}:${c}`, key: c, nameEn: c, nameBn: null, hex: '#000000', order: i, addedAt: c === opts.newColour ? new Date('2026-10-15T00:00:00Z') : OLD })),
    sizes,
    variants: colours.flatMap((c) => sizes.map((s) => ({ id: `${id}:${c}:${s.key}`, colourId: `${id}:${c}`, sizeId: s.id, priceMinor: opts.price ?? 100000, sellable: stock(c, s.key) }))),
  };
}

const rule = (over: Partial<GenRule> = {}): GenRule => ({ key: 'polo', pieces: 2, pairing: 'STYLE', sameColour: false, excludeColourIds: [], price: { mode: 'PERCENT', percentOff: 10 }, sortMode: 'COLOUR', pinnedKeys: [], ...over });
const ctx = { rounding: ROUND, now: NOW, newColourDays: 14, cap: 600 };

describe('combinations', () => {
  it('choose keeps order, with and without repeats; cartesian picks one from each', () => {
    expect(choose(['a', 'b', 'c'], 2, false)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
    expect(choose(['a', 'b'], 2, true)).toEqual([
      ['a', 'a'],
      ['a', 'b'],
      ['b', 'b'],
    ]);
    expect(cartesian([['a', 'b'], ['x']])).toEqual([
      ['a', 'x'],
      ['b', 'x'],
    ]);
  });
});

describe('the generator', () => {
  const polo = product('polo', ['black', 'navy', 'white', 'red']);

  it('same style: every colour pair once, in the colour order; same colour twice only with the switch', () => {
    const g = generatePairs(rule(), [polo], NO_SALES, ctx);
    expect(g.all.map((p) => p.pairSlug)).toEqual(['black-navy', 'black-white', 'black-red', 'navy-white', 'navy-red', 'white-red']);
    expect(g.all[0]!.pieceKey).toBe('polo.polo:black-polo.polo:navy');
    expect(generatePairs(rule({ sameColour: true }), [polo], NO_SALES, ctx).all).toHaveLength(10);
    expect(generatePairs(rule({ pieces: 3 }), [polo], NO_SALES, ctx).all).toHaveLength(4);
  });

  it('a left-out colour makes no pairs; a product not ticked for combos makes none', () => {
    expect(generatePairs(rule({ excludeColourIds: ['polo:red'] }), [polo], NO_SALES, ctx).all).toHaveLength(3);
    expect(generatePairs(rule(), [product('x', ['a', 'b'], { inCombos: false })], NO_SALES, ctx).all).toHaveLength(0);
  });

  it('several styles: pairs stay inside a style (the style in the link); one from each style crosses them', () => {
    const tee = product('tee', ['grey', 'blue']);
    const style = generatePairs(rule(), [polo, tee], NO_SALES, ctx);
    expect(style.all).toHaveLength(6 + 1);
    expect(style.all.some((p) => p.pairSlug === 'tee~grey-blue')).toBe(true);
    const across = generatePairs(rule({ pairing: 'ACROSS' }), [polo, tee], NO_SALES, ctx);
    expect(across.all).toHaveLength(4 * 2);
    expect(across.all[0]!.pairSlug).toBe('polo.black-tee.grey');
    expect(generatePairs(rule({ pairing: 'ANY' }), [polo, tee], NO_SALES, ctx).all).toHaveLength(15);
    // two products of one style group are one style
    const a = product('a', ['black'], { style: 'g' });
    const b = product('b', ['navy'], { style: 'g' });
    expect(generatePairs(rule(), [a, b], NO_SALES, ctx).all.map((p) => p.pairSlug)).toEqual(['a~black-navy']);
  });

  it('sizes: only shared ones; a size is open when every piece has the stock (two of one piece need two)', () => {
    const shirt = product('shirt', ['white', 'blue'], { sizes: ['M', 'L', 'XL'], stock: (c, s) => (c === 'blue' && s === 'L' ? 0 : 3) });
    const g = generatePairs(rule({ pairing: 'ACROSS' }), [polo, shirt], NO_SALES, ctx);
    const blackBlue = g.all.find((p) => p.pairSlug === 'polo.black-shirt.blue')!;
    expect(blackBlue.sizes.map((s) => [s.key, s.ok])).toEqual([
      ['M', true],
      ['L', false],
    ]);
    const one = product('one', ['black', 'navy'], { stock: (_c, s) => (s === 'S' ? 1 : 4) });
    const same = generatePairs(rule({ sameColour: true }), [one], NO_SALES, ctx).all.find((p) => p.pairSlug === 'black-black')!;
    expect(same.sizes.map((s) => [s.key, s.sets])).toEqual([
      ['S', 0],
      ['M', 2],
      ['L', 2],
    ]);
    const out = product('out', ['a', 'b'], { stock: 0 });
    const r = generatePairs(rule(), [out], NO_SALES, ctx);
    expect(r.all).toHaveLength(1);
    expect(r.visible).toHaveLength(0);
    expect(sizeRun(r.all[0]!.sizes).kind).toBe('soldOut');
    expect(sizeRun(same.sizes)).toEqual({ kind: 'some', labels: ['M', 'L'] });
  });

  it('PR 572: a top and trousers with no size in common are sized one by one — open while every piece has a size', () => {
    const trousers = product('trousers', ['black', 'olive'], { sizes: ['30', '32', '34'], stock: (c, s) => (c === 'olive' ? 0 : s === '30' ? 0 : 2) });
    const g = generatePairs(rule({ pairing: 'ACROSS' }), [polo, trousers], NO_SALES, ctx);
    const black = g.all.find((p) => p.pairSlug === 'polo.black-trousers.black')!;
    expect(black.sizes).toEqual([]);
    expect(black.openSizes).toBe(2);
    expect(g.visible.map((p) => p.pairSlug)).not.toContain('polo.black-trousers.olive');
  });

  it('best sellers: pins first, then the pair’s sales, then the colours’ sales; the newest colour is tagged', () => {
    const p = product('p', ['black', 'navy', 'white'], { newColour: 'white' });
    const signals = { pair: new Map([['p.p:navy-p.p:white', 7]]), colour: new Map([['p|p:black', 50]]) };
    const best = generatePairs(rule({ sortMode: 'BESTSELLERS', pinnedKeys: ['black-white'] }), [p], signals, ctx);
    expect(best.all.map((x) => x.pairSlug)).toEqual(['black-white', 'navy-white', 'black-navy']);
    expect(best.all[0]!.isNew).toBe(true);
    expect(best.all[2]!.isNew).toBe(false);
  });

  it('the price comes from the rule through the one price rule; the cap is kept', () => {
    const g = generatePairs(rule(), [polo], NO_SALES, ctx);
    expect(g.all[0]!.pricing).toMatchObject({ regularMinor: 200000, payMinor: 180000, reason: 'OFFER' });
    expect(generatePairs(rule({ price: { mode: 'FIXED', setMinor: 250000 } }), [polo], NO_SALES, ctx).all[0]!.pricing.reason).toBe('NOT_LOWER');
    const capped = generatePairs(rule(), [polo], NO_SALES, { ...ctx, cap: 2 });
    expect(capped.all).toHaveLength(2);
    expect(capped.truncated).toBe(true);
  });
});
