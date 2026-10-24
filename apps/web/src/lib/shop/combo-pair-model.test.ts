// PR 573 — the pair page templates' rules without a browser: which template opens, which sizes are open after the
// bag's own, the bag's choices per slot, "Make it 3 pcs", P2's picks, P3/P4's colours and shared sizes. Made-up values.
import { describe, expect, it } from 'vitest';
import type { ListPair, ListPiece } from '@extas/combos/rule-page-model';
import {
  bothSizes,
  choicesFor,
  mixColours,
  otherPairsOf,
  pairTemplateOf,
  pickGroups,
  pieceNouns,
  pieceOk,
  priceIn,
  resolvePicks,
  sameSizeGroup,
  slotSizes,
  togglePick,
  upsellOptions,
  wordIn,
  type PairEnv,
  type PairProduct,
} from './combo-pair-model';

const SIZES = ['S', 'M', 'L'].map((k) => ({ id: `sz-${k}`, key: k, label: k }));
const BOTTOM = ['30', '32'].map((k) => ({ id: `bz-${k}`, key: k, label: k }));
const product = (id: string, colours: string[], sizes = SIZES, stock: Record<string, number> = {}): PairProduct => ({
  id,
  name: id,
  href: null,
  garment: null,
  colours: colours.map((c) => ({ id: c, key: c, name: c.toUpperCase(), hex: '#000000' })),
  sizes,
  variants: colours.flatMap((c) => sizes.map((s) => ({ id: `${id}-${c}-${s.key}`, colourId: c, sizeId: s.id, sellable: stock[`${c}-${s.key}`] ?? 5, priceMinor: 1000 }))),
  photos: {},
  chart: null,
});
const piece = (productId: string, colourId: string): ListPiece => ({ productId, colourId });
const pair = (rank: number, pieces: ListPiece[], over: Partial<ListPair> = {}): ListPair => ({
  comboId: `c${rank}`,
  slug: `r~${pieces.map((p) => p.colourId).join('-')}`,
  pieceKey: '',
  pieces,
  slots: [...pieces].reverse(),
  sameProduct: new Set(pieces.map((p) => p.productId)).size === 1,
  styleKey: pieces[0]!.productId,
  sizes: [],
  openSizes: 3,
  price: { pay: 1800, regular: 2000, saving: 200, was: null, offer: true },
  isNew: false,
  pinned: false,
  pairSales: 0,
  colourSales: 0,
  colourOrder: '',
  rank,
  ...over,
});

const polo = product('polo', ['black', 'navy', 'white'], SIZES, { 'navy-M': 1 });
const pants = product('pants', ['black', 'olive'], BOTTOM);
const me = pair(0, [piece('polo', 'black'), piece('polo', 'navy')]);
const three = pair(10, [piece('polo', 'black'), piece('polo', 'navy'), piece('polo', 'white')], { price: { pay: 2400, regular: 3000, saving: 600, was: null, offer: true } });
const env = (over: Partial<PairEnv> = {}) =>
  ({
    products: [polo, pants],
    inBag: {},
    me,
    side: { rule: { key: 'r', pieces: 2, pairing: 'STYLE', title: 'Polo', href: '/combos/r' }, pairs: [me, pair(1, [piece('polo', 'black'), piece('polo', 'white')])], prices: null },
    companion: { rule: { key: 'r3', pieces: 3, pairing: 'STYLE', title: 'Polo', href: '/combos/r3' }, pairs: [three], prices: null },
    ...over,
  }) as PairEnv;

describe('which template a pair page opens', () => {
  it('a preview while previews are on, the builder`s pick-your-colours, else its own', () => {
    expect(pairTemplateOf('current', { tpl: 'P3', pick: false }, true)).toBe('P3');
    expect(pairTemplateOf('current', { tpl: 'P3', pick: false }, false)).toBe('current');
    expect(pairTemplateOf('P1', { tpl: 'P9', pick: false }, true)).toBe('P1');
    expect(pairTemplateOf('current', { tpl: null, pick: true }, true)).toBe('P2');
    expect(pairTemplateOf('P4', { tpl: 'current', pick: false }, true)).toBe('current');
  });
  it('fills a word`s slots', () => {
    expect(wordIn({ 'ctpl.x': 'Add both · {price}' }, 'ctpl.x', { price: '৳1,800' })).toBe('Add both · ৳1,800');
    expect(wordIn({}, 'ctpl.y')).toBe('ctpl.y');
  });
});

describe('sizes and the bag`s choices', () => {
  it('a size is open when every piece has it, after what the bag already holds', () => {
    expect(bothSizes(env(), me.pieces).map((s) => [s.key, s.ok])).toEqual([
      ['S', true],
      ['M', true],
      ['L', true],
    ]);
    const held = env({ inBag: { 'polo-navy-M': 1 } });
    expect(bothSizes(held, me.pieces).find((s) => s.key === 'M')).toMatchObject({ ok: false, out: [1] });
    // the same piece twice needs two
    const twice = [piece('polo', 'navy'), piece('polo', 'navy')];
    expect(pieceOk(env(), twice, 0, 'M')).toBe(false);
    expect(pieceOk(env(), twice, 0, 'S')).toBe(true);
    // a top and trousers share no size
    expect(bothSizes(env(), [piece('polo', 'black'), piece('pants', 'olive')])).toEqual([]);
  });
  it('gives each slot the size of its own piece, the 3rd piece the first piece`s size', () => {
    expect(slotSizes(me, me.pieces, ['S', 'L'])).toEqual(['L', 'S']);
    expect(slotSizes({ slots: [...three.slots] }, me.pieces, ['S', 'L'])).toEqual(['S', 'L', 'S']);
    expect(choicesFor(env(), me, ['L', 'S'])).toEqual([
      { colourId: 'navy', sizeId: 'sz-L' },
      { colourId: 'black', sizeId: 'sz-S' },
    ]);
  });
  it('prices a pair from the rule`s table once every size is known, else its first price', () => {
    const cell = { pay: 1700, regular: 2000, saving: 300, was: null, offer: true };
    expect(priceIn(env(), { prices: { '1000|1000': cell } }, me, ['S', 'S'])).toEqual(cell);
    expect(priceIn(env(), { prices: { '1000|1000': cell } }, me, ['S', null])).toBe(me.price);
  });
});

describe('P1 "Make it 3 pcs", P2 picks, P3/P4 colours', () => {
  it('offers the 3rd colours whose 3-piece set is on sale', () => {
    expect(upsellOptions(env()).map((x) => x.colourId)).toEqual(['white']);
    expect(upsellOptions(env({ companion: null }))).toEqual([]);
  });
  it('P2: one group of N colours for a pack, one per piece across styles; picks swap or roll', () => {
    expect(pickGroups(env(), env().side, me)).toEqual([{ productId: 'polo', pick: 2, colours: ['black', 'navy', 'white'] }]);
    const across = { rule: { key: 'a', pieces: 2, pairing: 'ACROSS' as const, title: '', href: '' }, pairs: [pair(0, [piece('polo', 'black'), piece('pants', 'olive')])], prices: null };
    expect(pickGroups(env(), across, across.pairs[0]!).map((g) => [g.productId, g.pick, g.colours])).toEqual([
      ['polo', 1, ['black']],
      ['pants', 1, ['olive']],
    ]);
    expect(togglePick(['a', 'b'], 'c', 0, false, 2)).toEqual(['b', 'c']);
    expect(togglePick(['a', 'b'], 'a', 0, false, 2)).toEqual(['b']);
    expect(togglePick(['a', 'b'], 'c', 1, true, 2)).toEqual(['a', 'c']);
    expect(resolvePicks(env().side, ['polo|white', 'polo|black']).pair?.rank).toBe(1);
    expect(resolvePicks(env().side, ['polo|white']).pair).toBeNull();
  });
  it('P3/P4: a colour is open when that mix is on sale; pieces that share a size list size together', () => {
    expect(mixColours(env(), env().side.pairs, me.pieces, 1)).toEqual([
      { id: 'black', ok: false },
      { id: 'navy', ok: true },
      { id: 'white', ok: true },
    ]);
    expect(sameSizeGroup(env(), [piece('polo', 'black'), piece('polo', 'navy'), piece('pants', 'olive')])).toEqual([0, 1]);
    expect(sameSizeGroup(env(), [piece('polo', 'black'), piece('pants', 'olive')])).toEqual([]);
    expect(pieceNouns(['Polo', 'Polo', 'Chino'], String)).toEqual(['Polo 1', 'Polo 2', 'Chino']);
  });
  it('the other pairs are the same products`, open, up to the setting', () => {
    expect(otherPairsOf(env().side.pairs, me, 14)).toHaveLength(2);
    expect(otherPairsOf(env().side.pairs, me, 1)).toHaveLength(1);
  });
});
