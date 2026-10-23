// PR 54 — which photos each colour shows, and the sums the strip and the full-screen viewer share.
import type { ImageSource } from '@extas/media';
import { describe, expect, it } from 'vitest';
import { clampPan, clampZoom, drawFor, nearestTile, shotsFor, stepTo, thumbsShown, type MediaRow } from './pdp-gallery';

const img = (id: string) => ({ id }) as unknown as ImageSource;
const row = (id: string, colour: string | null, role: string, photo = true): MediaRow => ({ id, colour, role, photo: photo ? img(id) : null });

describe('PR 54 · shots', () => {
  it("a colour shows its own photos, then the product's shared ones, in the owner's order; videos are left out", () => {
    const media = [row('s1', null, 'FABRIC'), row('n1', 'navy', 'FRONT'), row('v', 'navy', 'VIDEO'), row('n2', 'navy', 'TRUE_COLOUR'), row('w1', 'white', 'BACK', false)];
    const s = shotsFor(['navy', 'white'], media, ['front', 'back'], '*');
    expect(s.navy!.map((x) => [x.id, x.kind, x.draw])).toEqual([
      ['n1', 'front', 'front'],
      ['n2', 'trueColour', 'flat'],
      ['s1', 'fabric', 'detail'],
    ]);
    // a row without a picture does not count; the shared photo still shows
    expect(s.white!.map((x) => x.id)).toEqual(['s1']);
  });

  it('a colour with no photo shows the drawing, one tile per view; a product with no colour uses its own key', () => {
    const s = shotsFor([], [], ['front', 'flat'], '*');
    expect(s['*']).toEqual([
      { id: 'draw-*-front', kind: 'front', photo: null, draw: 'front' },
      { id: 'draw-*-flat', kind: 'flat', photo: null, draw: 'flat' },
    ]);
    expect(shotsFor(['red'], [], [], '*').red!.map((x) => x.draw)).toEqual(['front']);
  });

  it('every role has a drawing stand-in', () => {
    expect(drawFor('model')).toBe('model');
    expect(drawFor('set')).toBe('front');
    expect(drawFor('other')).toBe('front');
  });
});

describe('PR 54 · the strip and the viewer', () => {
  it('the arrows stop at both ends', () => {
    expect(stepTo(0, -1, 4)).toBe(0);
    expect(stepTo(3, 1, 4)).toBe(3);
    expect(stepTo(1, 1, 4)).toBe(2);
    expect(stepTo(2, 1, 0)).toBe(0);
  });

  it('the tile showing is the one nearest the scroll position', () => {
    expect(nearestTile([0, 390, 780], 0)).toBe(0);
    expect(nearestTile([0, 390, 780], 600)).toBe(2);
    expect(nearestTile([0, 390, 780], 410)).toBe(1);
    expect(nearestTile([], 50)).toBe(0);
  });

  it('zoom stays between the whole photo and the largest step; the photo edge never comes inside the frame', () => {
    expect(clampZoom(0.5, 4)).toBe(1);
    expect(clampZoom(9, 4)).toBe(4);
    expect(clampZoom(Number.NaN, 4)).toBe(1);
    expect(clampPan(500, -500, 2, { w: 400, h: 600 })).toEqual({ x: 200, y: -300 });
    expect(clampPan(10, 10, 1, { w: 400, h: 600 })).toEqual({ x: 0, y: 0 });
  });
});

describe('thumbnails beside the photo on a computer (demo owner B P8)', () => {
  it('shows them all while they fit, else the first ones with "+N" on the last', () => {
    expect(thumbsShown(5, 5, null)).toEqual({ shown: 5, more: 0 });
    expect(thumbsShown(7, 5, null)).toEqual({ shown: 5, more: 3 });
    expect(thumbsShown(7, 5, 4)).toEqual({ shown: 4, more: 4 });
    expect(thumbsShown(3, 5, 1)).toEqual({ shown: 2, more: 2 });
  });
});
