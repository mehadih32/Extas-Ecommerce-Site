// PR 54 — which photos each colour shows, and the sums the strip and the full-screen viewer share.
// PR 461 — the S24 on-model order and angle labels on top of the same shots.
import type { ImageSource } from '@extas/media';
import { describe, expect, it } from 'vitest';
import { clampPan, clampZoom, drawFor, nearestTile, onModelAngles, shotsFor, stepTo, thumbsShown, withOnModelOrder, type MediaRow } from './pdp-gallery';
import type { PdpShot } from './product-model';

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

describe('PR 461 · S24 on-model order and angle labels (Blueprint C7.15)', () => {
  const shot = (id: string, kind: PdpShot['kind']): PdpShot => ({ id, kind, photo: null, draw: 'front' });

  it('a colour with no on-model shot keeps the exact order its rows came in (today\'s shops, untouched)', () => {
    const list = [shot('a', 'trueColour'), shot('b', 'front'), shot('c', 'fabric')];
    expect(withOnModelOrder(list)).toEqual(list);
    expect(withOnModelOrder(list)).not.toBe(list); // still a new array, never the same reference
  });

  it('once an on-model shot is in the mix, the whole colour moves to C7.15\'s own order', () => {
    const list = [shot('fab', 'fabric'), shot('det', 'detail'), shot('bak', 'back'), shot('m1', 'model'), shot('fr', 'front')];
    expect(withOnModelOrder(list).map((s) => s.id)).toEqual(['fr', 'm1', 'bak', 'fab', 'det']);
  });

  it('two shots of the same kind never swap (a stable sort)', () => {
    const list = [shot('fab2', 'fabric'), shot('m1', 'model'), shot('fab1', 'fabric')];
    expect(withOnModelOrder(list).map((s) => s.id)).toEqual(['m1', 'fab2', 'fab1']);
  });

  it('shots in the right shape to use as colours (via shotsFor) show the canonical order only where a model shot exists', () => {
    const img = (id: string) => ({ id }) as unknown as ImageSource;
    const media: MediaRow[] = [
      { id: 'bak', colour: 'navy', role: 'BACK', photo: img('bak') },
      { id: 'm1', colour: 'navy', role: 'ON_MODEL', photo: img('m1') },
      { id: 'fr', colour: 'navy', role: 'FRONT', photo: img('fr') },
      { id: 'w-fab', colour: 'white', role: 'FABRIC', photo: img('w-fab') },
      { id: 'w-fr', colour: 'white', role: 'FRONT', photo: img('w-fr') },
    ];
    const s = shotsFor(['navy', 'white'], media, ['front'], '*');
    expect(s.navy!.map((x) => x.id)).toEqual(['fr', 'm1', 'bak']);
    expect(s.white!.map((x) => x.id)).toEqual(['w-fab', 'w-fr']); // untouched: no model shot for white, so this is just the rows' own order
  });

  it('labels every on-model shot by its position, front / three-quarter / back / walking / seated, and leaves every other shot unlabelled', () => {
    const list = [shot('fr', 'front'), shot('m1', 'model'), shot('m2', 'model'), shot('det', 'detail'), shot('m3', 'model')];
    expect(onModelAngles(list)).toEqual([null, 'front', 'threeQuarter', null, 'back']);
  });

  it('a sixth or later on-model shot stays unlabelled rather than guess', () => {
    const list = Array.from({ length: 6 }, (_, i) => shot(`m${i}`, 'model'));
    expect(onModelAngles(list)).toEqual(['front', 'threeQuarter', 'back', 'walking', 'seated', null]);
  });

  it('a colour with no on-model shot at all gets no labels', () => {
    expect(onModelAngles([shot('fr', 'front'), shot('bak', 'back')])).toEqual([null, null]);
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
