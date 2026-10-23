// PR 91–95, 103 — the combo page's picking rules without a database: the price table's keys, "Same size as item 1"
// and what a colour change does to the sizes, popular pairs (three to a row) and the cards grouped per rule. Made-up
// test ids, prices and stock.
import { describe, expect, it } from 'vitest';
import {
  choicesOf,
  groupCards,
  initialPicks,
  linkSource,
  pairFits,
  pairsShown,
  piecePrice,
  picksKey,
  popularPairs,
  priceKeyOf,
  priceMixes,
  sizeOf,
  checkPicks,
  withColours,
  withSame,
  withSize,
  fillIn,
} from './page-model';
import { expandSlots, type VariantStock } from './validate';

const v = (id: string, productId: string, colourId: string | null, sizeId: string | null, sellable: number, priceMinor: number | null = 100000): VariantStock => ({ id, productId, colourId, sizeId, sellable, priceMinor });
const POLO = 'polo';
const CHINO = 'chino';
const VARIANTS = [
  v('navy-m', POLO, 'navy', 'm', 3),
  v('navy-l', POLO, 'navy', 'l', 2),
  v('white-m', POLO, 'white', 'm', 4),
  v('white-l', POLO, 'white', 'l', 0),
  v('red-m', POLO, 'red', 'm', 2, 120000),
  v('red-l', POLO, 'red', 'l', 2, 120000),
  v('grey-m', POLO, 'grey', 'm', 0),
  v('grey-l', POLO, 'grey', 'l', 0),
  v('sand-30', CHINO, 'sand', '30', 2, 145000),
  v('sand-32', CHINO, 'sand', '32', 1, 145000),
];
const ORDER = ['navy', 'white', 'red', 'grey'];
const duo = expandSlots([{ position: 0, productId: POLO, colourIds: [], sizeIds: [], fixedVariantId: null, quantity: 2 }]);
const trio = expandSlots([{ position: 0, productId: POLO, colourIds: [], sizeIds: [], fixedVariantId: null, quantity: 3 }]);
const topBottom = expandSlots([
  { position: 0, productId: POLO, colourIds: [], sizeIds: [], fixedVariantId: null, quantity: 1 },
  { position: 1, productId: CHINO, colourIds: ['sand'], sizeIds: [], fixedVariantId: null, quantity: 1 },
]);

describe('PR 91–93 · the price table', () => {
  it('a piece counts at its variant, else its colour`s lowest, else the piece`s lowest price', () => {
    expect(piecePrice(duo[0]!, 'red', null, VARIANTS)).toBe(120000);
    expect(piecePrice(duo[0]!, 'red', 'navy-m', VARIANTS)).toBe(100000);
    expect(piecePrice(duo[0]!, null, null, VARIANTS)).toBe(100000);
    expect(piecePrice(topBottom[1]!, 'sand', null, VARIANTS)).toBe(145000);
  });

  it('every mix of piece prices is priced once; past the cap the page asks the server', () => {
    const mixes = priceMixes(duo, VARIANTS, 512)!;
    expect(mixes.map(priceKeyOf).sort()).toEqual(['100000|100000', '100000|120000', '120000|100000', '120000|120000']);
    expect(priceMixes(duo, VARIANTS, 3)).toBeNull();
    expect(priceKeyOf([null, 5])).toBe('-|5');
  });

  it('the picks` key follows the colours before the sizes are picked, and the variants after', () => {
    const st = initialPicks(duo, VARIANTS, ['red', 'navy'], null);
    const check = checkPicks({ slots: duo, variants: VARIANTS, st, needsMix: true, onSale: true });
    expect(picksKey(duo, VARIANTS, st, check)).toBe('120000|100000');
  });
});

describe('PR 95 · each piece`s colour and size, with "Same size as item 1"', () => {
  it('a repeated product follows the first piece`s size by default; another product never does', () => {
    expect([linkSource(duo, 0), linkSource(duo, 1)]).toEqual([-1, 0]);
    expect(linkSource(topBottom, 1)).toBe(-1);
    const st = withSize(duo, initialPicks(duo, VARIANTS, ['navy', 'white'], null), 0, 'm');
    expect(st.same).toEqual([false, true]);
    expect(sizeOf(duo, st, 1)).toBe('m');
    expect(choicesOf(duo, st)).toEqual([
      { colourId: 'navy', sizeId: 'm' },
      { colourId: 'white', sizeId: 'm' },
    ]);
  });

  it('a size of its own stops following; ticking the box again follows again', () => {
    let st = withSize(duo, initialPicks(duo, VARIANTS, ['navy', 'red'], null), 0, 'm');
    st = withSize(duo, st, 1, 'l');
    expect([st.same[1], sizeOf(duo, st, 1)]).toEqual([false, 'l']);
    st = withSame(duo, VARIANTS, st, 1, true);
    expect(sizeOf(duo, st, 1)).toBe('m');
    // switched off: the piece keeps the size it followed, where its own colour has it
    expect(sizeOf(duo, withSame(duo, VARIANTS, st, 1, false), 1)).toBe('m');
    expect(sizeOf(duo, withSame(duo, VARIANTS, withSize(duo, st, 0, 'l'), 1, false), 1)).toBe('l');
  });

  it('a colour change drops a size sold out in it; a follower keeps the size when its own colour has it (R16 16)', () => {
    const st = withSize(duo, initialPicks(duo, VARIANTS, ['navy', 'red'], null), 0, 'l');
    const r = withColours(duo, VARIANTS, st, ['white', 'red']);
    expect(r.state.sizes).toEqual([null, 'l']);
    expect(r.state.same).toEqual([false, false]);
    expect(r.notes).toEqual([{ slot: 0, kind: 'SIZE_GONE', size: 'l', colourId: 'white', kept: [1] }]);
    // the follower's colour is sold out too: both drop, each with its note
    const r2 = withColours(duo, VARIANTS, st, ['white', 'grey']);
    expect(r2.state.sizes).toEqual([null, null]);
    expect(r2.notes.map((n) => [n.slot, n.kind])).toEqual([
      [0, 'SIZE_GONE'],
      [1, 'SIZE_GONE_TOO'],
    ]);
  });

  it('a piece with one allowed colour keeps it; the set being changed in the bag opens on its own picks', () => {
    const st = initialPicks(topBottom, VARIANTS, ['navy', null], null);
    expect(st.colours).toEqual(['navy', 'sand']);
    expect(withColours(topBottom, VARIANTS, st, ['white', 'navy']).state.colours).toEqual(['white', 'sand']);
    const edit = initialPicks(duo, VARIANTS, ['navy', 'white'], [
      { colourId: 'red', sizeId: 'l' },
      { colourId: 'navy', sizeId: 'l' },
    ]);
    expect(edit).toEqual({ colours: ['red', 'navy'], sizes: ['l', 'l'], same: [false, true] });
  });

  it('the page`s check is the bag`s check: what is missing in page order, and the colour-pair rule', () => {
    const st = initialPicks(duo, VARIANTS, ['navy', 'navy'], null);
    const c = checkPicks({ slots: duo, variants: VARIANTS, st, needsMix: true, onSale: true });
    expect(c.first).toMatchObject({ code: 'PICK_SIZE', slot: 0 });
    const done = checkPicks({ slots: duo, variants: VARIANTS, st: withSize(duo, st, 0, 'm'), needsMix: true, onSale: true });
    expect(done.problems.map((p) => p.code)).toEqual(['SAME_COLOUR']);
    const bag = checkPicks({ slots: duo, variants: VARIANTS, st: withSize(duo, withColours(duo, VARIANTS, st, ['navy', 'white']).state, 0, 'm'), inBag: { 'navy-m': 3 }, needsMix: true, onSale: true });
    expect(bag.first).toMatchObject({ code: 'NOT_ENOUGH', slot: 0, inBag: 3 });
  });
});

describe('PR 94 · popular pairs', () => {
  it('three to a row: 1, 2, 3 or 6, never more than the owner`s limit', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map((n) => pairsShown(n, 6))).toEqual([0, 1, 2, 3, 3, 3, 6, 6]);
    expect(pairsShown(6, 4)).toBe(3);
  });

  it('what customers picked first, then the owner`s colour order; only open colours, different for a colour pair', () => {
    const pairs = popularPairs({ slots: duo, variants: VARIANTS, colourOrder: ORDER, learned: [['red', 'white'], ['grey', 'navy']], needsMix: true, max: 6 });
    expect(pairs[0]).toEqual(['white', 'red']);
    expect(pairs.some((p) => p.includes('grey'))).toBe(false);
    expect(pairs).toEqual([
      ['white', 'red'],
      ['navy', 'white'],
      ['navy', 'red'],
    ]);
    expect(popularPairs({ slots: topBottom, variants: VARIANTS, colourOrder: ORDER, learned: [], needsMix: false, max: 6 })).toEqual([]);
    expect(popularPairs({ slots: trio, variants: VARIANTS, colourOrder: ORDER, learned: [], needsMix: true, max: 6 })).toEqual([['navy', 'white', 'red']]);
    expect(popularPairs({ slots: duo, variants: VARIANTS, colourOrder: ORDER, learned: [], needsMix: true, max: 0 })).toEqual([]);
  });

  it('a pair not made in the sizes already picked is greyed, with that size', () => {
    const st = withSize(duo, initialPicks(duo, VARIANTS, ['navy', 'red'], null), 0, 'l');
    expect(pairFits(duo, VARIANTS, st, ['navy', 'red'])).toEqual({ ok: true, size: null });
    expect(pairFits(duo, VARIANTS, st, ['navy', 'white'])).toEqual({ ok: false, size: 'l' });
  });
});

describe('PR 103 · cards grouped for the customer', () => {
  it('one card per fixed set, one per rule and product mix with its pairs in rank order', () => {
    const g = groupCards([
      { comboId: 'a', ruleId: null, productIds: [POLO, CHINO], sortRank: 0 },
      { comboId: 'p2', ruleId: 'r1', productIds: [POLO, POLO], sortRank: 2 },
      { comboId: 'p1', ruleId: 'r1', productIds: [POLO, POLO], sortRank: 1 },
      { comboId: 'q1', ruleId: 'r1', productIds: [CHINO, CHINO], sortRank: 0 },
    ]);
    expect(g.map((x) => [x.key, x.cards.map((c) => c.comboId)])).toEqual([
      ['a', ['a']],
      ['r1:polo', ['p1', 'p2']],
      ['r1:chino', ['q1']],
    ]);
  });

  it('fills {tokens} and leaves an unknown one visible', () => {
    expect(fillIn('Save {amount} on {n}', { amount: '৳ 200' })).toBe('Save ৳ 200 on {n}');
  });
});
