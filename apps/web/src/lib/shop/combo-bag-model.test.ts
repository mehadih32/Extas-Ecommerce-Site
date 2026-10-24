// PR 574 — the bag templates' rules without a browser: which look a set gets, B5's compact rows, B2's choices and B3's
// "Add 1 more" colours. Made-up values.
import { describe, expect, it } from 'vitest';
import type { ListPair, ListPiece } from '@extas/combos/rule-page-model';
import { bagDrawOf, bagTemplateOf, nudgeOf, sizeChoices, sizesInBag, type NudgeSide } from './combo-bag-model';

const SIZES = ['S', 'M', 'L'].map((k) => ({ id: `sz-${k}`, key: k, label: k }));
const COLOURS = ['black', 'navy', 'white', 'olive'].map((c) => ({ id: c, key: c, nameEn: c, nameBn: null, hex: '#000000' }));
const cell = (pay: number, saving: number) => ({ pay, regular: pay + saving, saving, was: null, offer: true });
const trio = (colours: string[], over: Partial<ListPair> = {}): ListPair => {
  const pieces: ListPiece[] = colours.map((c) => ({ productId: 'polo', colourId: c }));
  return {
    comboId: colours.join('-'),
    slug: `trio~${colours.join('-')}`,
    pieceKey: '',
    pieces,
    slots: pieces,
    sameProduct: true,
    styleKey: 'polo',
    sizes: SIZES.map((s) => ({ key: s.key, label: s.label, ok: true, sets: 5, out: [] })),
    openSizes: 3,
    price: cell(2160, 390),
    isNew: false,
    pinned: false,
    pairSales: 0,
    colourSales: 0,
    colourOrder: '',
    rank: 0,
    ...over,
  };
};
const side = (pairs: ListPair[], stock: Record<string, number> = {}): NudgeSide => ({
  rule: { pieces: 3 },
  pairs,
  prices: null,
  products: [
    {
      id: 'polo',
      slug: 'polo',
      nameEn: 'Polo',
      nameBn: null,
      styleKey: 'polo',
      published: true,
      colours: COLOURS,
      sizes: SIZES,
      variants: COLOURS.flatMap((c) => SIZES.map((s) => ({ id: `${c.id}-${s.key}`, colourId: c.id, sizeId: s.id, sellable: stock[`${c.id}-${s.key}`] ?? 5, priceMinor: 900 }))),
    },
  ],
});
const pair = [
  { productId: 'polo', colourId: 'navy', sizeId: 'sz-M' },
  { productId: 'polo', colourId: 'black', sizeId: 'sz-M' },
];

describe('which look a set in the bag gets', () => {
  it('its own, a preview while previews are on, the current look for anything unknown', () => {
    expect(bagTemplateOf('current', null, true)).toBe('current');
    expect(bagTemplateOf('current', 'B4', true)).toBe('B4');
    expect(bagTemplateOf('B2', 'B4', false)).toBe('B2');
    expect(bagTemplateOf('B9', 'X', true)).toBe('current');
  });
  it('B5 is one compact row per set from `compactFrom` sets, under it the size card', () => {
    expect(bagDrawOf('B5', 3, 3)).toBe('B5row');
    expect(bagDrawOf('B5', 2, 3)).toBe('B5card');
    expect(bagDrawOf('B1', 9, 3)).toBe('B1');
    expect(['B1', 'B2', 'B3', 'B4', 'B5row', 'B5card'].map((d) => sizesInBag(d as never))).toEqual([false, true, true, false, true, true]);
  });
  it('B2 sends every piece`s colour and size, the changed one in its new size', () => {
    expect(sizeChoices(pair, 1, 'sz-L')).toEqual([
      { colourId: 'navy', sizeId: 'sz-M' },
      { colourId: 'black', sizeId: 'sz-L' },
    ]);
  });
});

describe('B3 "Add 1 more"', () => {
  it('offers each 3rd colour whose 3-piece set is on sale, in the pair`s size, priced as that set', () => {
    const n = nudgeOf(pair, side([trio(['navy', 'black', 'white']), trio(['black', 'navy', 'olive'])]))!;
    expect(n).toMatchObject({ sizeLabel: 'M', same: true, pieces: 3, price: { pay: 2160 } });
    expect(n.colours.map((c) => [c.colourId, c.ok, c.slug])).toEqual([
      ['white', true, 'trio~navy-black-white'],
      ['olive', true, 'trio~black-navy-olive'],
    ]);
    // the 3-piece set's own slot order; the pieces keep their sizes, the new one takes the first piece's
    expect(n.colours[1]!.choices).toEqual([
      { colourId: 'black', sizeId: 'sz-M' },
      { colourId: 'navy', sizeId: 'sz-M' },
      { colourId: 'olive', sizeId: 'sz-M' },
    ]);
  });
  it('a 3rd colour sold out in that size is shown but cannot go in; none left = no nudge', () => {
    const n = nudgeOf(pair, side([trio(['navy', 'black', 'white']), trio(['navy', 'black', 'olive'])], { 'white-M': 0 }))!;
    expect(n.colours.map((c) => [c.colourId, c.ok])).toEqual([
      ['white', false],
      ['olive', true],
    ]);
    expect(nudgeOf(pair, side([trio(['navy', 'black', 'white'])], { 'white-M': 0 }))).toBeNull();
  });
  it('only a 2-piece pair of one product, with a 3-piece companion', () => {
    expect(nudgeOf(pair, null)).toBeNull();
    expect(nudgeOf([pair[0]!, { productId: 'chino', colourId: 'olive', sizeId: 'sz-32' }], side([trio(['navy', 'black', 'white'])]))).toBeNull();
    expect(nudgeOf(pair, { ...side([trio(['navy', 'black', 'white'])]), rule: { pieces: 4 } })).toBeNull();
  });
});
