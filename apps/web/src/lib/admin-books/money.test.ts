// CN-029 qa-gate (PR 615 / 616): what a person types in a money box of the books pages. A comma groups digits (1,000 or
// the Bangladeshi 1,00,000 are one thousand and one lakh taka), Bengali digits are read, and more decimals than the
// currency has are refused — never cut off.
import { describe, expect, it } from 'vitest';
import { typedMinor } from './money';

describe('PR 615 / 616 · the money box', () => {
  it('reads taka with grouping commas and Bengali digits', () => {
    expect(['1000', '1,000', '1,00,000', '1,000.50', '650.5', '৬৫০.৫০', ' 12 '].map((t) => typedMinor(t, 2))).toEqual([100000, 100000, 10000000, 100050, 65050, 65050, 1200]);
  });

  it('refuses a third decimal, a decimal comma, stray commas and words', () => {
    expect(['650.005', '650,5', '1,,000', ',100', '100,', '1.000,50', 'ten', '', '-5'].map((t) => typedMinor(t, 2))).toEqual(Array(9).fill(null));
  });

  it('follows the currency`s digits', () => {
    expect([typedMinor('12', 0), typedMinor('12.5', 0), typedMinor('1.234', 3)]).toEqual([12, null, 1234]);
  });
});
