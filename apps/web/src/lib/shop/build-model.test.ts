// PR 98, 100 — what the set builder page draws (pure): the headline and tab line from the tiers, the status lines
// from @extas/combos' quote, each card's colour and price, the shop's words and the picture's turn. Made-up values.
import { describe, expect, it } from 'vitest';
import { tierQuote, type BuildVariant } from '@extas/combos/pure';
import { buildWord, cardPrice, firstColour, headline, nextView, statusOf, tabLine } from './build-model';

const words: Record<string, string> = {
  headFirst: 'Any {n} for {price}',
  headMore: '{n} for {price}',
  headJoin: ' · ',
  tabOne: 'Any {n} · {price}',
  tabTwo: '{n} for {price} · {m} for {price2}',
  'status.atLeast': 'Pick at least {n}',
  'status.first': 'Pick {n} for {price}',
  'status.unlock': '{more} more for {price}',
  'status.line': '{n} pieces · {price}',
  'status.lineSave': '{n} pieces · {price} · save {saving}',
  'status.next': '{more} more makes {n} for {price}',
  'status.best': 'Best price',
};
const w = (k: string, v?: Record<string, string | number>) => buildWord(words, k, v);
const money = (n: number) => `৳${n / 100}`;
const num = (n: number) => String(n);
const tiers = [
  { quantity: 2, priceMinor: 150000 },
  { quantity: 3, priceMinor: 210000 },
];

const v = (id: string, colourId: string, sizeId: string, sellable: number, priceMinor: number | null): BuildVariant => ({ id, productId: 'p', colourId, sizeId, sellable, priceMinor });

describe('the set builder page model (PR 98, 100)', () => {
  it('says the tiers in the shop`s words', () => {
    expect(headline(tiers, w, money, num)).toBe('Any 2 for ৳1500 · 3 for ৳2100');
    expect(tabLine(tiers, w, money, num)).toBe('2 for ৳1500 · 3 for ৳2100');
    expect(tabLine(tiers.slice(0, 1), w, money, num)).toBe('Any 2 · ৳1500');
    expect(tabLine([], w, money, num)).toBe('');
  });

  it('tells the shopper where the set stands, from the combos quote only', () => {
    expect(statusOf(tierQuote([], tiers), w, money, num)).toEqual({ line: 'Pick at least 2', sub: 'Pick 2 for ৳1500' });
    expect(statusOf(tierQuote([90000], tiers), w, money, num)).toEqual({ line: 'Pick at least 2', sub: '1 more for ৳1500' });
    const two = statusOf(tierQuote([90000, 90000], tiers), w, money, num);
    expect(two.line).toBe('2 pieces · ৳1500 · save ৳300');
    expect(two.sub).toBe('1 more makes 3 for ৳2100');
    expect(statusOf(tierQuote([90000, 90000, 90000], tiers), w, money, num).sub).toBe('Best price');
    expect(statusOf(tierQuote([90000], []), w, money, num)).toEqual({ line: '', sub: '' });
  });

  it('opens a card on a colour that can be had and shows the picked size`s own price', () => {
    const card = {
      colours: [{ id: 'red' }, { id: 'blue' }],
      variants: [v('r-m', 'red', 'm', 0, 90000), v('b-m', 'blue', 'm', 4, 95000), v('b-l', 'blue', 'l', 2, 99000)],
    };
    expect(firstColour(card as never)).toBe('blue');
    expect(cardPrice(card as never, 'blue', 'l')).toBe(99000);
    expect(cardPrice(card as never, 'blue', null)).toBe(95000);
    expect(cardPrice(card as never, 'green', null)).toBe(90000);
  });

  it('keeps a missing word visible as its key, and turns the picture front → back → detail → front', () => {
    expect(buildWord(words, 'nope')).toBe('build.nope');
    expect(buildWord(words, 'tabOne', { n: 2 })).toBe('Any 2 · {price}');
    expect([nextView('front'), nextView('back'), nextView('detail')]).toEqual(['back', 'detail', 'front']);
  });
});
