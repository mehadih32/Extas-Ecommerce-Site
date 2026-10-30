// CN-029 qa-gate (PR 615 / 616): the books read money exactly. An amount with more decimals than the currency has, or
// one that is not a plain number, is refused (null) — never rounded and never read as 0. The stock sync's own reader
// (`decimalToMinor`, PR 196) still rounds an average cost, as the v5 contract wants.
import { describe, expect, it } from 'vitest';
import { decimalToMinor, moneyMinor } from '../src';

describe('PR 615 / 616 · moneyMinor', () => {
  it('reads plain amounts in minor units, a trailing zero beyond the currency`s digits included', () => {
    expect(['650', '650.5', '650.50', '650.500', '-3.10', '0.01', ' 7.1 ', '1250'].map((t) => moneyMinor(t, 2))).toEqual([65000, 65050, 65050, 65050, -310, 1, 710, 125000]);
    expect([moneyMinor('12', 0), moneyMinor('12.0', 0), moneyMinor('1.234', 3)]).toEqual([12, 12, 1234]);
  });

  it('refuses a third decimal, grouping, words and empty text instead of guessing', () => {
    expect(['650.005', '650.001', '1,000', '', 'abc', '1e3', '650.1.2', '.5', '5.', '--1'].map((t) => moneyMinor(t, 2))).toEqual(Array(10).fill(null));
    expect([moneyMinor(null, 2), moneyMinor(undefined, 2), moneyMinor('12.5', 0)]).toEqual([null, null, null]);
  });

  it('leaves the v5 stock reader as it was (it rounds an average cost)', () => {
    expect(decimalToMinor('610.125', 2)).toBe(61013);
  });
});
