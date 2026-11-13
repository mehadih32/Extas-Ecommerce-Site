import { describe, expect, it } from 'vitest';
import { PEAK_DEFAULT } from '@extas/settings';
import { peakFullText, peakStatus, printParts } from '../src/peak';

describe('Peak and Eid mode (PR 679)', () => {
  it('is quiet as shipped', () => {
    expect(peakStatus(PEAK_DEFAULT, 500)).toEqual({ watching: false, left: null, full: false });
    expect(peakStatus({ ...PEAK_DEFAULT, enabled: true }, 500).watching).toBe(false);
    expect(peakStatus(null, 1).full).toBe(false);
  });
  it('fills at the cap, never goes negative', () => {
    const p = { ...PEAK_DEFAULT, enabled: true, dailyCap: 100 };
    expect(peakStatus(p, 40)).toEqual({ watching: true, left: 60, full: false });
    expect(peakStatus(p, 100).full).toBe(true);
    expect(peakStatus(p, 150).left).toBe(0);
  });
  it('falls back to the English words', () => {
    const p = { ...PEAK_DEFAULT, fullTextEn: ' Full today ', fullTextBn: '' };
    expect(peakFullText(p, 'bn')).toBe('Full today');
    expect(peakFullText({ ...p, fullTextBn: 'আজ ভরা' }, 'bn')).toBe('আজ ভরা');
    expect(peakFullText(null, 'en')).toBe('');
  });
  it('cuts a print run into parts, or leaves it whole', () => {
    expect(printParts([1, 2, 3, 4, 5], { ...PEAK_DEFAULT, partSize: 2 })).toEqual([[1, 2], [3, 4], [5]]);
    expect(printParts([1, 2, 3], PEAK_DEFAULT)).toEqual([[1, 2, 3]]);
    expect(printParts([], { ...PEAK_DEFAULT, partSize: 2 })).toEqual([]);
  });
});
