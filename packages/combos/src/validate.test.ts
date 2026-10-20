// PR 101 — set validation without a database: each missing pick in page order, colours and sizes the set allows,
// sold out, the bag's own pieces counted (oversell), the colour-pair rule, "size for both", fixed variants, and the
// words for every problem in both languages. Made-up test ids and stock.
import { describe, expect, it } from 'vitest';
import { addWords, itemWords, problemWords, SET_WORDS } from './set-words';
import { checkSet, expandSlots, openSizes, SET_PROBLEMS, sharedSizes, type VariantStock } from './validate';

const POLO = 'polo';
const CHINO = 'chino';
const v = (id: string, productId: string, colourId: string | null, sizeId: string | null, sellable: number, priceMinor: number | null = 100000): VariantStock => ({ id, productId, colourId, sizeId, sellable, priceMinor });
const VARIANTS = [
  v('p-navy-m', POLO, 'navy', 'm', 3),
  v('p-navy-l', POLO, 'navy', 'l', 1),
  v('p-black-m', POLO, 'black', 'm', 0),
  v('p-black-l', POLO, 'black', 'l', 5),
  v('c-sand-m', CHINO, 'sand', 'm', 2),
  v('c-sand-l', CHINO, 'sand', 'l', 2),
];
const topBottom = expandSlots([
  { position: 0, productId: POLO, colourIds: [], sizeIds: [], fixedVariantId: null, quantity: 1 },
  { position: 1, productId: CHINO, colourIds: ['sand'], sizeIds: [], fixedVariantId: null, quantity: 1 },
]);
const pair = expandSlots([{ position: 0, productId: POLO, colourIds: [], sizeIds: [], fixedVariantId: null, quantity: 2 }]);
const base = { variants: VARIANTS, needsMix: false, onSale: true };

describe('PR 101 · set validation', () => {
  it('cuts items into one slot per piece, in order', () => {
    expect(pair.map((s) => [s.index, s.itemPosition])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(topBottom).toHaveLength(2);
  });

  it('says the first thing missing, in page order; a single allowed colour needs no pick', () => {
    const c0 = checkSet({ ...base, slots: topBottom, choices: [] });
    expect(c0.ok).toBe(false);
    expect(c0.first).toEqual({ code: 'PICK_COLOUR', slot: 0 });
    expect(c0.problems.map((p) => p.code)).toEqual(['PICK_COLOUR', 'PICK_SIZE']);
    const c1 = checkSet({ ...base, slots: topBottom, choices: [{ colourId: 'navy', sizeId: 'm' }] });
    expect(c1.first).toEqual({ code: 'PICK_SIZE', slot: 1 });
    expect(c1.done).toBe(1);
  });

  it('"size for both" fills every slot without its own size; then the set is complete', () => {
    const c = checkSet({ ...base, slots: topBottom, choices: [{ colourId: 'navy' }], sizeForAll: 'm' });
    expect(c).toMatchObject({ ok: true, done: 2, total: 2, variants: ['p-navy-m', 'c-sand-m'] });
  });

  it('a colour or size the set does not allow, a piece not made, sold out', () => {
    const narrow = expandSlots([{ position: 0, productId: POLO, colourIds: ['navy', 'black'], sizeIds: ['m', 'xl'], fixedVariantId: null, quantity: 1 }]);
    expect(checkSet({ ...base, slots: narrow, choices: [{ colourId: 'white', sizeId: 'm' }] }).first?.code).toBe('COLOUR_NOT_IN_SET');
    expect(checkSet({ ...base, slots: narrow, choices: [{ colourId: 'navy', sizeId: 'l' }] }).first?.code).toBe('SIZE_NOT_IN_SET');
    expect(checkSet({ ...base, slots: topBottom, choices: [{ colourId: 'navy', sizeId: 'xl' }, { sizeId: 'm' }] }).first?.code).toBe('NO_SUCH_PIECE');
    expect(checkSet({ ...base, slots: topBottom, choices: [{ colourId: 'black', sizeId: 'm' }, { sizeId: 'm' }] }).first).toEqual({ code: 'SOLD_OUT', slot: 0 });
  });

  it('counts the same piece twice in the set and what the bag already holds (no oversell)', () => {
    const twoNavyL = checkSet({ ...base, slots: pair, choices: [{ colourId: 'navy', sizeId: 'l' }, { colourId: 'navy', sizeId: 'l' }] });
    expect(twoNavyL.first).toEqual({ code: 'NOT_ENOUGH', slot: 1, stock: 1, need: 2, inBag: 0 });
    const bagged = checkSet({ ...base, slots: topBottom, choices: [{ colourId: 'navy', sizeId: 'm' }, { sizeId: 'm' }], inBag: { 'c-sand-m': 2 } });
    expect(bagged.first).toEqual({ code: 'NOT_ENOUGH', slot: 1, stock: 2, need: 1, inBag: 2 });
  });

  it('a colour pair of one product needs different colours unless the set says otherwise (K11)', () => {
    const same = [{ colourId: 'navy', sizeId: 'm' }, { colourId: 'navy', sizeId: 'm' }];
    expect(checkSet({ ...base, slots: pair, choices: same, needsMix: true }).problems.map((p) => p.code)).toEqual(['SAME_COLOUR']);
    expect(checkSet({ ...base, slots: pair, choices: same, needsMix: false }).ok).toBe(true);
  });

  it('not on sale, a piece with no price, and a fixed variant (no picks needed)', () => {
    const fixed = expandSlots([
      { position: 0, productId: POLO, colourIds: [], sizeIds: [], fixedVariantId: 'p-black-l', quantity: 1 },
      { position: 1, productId: CHINO, colourIds: [], sizeIds: [], fixedVariantId: 'c-sand-l', quantity: 1 },
    ]);
    expect(checkSet({ ...base, slots: fixed, choices: [] })).toMatchObject({ ok: true, variants: ['p-black-l', 'c-sand-l'] });
    expect(checkSet({ ...base, slots: fixed, choices: [], onSale: false }).first).toEqual({ code: 'NOT_ON_SALE', slot: null });
    const noPrice = VARIANTS.map((x) => (x.id === 'c-sand-l' ? { ...x, priceMinor: null } : x));
    expect(checkSet({ ...base, variants: noPrice, slots: fixed, choices: [] }).first).toEqual({ code: 'NO_PRICE', slot: 1 });
  });

  it('the sizes offered are only those in stock; "size for both" offers what every piece has', () => {
    expect(openSizes(pair[0]!, 'black', VARIANTS)).toEqual(['l']);
    expect(sharedSizes(topBottom, [{ colourId: 'navy' }], VARIANTS)).toEqual(['m', 'l']);
    expect(sharedSizes(topBottom, [{ colourId: 'black' }], VARIANTS)).toEqual(['l']);
  });
});

describe('PR 101 · the set words', () => {
  it('every problem has words in both languages with no token left; English has no Bengali', () => {
    for (const lang of ['en', 'bn'] as const) {
      for (const code of SET_PROBLEMS) {
        const line = problemWords(lang, { code, slot: 0, stock: 1, need: 2, inBag: code === 'NOT_ENOUGH' ? 1 : 0 }, { item: itemWords(lang, 1, 'Polo'), colour: 'Navy', size: 'M' });
        expect(line, `${lang} ${code}`).not.toMatch(/\{\w+\}/);
        expect(line.length).toBeGreaterThan(0);
        if (lang === 'en') expect(/[ঀ-৿]/.test(line), code).toBe(false);
      }
    }
    expect(Object.keys(SET_WORDS.bn.problem).sort()).toEqual(Object.keys(SET_WORDS.en.problem).sort());
  });

  it('one button wording: both for two pieces, all n for more (D8.1)', () => {
    expect(addWords('en', 2, 'BDT 1,800')).toBe('Add both to bag · BDT 1,800');
    expect(addWords('en', 3, 'BDT 2,400')).toBe('Add all 3 to bag · BDT 2,400');
    expect(addWords('bn', 3, '৳২,৪০০', (n) => n.toLocaleString('bn-BD'))).toContain('৩');
  });
});
