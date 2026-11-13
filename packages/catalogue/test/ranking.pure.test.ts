// S28 · PR 686 — the shop ranking's score and order, without a database (the owner's weights, the pins, a sold-out size).
import { describe, expect, it } from 'vitest';
import { rankParts, scoreProducts, sortRankOf, type RankInput } from '../src';

const W = { sales: 35, conv: 20, margin: 15, stock: 20, fresh: 10 };
const S = { weights: W, freshDays: 120, coverDays: 30 };
const base: RankInput = { productId: 'a', sold30: 10, views30: 100, margin: 0.4, sizesTotal: 4, sizesInStock: 4, stockDays: 60, ageDays: 10, pin: null };
const mk = (id: string, o: Partial<RankInput> = {}): RankInput => ({ ...base, productId: id, ...o });

describe('score (PR 686)', () => {
  it('gives the best of everything 100 and nothing of anything 0', () => {
    const [best] = scoreProducts([mk('a', { ageDays: 0 })], S);
    expect(best!.score).toBe(100);
    const [none] = scoreProducts([mk('a', { sold30: 0, views30: 0, margin: 0, sizesInStock: 0, stockDays: null, ageDays: 500 })], S);
    expect(none!.score).toBe(0);
  });

  it('puts the better seller first', () => {
    const rows = scoreProducts([mk('slow', { sold30: 1 }), mk('fast', { sold30: 30 })], S);
    expect(rows.map((r) => r.productId)).toEqual(['fast', 'slow']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('lowers the score of a product with a sold-out size, by itself', () => {
    const full = scoreProducts([mk('full'), mk('gap', { sizesInStock: 2 })], S);
    expect(full[0]!.productId).toBe('full');
    expect(full[0]!.score).toBeGreaterThan(full[1]!.score);
  });

  it('follows the owner weights: only newness counts when the other weights are 0', () => {
    const only = { weights: { sales: 0, conv: 0, margin: 0, stock: 0, fresh: 10 }, freshDays: 120, coverDays: 30 };
    const rows = scoreProducts([mk('old', { sold30: 99, ageDays: 100 }), mk('new', { sold30: 1, ageDays: 1 })], only);
    expect(rows[0]!.productId).toBe('new');
  });

  it('scores 0 for everyone when every weight is 0, and still gives an order', () => {
    const zero = { weights: { sales: 0, conv: 0, margin: 0, stock: 0, fresh: 0 }, freshDays: 120, coverDays: 30 };
    const rows = scoreProducts([mk('b'), mk('a')], zero);
    expect(rows.every((r) => r.score === 0)).toBe(true);
    expect(rows.map((r) => r.productId)).toEqual(['a', 'b']);
  });

  it('keeps a pin above and a push-down below the score', () => {
    const rows = scoreProducts([mk('mid'), mk('star', { sold30: 50 }), mk('launch', { sold30: 0, pin: 'TOP' }), mk('tail', { sold30: 40, pin: 'DOWN' })], S);
    expect(rows.map((r) => r.productId)).toEqual(['launch', 'star', 'mid', 'tail']);
  });

  it('never counts a missing cost as a good margin, and a product nobody saw as 0 visitors who buy', () => {
    const p = rankParts(mk('x', { margin: 0, views30: 0 }), { sold: 10, conv: 0.1, margin: 0.4 }, S);
    expect(p.margin).toBe(0);
    expect(p.conv).toBe(0);
  });

  it('counts stock with no sales as healthy only when sizes are there', () => {
    const max = { sold: 1, conv: 1, margin: 1 };
    expect(rankParts(mk('x', { stockDays: null }), max, S).stock).toBe(1);
    expect(rankParts(mk('x', { stockDays: null, sizesInStock: 0 }), max, S).stock).toBe(0);
  });

  it('turns a place into a sortRank: the first gets the count, the last 1', () => {
    expect(sortRankOf(1, 5)).toBe(5);
    expect(sortRankOf(5, 5)).toBe(1);
    expect(sortRankOf(9, 5)).toBe(1);
  });
});
