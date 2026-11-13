// S28 · PR 680 — the photo manager's pure helpers.
import { describe, expect, it } from 'vitest';
import { dropOnto, groupOf, imageFiles, move, roleForNext } from './photo-manager-model';

describe('photo manager model', () => {
  it('gives the next photo its kind by place', () => {
    expect([0, 1, 2, 3, 4, 9].map(roleForNext)).toEqual(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL', 'OTHER', 'OTHER']);
  });
  it('moves one place and stops at the ends', () => {
    expect(move(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 'zz', 1)).toEqual(['a', 'b', 'c']);
  });
  it('drops a photo onto another', () => {
    expect(dropOnto(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(dropOnto(['a', 'b', 'c'], 'a', 'a')).toEqual(['a', 'b', 'c']);
  });
  it('keeps only pictures from a drop or a paste', () => {
    expect(imageFiles([{ type: 'image/png' }, { type: 'text/plain' }, { type: 'image/jpeg' }])).toHaveLength(2);
    expect(imageFiles(null)).toEqual([]);
  });
  it('groups a gallery by colour in order', () => {
    const g = [
      { id: 1, colourId: 'x', sortOrder: 1 },
      { id: 2, colourId: null, sortOrder: 0 },
      { id: 3, colourId: 'x', sortOrder: 0 },
    ];
    expect(groupOf(g, 'x').map((p) => p.id)).toEqual([3, 1]);
    expect(groupOf(g, null).map((p) => p.id)).toEqual([2]);
  });
});
