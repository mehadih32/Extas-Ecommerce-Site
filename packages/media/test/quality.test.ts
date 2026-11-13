// S28 · PR 680 — the plain photo checks: each note is raised by a picture made for it, and a clean one raises none.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { analysePhoto, fixPhoto } from '../src';
import { photo } from './fixtures';

const rules = { ...registry['media.quality'].default, on: true };
const ratio = { width: 4, height: 5 };
const light = async (w: number, h: number) => {
  // a pale garment on a white background, framed with room around it
  const sq = await sharp({
    create: {
      width: Math.round(w / 2),
      height: Math.round(h / 2),
      channels: 3,
      background: { r: 200, g: 170, b: 120 },
    },
  })
    .png()
    .toBuffer();
  const body = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 245, g: 245, b: 245 },
    },
  })
    .composite([{ input: sq, left: Math.round(w / 4), top: Math.round(h / 4) }])
    .jpeg({ quality: 92 })
    .toBuffer();
  return new Uint8Array(body);
};

describe('analysePhoto', () => {
  it('a sharp, bright 4:5 photo with room around it raises no note', async () => {
    const r = await analysePhoto(await light(1000, 1250), rules, ratio);
    expect(r.issues).toEqual([]);
  });
  it('says too small under the shorter-side limit', async () => {
    expect((await analysePhoto(await light(400, 500), rules, ratio)).issues).toContain('small');
  });
  it('says wrong shape and offers the fix', async () => {
    const r = await analysePhoto(await light(1200, 1200), rules, ratio);
    expect(r.issues).toContain('ratio');
    expect(r.fixable).toContain('ratio');
  });
  it('says blurry for a blurred edge and not for the same photo sharp', async () => {
    const sharpBody = await light(1000, 1250);
    const blurred = new Uint8Array(await sharp(sharpBody).blur(25).toBuffer());
    expect((await analysePhoto(sharpBody, rules, ratio)).issues).not.toContain('blurry');
    expect((await analysePhoto(blurred, rules, ratio)).issues).toContain('blurry');
  });
  it('says too dark, fixable, and the fix makes it brighter', async () => {
    const dark = new Uint8Array(
      await sharp(await light(1000, 1250))
        .linear(0.25, 0)
        .jpeg()
        .toBuffer(),
    );
    const r = await analysePhoto(dark, rules, ratio);
    expect(r.issues).toContain('dark');
    const fixed = await fixPhoto(dark, r.issues, {
      ratio,
      background: { r: 255, g: 255, b: 255 },
    });
    expect(fixed).not.toBeNull();
    const after = await analysePhoto(fixed!, rules, ratio);
    expect(after.metrics.brightness).toBeGreaterThan(r.metrics.brightness);
  });
  it('says cut off when the picture runs to the edge on several sides', async () => {
    const r = await analysePhoto(await photo(1000, 1250), { ...rules, edgeBusy: 5 }, ratio);
    expect(r.metrics.busySides).toBeGreaterThanOrEqual(0);
    // a busy full-bleed picture: noise on every side
    const noise = await sharp({
      create: {
        width: 1000,
        height: 1250,
        channels: 3,
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .jpeg()
      .toBuffer();
    expect((await analysePhoto(new Uint8Array(noise), { ...rules, edgeBusy: 10 }, ratio)).issues).toContain('cut');
  });
  it('fix reframes to exactly 4:5 and keeps the whole picture', async () => {
    const out = await fixPhoto(await light(1200, 1200), ['ratio'], {
      ratio,
      background: { r: 255, g: 255, b: 255 },
    });
    const m = await sharp(out!).metadata();
    expect(m.width! / m.height!).toBeCloseTo(0.8, 2);
    expect(m.width).toBe(1200);
  });
  it('fix has nothing to do for notes that need a new photo', async () => {
    expect(
      await fixPhoto(await light(400, 500), ['small', 'blurry', 'cut'], {
        ratio,
        background: { r: 255, g: 255, b: 255 },
      }),
    ).toBeNull();
  });
});
