// PR 91–95, 103 — the combo pages' small pure rules: the gallery's pictures, the step names, the saving, the words, and
// the landing page's rows and their desktop packing (D-038).
import { describe, expect, it } from 'vitest';
import type { SetCard, SetCardRule } from '@extas/combos/page-model';
import { colourNames, hubRails, hubSeasons, packRails, savePct, stepLabels, viewShots, wordOf, type HubGroup } from './combo-model';
import type { PdpShot } from './product-model';

const photo = { src: 'x', srcset: [], width: 1, height: 1, alt: null } as unknown as PdpShot['photo'];

describe('PR 93 · each view of a piece shows its own photo, else the drawing of that view', () => {
  it('no photos: every view is the drawing of that side', () => {
    const v = viewShots('navy', []);
    expect([v.front.draw, v.back.draw, v.detail.draw, v.flat.draw]).toEqual(['front', 'back', 'detail', 'flat']);
    expect(v.front.photo).toBeNull();
  });
  it('photos: front, back, a fabric close-up for detail and the true-colour photo for the colour view', () => {
    const shots: PdpShot[] = [
      { id: 'a', kind: 'model', photo, draw: 'front' },
      { id: 'b', kind: 'back', photo, draw: 'back' },
      { id: 'c', kind: 'fabric', photo, draw: 'detail' },
      { id: 'd', kind: 'trueColour', photo, draw: 'flat' },
    ];
    const v = viewShots('navy', shots);
    expect([v.front.id, v.back.id, v.detail.id, v.flat.id]).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('PR 92 · step names', () => {
  it('a repeated piece is numbered, a single one keeps its name', () => {
    expect(stepLabels(['Polo', 'Chino'], String)).toEqual(['Polo', 'Chino']);
    expect(stepLabels(['Polo', 'Polo', 'Chino'], String)).toEqual(['Polo 1', 'Polo 2', 'Chino']);
  });
});

describe('PR 91 · the saving and the words', () => {
  it('the percentage is whole, and 0 without a regular price or a saving', () => {
    expect(savePct(250, 2300)).toBe(11);
    expect(savePct(0, 2300)).toBe(0);
    expect(savePct(250, null)).toBe(0);
  });
  it('a word fills its slots and shows its key when it is missing', () => {
    expect(wordOf({ 'combo.setOf': 'Set of {n}' }, 'setOf', { n: 2 })).toBe('Set of 2');
    expect(wordOf({}, 'nope')).toBe('combo.nope');
  });
  it('the colour names of the picks', () => {
    const pieces = [{ colours: [{ id: 'n', name: 'Navy' }] }, { colours: [{ id: 'k', name: 'Khaki' }] }] as unknown as Parameters<typeof colourNames>[0];
    expect(colourNames(pieces, ['n', 'k'])).toBe('Navy + Khaki');
  });
});

const card = (o: Partial<SetCard>): SetCard => ({
  comboId: o.comboId ?? 'c',
  slug: o.slug ?? 'c',
  nameEn: 'x',
  nameBn: null,
  descriptionEn: null,
  descriptionBn: null,
  type: 'FIXED',
  ruleId: o.ruleId ?? null,
  sortRank: 0,
  isFeatured: false,
  pieces: [],
  productIds: o.productIds ?? ['p', 'p'],
  colourIds: [],
  price: { pay: 1, regular: 2, saving: 1, was: null, offer: true },
});
const rule = (id: string, pairing: string, season: string | null): SetCardRule => ({ id, key: id, nameEn: id, nameBn: null, titleEn: null, titleBn: null, season, pairing, pieces: 2 });
const group = (key: string, c: SetCard): HubGroup => ({ key, ruleId: c.ruleId, cards: [c] });

describe('PR 103 · the landing page rows', () => {
  const rules = [rule('duo', 'SAME', 'summer'), rule('trio', 'SAME', 'winter'), rule('tb', 'ACROSS', 'summer')];
  const groups = [
    group('g1', card({ ruleId: 'duo', productIds: ['p', 'p'] })),
    group('g2', card({ ruleId: 'trio', productIds: ['p', 'p', 'p'] })),
    group('g3', card({ ruleId: 'tb', productIds: ['p', 'q'] })),
    group('g4', card({ comboId: 'fixed', productIds: ['h', 'j'] })),
  ];
  it('packs by piece count first, then top + bottom and mixed sets', () => {
    expect(hubRails(groups, rules, null).map((r) => [r.key, r.items.map((g) => g.key)])).toEqual([
      ['packs-2', ['g1']],
      ['packs-3', ['g2']],
      ['topBottom', ['g3', 'g4']],
    ]);
  });
  it('a season shows its own rules and every set without one', () => {
    expect(hubRails(groups, rules, 'winter').map((r) => r.key)).toEqual(['packs-3', 'topBottom']);
    expect(hubRails(groups, rules, 'winter')[1]!.items.map((g) => g.key)).toEqual(['g4']);
  });
  it('the tabs are the seasons the rules use, in the owner order', () => {
    expect(hubSeasons(groups, rules, ['winter', 'summer', 'monsoon'])).toEqual(['winter', 'summer']);
  });
});

describe('D-038 · on a computer the rows share lines of four columns', () => {
  it('a later row that fits moves up; a line with room left lets its last row stretch', () => {
    const p = packRails([
      { key: 'a', count: 3 },
      { key: 'b', count: 2 },
      { key: 'c', count: 1 },
    ]);
    expect(p.map((x) => [x.key, x.span, x.order])).toEqual([
      ['a', 3, 0],
      ['b', 4, 2],
      ['c', 1, 1],
    ]);
  });
  it('five or more cards take the whole line and scroll', () => {
    const [a] = packRails([{ key: 'a', count: 7 }]);
    expect(a).toMatchObject({ n: 4, span: 4, many: true });
  });
});
