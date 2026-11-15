// PR 785 (lane D1): days of stock left = stock / (sold in 30 days / 30); no sales means no figure.
import { describe, expect, it } from 'vitest';
import { stockDays } from './admin-stock-overview';

describe('stockDays', () => {
  it('has no figure when nothing sold in 30 days', () => expect(stockDays(40, 0)).toBeNull());
  it('works out the days the stock lasts', () => {
    expect(stockDays(30, 30)).toBe(30);
    expect(stockDays(10, 60)).toBe(5);
  });
  it('rounds down and reaches 0 when sold out', () => {
    expect(stockDays(5, 20)).toBe(7);
    expect(stockDays(0, 20)).toBe(0);
  });
});
