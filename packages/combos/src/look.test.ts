// PR 128 — "Complete your look" without a database: only the shop's real combos suggest a piece, in the order its own
// data ranks them (customers' picks, then featured and the owner's sort order), never a piece already ordered.
import { describe, expect, it } from 'vitest';
import { rankLook, type LookCombo } from './look';

const combo = (id: string, productIds: (string | null)[], more: Partial<LookCombo> = {}): LookCombo => ({ id, isFeatured: false, sortRank: 0, picks: 0, productIds, ...more });

describe('PR 128 · rankLook', () => {
  it('suggests the other pieces of combos that hold an ordered product, never the ordered ones', () => {
    const combos = [combo('c1', ['shirt', 'chino']), combo('c2', ['tee', 'shorts']), combo('c3', ['shirt', null, 'belt'])];
    expect(rankLook(combos, new Set(['shirt']), 5)).toEqual(['chino', 'belt']);
    expect(rankLook(combos, new Set(['shirt', 'chino']), 5)).toEqual(['belt']);
  });

  it("ranks by customers' picks, then featured, then the owner's order; stops at the limit; nothing without a combo", () => {
    const combos = [combo('a', ['shirt', 'chino'], { sortRank: 1 }), combo('b', ['shirt', 'belt'], { picks: 9 }), combo('c', ['shirt', 'socks'], { isFeatured: true, sortRank: 5 }), combo('d', ['shirt', 'cap'], { sortRank: 0 })];
    expect(rankLook(combos, new Set(['shirt']), 10)).toEqual(['belt', 'socks', 'cap', 'chino']);
    expect(rankLook(combos, new Set(['shirt']), 2)).toEqual(['belt', 'socks']);
    expect(rankLook(combos, new Set(['jacket']), 3)).toEqual([]);
    expect(rankLook([], new Set(['shirt']), 3)).toEqual([]);
  });

  it('a piece in two combos is suggested once', () => {
    expect(rankLook([combo('a', ['shirt', 'chino']), combo('b', ['tee', 'chino'])], new Set(['shirt', 'tee']), 5)).toEqual(['chino']);
  });
});
