// Follow-up 112 — "Your size" from his own orders: tops and bottoms apart, the newest line per group, only within the
// days the owner set, and never a size word that is not a size key; joined with the browser's kept size by date.
import { describe, expect, it } from 'vitest';
import { usualFromLines } from './account-size';
import { joinKept, readUsual } from './usual-size';

const NOW = Date.parse('2026-11-07T10:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000);
const diagramFor = { trouser: 'bottom', polo: 'top' };

describe("the account's usual size (follow-up 112)", () => {
  it('keeps the newest size per group from his order lines', () => {
    const raw = usualFromLines(
      [
        { size: 'l', garment: 'polo', at: day(2) },
        { size: 'm', garment: 'polo', at: day(9) },
        { size: '32', garment: 'trouser', at: day(5) },
      ],
      diagramFor,
      180,
      NOW,
    );
    expect(readUsual(raw, 'top', 180, NOW, ['m', 'l'])).toBe('l');
    expect(readUsual(raw, 'bottom', 180, NOW, ['30', '32'])).toBe('32');
  });

  it('skips old lines, lines without a size and anything that is not a size key', () => {
    expect(usualFromLines([{ size: 'l', garment: 'polo', at: day(40) }], diagramFor, 30, NOW)).toBeNull();
    expect(usualFromLines([{ size: null, garment: 'polo', at: day(1) }], diagramFor, 30, NOW)).toBeNull();
    expect(usualFromLines([{ size: 'Extra Large!', garment: 'polo', at: day(1) }], diagramFor, 30, NOW)).toBeNull();
    expect(usualFromLines([], diagramFor, 30, NOW)).toBeNull();
  });

  it('joins with the browser by date: the newer wins in each group', () => {
    const browser = JSON.stringify({ top: { size: 'm', at: day(1).getTime() } });
    const account = JSON.stringify({ top: { size: 'l', at: day(3).getTime() }, bottom: { size: '32', at: day(3).getTime() } });
    const joined = joinKept(browser, account);
    expect(readUsual(joined, 'top', 30, NOW, ['m', 'l'])).toBe('m');
    expect(readUsual(joined, 'bottom', 30, NOW, ['32'])).toBe('32');
    expect(readUsual(joinKept(null, account), 'top', 30, NOW, ['m', 'l'])).toBe('l');
    expect(joinKept(browser, null)).toBe(browser);
    expect(readUsual(joinKept('not json', account), 'top', 30, NOW, ['l'])).toBe('l');
  });
});
