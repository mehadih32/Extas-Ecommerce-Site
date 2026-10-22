// PR 575 — the set photo without a database: which layout a set takes, that every piece sits inside the canvas without
// touching another, and that the composed picture really is the pieces on the house background. Made-up test images.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { layoutFor, photoCells, type PhotoCell, type PhotoLayout } from './photo-layout';
import { composeImage } from './set-photo';

const W = 1200;
const H = 900;
const overlaps = (a: PhotoCell, b: PhotoCell) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const solid = (hex: string, w = 400, h = 440) => sharp({ create: { width: w, height: h, channels: 3, background: hex } }).png().toBuffer().then((b) => new Uint8Array(b));

describe('PR 575 · the set photo layout', () => {
  it('side by side for a pair, top + bottom for an outfit of two, three-up for three, a grid for more', () => {
    expect(layoutFor('COLOUR_PAIR', 2)).toBe('side-by-side');
    expect(layoutFor('FIXED_COLOUR_PACK', 2)).toBe('side-by-side');
    expect(layoutFor('TOP_BOTTOM', 2)).toBe('top-bottom');
    expect(layoutFor('TOP_BOTTOM', 3)).toBe('three-up');
    expect(layoutFor('MIXED_SET', 3)).toBe('three-up');
    expect(layoutFor('FIXED_COLOUR_PACK', 4)).toBe('grid');
  });

  it('every piece inside the canvas, whole pixels; side by side, three-up and grid never overlap', () => {
    const cases: [PhotoLayout, number][] = [
      ['side-by-side', 2],
      ['three-up', 3],
      ['grid', 4],
      ['grid', 5],
      ['top-bottom', 2],
    ];
    for (const [layout, n] of cases) {
      const cells = photoCells(layout, n, W, H);
      expect(cells.map((c) => c.piece)).toEqual([...Array(n).keys()]);
      for (const c of cells) {
        for (const v of [c.left, c.top, c.width, c.height]) expect(Number.isInteger(v), `${layout} ${JSON.stringify(c)}`).toBe(true);
        expect(c.left).toBeGreaterThanOrEqual(0);
        expect(c.top).toBeGreaterThanOrEqual(0);
        expect(c.left + c.width).toBeLessThanOrEqual(W);
        expect(c.top + c.height).toBeLessThanOrEqual(H);
      }
      if (layout !== 'top-bottom') for (const a of cells) for (const b of cells) if (a !== b) expect(overlaps(a, b), `${layout} ${a.piece}/${b.piece}`).toBe(false);
    }
  });

  it('top + bottom: the top on the left, the bottom on the right set lower; three-up: the first piece is the big one', () => {
    const [top, bottom] = photoCells('top-bottom', 2, W, H);
    expect(top!.left).toBeLessThan(bottom!.left);
    expect(bottom!.top).toBeGreaterThan(top!.top);
    const [big, a, b] = photoCells('three-up', 3, W, H);
    expect(big!.width * big!.height).toBeGreaterThan(a!.width * a!.height + b!.width * b!.height);
  });
});

describe('PR 575 · the composed picture', () => {
  it('is the canvas size and format, the house background around the pieces, each piece where its cell is', async () => {
    const body = await composeImage([await solid('#c80000'), await solid('#0000c8')], { layout: 'side-by-side', width: W, height: H, background: '#ECE9E3', format: 'jpeg', quality: 90 });
    const meta = await sharp(body).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: W, height: H });
    const { data, info } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 14);
    expect(near(at(3, 3), [0xec, 0xe9, 0xe3])).toBe(true);
    const [l, r] = photoCells('side-by-side', 2, W, H);
    expect(near(at(l!.left + l!.width / 2, l!.top + l!.height / 2), [0xc8, 0, 0])).toBe(true);
    expect(near(at(r!.left + r!.width / 2, r!.top + r!.height / 2), [0, 0, 0xc8])).toBe(true);
    const webp = await composeImage([await solid('#222222'), await solid('#dddddd'), await solid('#888888')], { layout: 'three-up', width: 800, height: 600, background: '#ffffff', format: 'webp', quality: 80 });
    expect(await sharp(webp).metadata()).toMatchObject({ format: 'webp', width: 800, height: 600 });
  });
});
