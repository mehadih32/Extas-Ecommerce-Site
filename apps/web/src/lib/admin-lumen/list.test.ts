// PR 628 (CN-036) — the list's chips, search and "Show more".
import { describe, expect, it } from 'vitest';
import { chipCounts, filterRows, moreCount } from './list';

const rows = [
  { id: '1', chips: ['new', 'cod'], text: 'EX-1001 Rahim 01711' },
  { id: '2', chips: ['new'], text: 'EX-1002 করিম 01811' },
  { id: '3', chips: ['packed'], text: 'EX-1003 Rahima 01911' },
];

describe('list filter', () => {
  it('filters by chip and by every search word, any case, Bengali too', () => {
    expect(filterRows(rows, 'all', '').map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(filterRows(rows, 'new', '').map((r) => r.id)).toEqual(['1', '2']);
    expect(filterRows(rows, 'all', 'rahim').map((r) => r.id)).toEqual(['1', '3']);
    expect(filterRows(rows, 'all', 'RAHIM 019').map((r) => r.id)).toEqual(['3']);
    expect(filterRows(rows, 'all', 'করিম').map((r) => r.id)).toEqual(['2']);
    expect(filterRows(rows, 'packed', 'karim')).toEqual([]);
  });

  it('counts each chip with the search applied', () => {
    expect(chipCounts(rows, ['new', 'cod', 'packed'], '')).toEqual({ all: 3, new: 2, cod: 1, packed: 1 });
    expect(chipCounts(rows, ['new', 'cod', 'packed'], 'rahim')).toEqual({ all: 2, new: 1, cod: 1, packed: 1 });
  });

  it('adds at most one step of rows, never more than are left', () => {
    expect(moreCount(30, 12, 12)).toBe(12);
    expect(moreCount(30, 24, 12)).toBe(6);
    expect(moreCount(12, 12, 12)).toBe(0);
    expect(moreCount(5, 12, 12)).toBe(0);
  });
});
