// S16 · PR 350 — the VAT inside VAT-inclusive prices, without a database: the amount inside a price at a rate (rounded to
// the nearest minor unit), the rate of a line (product > category > parent > default > none; 0 % is a real rate; a loop in
// the category tree never hangs) and the spread of an order's goods over its lines that always adds up exactly.
import { describe, expect, it } from 'vitest';
import { apportion, vatInsideMinor, vatResolver } from './vat';

describe('PR 350 · VAT inside a price', () => {
  it('takes the VAT out of a VAT-inclusive amount, never adds it on top', () => {
    expect(vatInsideMinor(115_000, 1_500)).toBe(15_000); // ৳1,150 at 15 % holds ৳150
    expect(vatInsideMinor(100_000, 1_500)).toBe(13_043); // 1,000 × 15/115 = 130.434…
    expect(vatInsideMinor(105_000, 500)).toBe(5_000);
    expect(vatInsideMinor(100_000, 750)).toBe(6_977); // 6,976.74 → 6,977
    expect(vatInsideMinor(100_000, 0)).toBe(0);
    expect(vatInsideMinor(0, 1_500)).toBe(0);
    expect(vatInsideMinor(-115_000, 1_500)).toBe(-15_000);
    expect(() => vatInsideMinor(10.5, 1_500)).toThrow(RangeError);
  });

  it('finds the rate: the product, else its category, else the nearest parent with one, else the default, else none', () => {
    const parents = new Map<string, string | null>([
      ['shirts', null],
      ['formal', 'shirts'],
      ['slim', 'formal'],
      ['caps', null],
    ]);
    const rate = vatResolver({ defaultBps: 1_500, categories: [{ categoryId: 'shirts', bps: 750 }, { categoryId: 'caps', bps: 0 }], products: [{ productId: 'p-gift', bps: 500 }] }, parents);
    expect(rate('p-gift', 'slim')).toEqual({ bps: 500, source: 'product', fromCategoryId: null });
    expect(rate('p1', 'shirts')).toEqual({ bps: 750, source: 'category', fromCategoryId: 'shirts' });
    expect(rate('p1', 'slim')).toEqual({ bps: 750, source: 'parent', fromCategoryId: 'shirts' });
    expect(rate('p1', 'caps')).toEqual({ bps: 0, source: 'category', fromCategoryId: 'caps' });
    expect(rate('p1', null)).toEqual({ bps: 1_500, source: 'default', fromCategoryId: null });
    expect(rate(null, 'unknown')).toEqual({ bps: 1_500, source: 'default', fromCategoryId: null });
    const none = vatResolver({ defaultBps: null, categories: [], products: [] }, parents);
    expect(none('p1', 'slim')).toEqual({ bps: null, source: 'none', fromCategoryId: null });
    expect(vatResolver(null, parents)('p1', 'slim').source).toBe('none');
  });

  it('a loop in the category tree falls back to the default instead of hanging', () => {
    const loop = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    expect(vatResolver({ defaultBps: 1_000, categories: [], products: [] }, loop)('p', 'a')).toEqual({ bps: 1_000, source: 'default', fromCategoryId: null });
  });

  it("spreads an order's goods over its lines by line total, adding up exactly", () => {
    expect(apportion(90_000, [50_000, 50_000])).toEqual([45_000, 45_000]);
    expect(apportion(100, [1, 1, 1])).toEqual([34, 33, 33]);
    const odd = apportion(99_999, [33_333, 33_333, 33_334]);
    expect(odd.reduce((s, x) => s + x, 0)).toBe(99_999);
    expect(apportion(500, [0, 0])).toEqual([500, 0]);
    expect(apportion(0, [10, 20])).toEqual([0, 0]);
    expect(apportion(10, [])).toEqual([]);
  });
});
