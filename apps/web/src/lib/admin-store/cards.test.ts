// PR 789 — Store details: the nine cards in the prototype's order, each box tied to a setting that exists, no box twice,
// and every box has its words in both languages.
import { describe, expect, it } from 'vitest';
import { registry, STORE_DETAILS_DEFAULT } from '@extas/settings';
import bn from '../../../messages/admin-store.bn.json';
import en from '../../../messages/admin-store.en.json';
import { allBoxes, LEGAL_BOXES, STORE_CARD_IDS, STORE_CARDS } from './cards';

type Tree = Record<string, unknown>;
const at = (d: Tree, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Tree | undefined)?.[k], d);

describe('PR 789 · Store details cards', () => {
  it('the cards follow the prototype: Business & legal first, Targets last', () => {
    expect(STORE_CARD_IDS).toEqual(['legal', 'addresses', 'contact', 'brand', 'social', 'print', 'numbers', 'tax', 'targets']);
  });
  it('every box is a setting that exists or a field of store.details, and no box repeats', () => {
    const seen = new Set<string>();
    for (const { box } of allBoxes()) {
      expect(Boolean(box.key) !== Boolean(box.d)).toBe(true);
      if (box.key) expect(registry[box.key], box.key).toBeDefined();
      if (box.d) expect(box.d in STORE_DETAILS_DEFAULT, box.d).toBe(true);
      const id = box.key ?? `d.${box.d}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });
  it('the four legal numbers are boxes of the cards', () => {
    for (const id of LEGAL_BOXES) expect(allBoxes().some((x) => x.box.id === id)).toBe(true);
  });
  it('every card and box has its words in English and Bengali', () => {
    for (const dict of [en, bn] as unknown as Tree[]) {
      for (const card of STORE_CARD_IDS) {
        expect(at(dict, `stp.c.${card}.h`), card).toBeTruthy();
        for (const b of STORE_CARDS[card]) {
          if (b.kind === 'pair') {
            expect(at(dict, `stp.c.${card}.${b.id}_en`)).toBeTruthy();
            expect(at(dict, `stp.c.${card}.${b.id}_bn`)).toBeTruthy();
          } else expect(at(dict, `stp.c.${card}.${b.id}`), `${card}.${b.id}`).toBeTruthy();
          for (const o of b.options ?? []) expect(at(dict, `stp.c.opt.${b.id}.${o}`), `${b.id}.${o}`).toBeTruthy();
        }
      }
    }
  });
});
