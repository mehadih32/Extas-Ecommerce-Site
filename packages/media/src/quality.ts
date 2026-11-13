// S28 · PR 680 — plain photo quality checks (no AI call): the picture's own pixels are read with sharp and compared with
// the numbers of the `media.quality` setting. Five notes: small (shorter side too short), blurry (the strongest edge is
// weak), dark (low average brightness), ratio (not the shop's 4:5), cut (the outer edge of the picture is busy on two or
// more sides, so the garment runs off the frame). `ratio` and `dark` can be fixed in one click (reframe on the shop's
// background; lift the light). The rest need a new photo.
import sharp from 'sharp';
import type { MediaQualitySettings } from '@extas/settings';
import { frameOf, inspectImage } from './process';
import type { Ratio } from './config';

export type QualityIssue = 'small' | 'blurry' | 'dark' | 'ratio' | 'cut';
export const FIXABLE: readonly QualityIssue[] = ['ratio', 'dark'];

export interface QualityReport {
  width: number;
  height: number;
  issues: QualityIssue[];
  fixable: QualityIssue[];
  metrics: {
    sharpness: number;
    brightness: number;
    ratioOff: number;
    busySides: number;
  };
}

const LAPLACE = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  scale: 1,
  offset: 128,
};

/** The 99.9th percentile of the picture's edge response (0-127): high for a crisp photo, low for a blurred one. */
async function sharpnessOf(body: Uint8Array): Promise<number> {
  const { data } = await sharp(body)
    .rotate()
    .greyscale()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .convolve(LAPLACE)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hist = new Array<number>(128).fill(0);
  for (let i = 0; i < data.length; i++) hist[Math.min(127, Math.abs(data[i]! - 128))]!++;
  const target = data.length * 0.999;
  let acc = 0;
  for (let v = 0; v < 128; v++) {
    acc += hist[v]!;
    if (acc >= target) return v;
  }
  return 127;
}

/** How many of the four outer strips (1.5 %) are busy (standard deviation above `busy`). */
async function busySides(body: Uint8Array, busy: number): Promise<number> {
  const base = sharp(body).rotate().greyscale().resize(400, 400, { fit: 'inside', withoutEnlargement: true });
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const t = Math.max(2, Math.round(Math.min(w, h) * 0.015));
  const std = (xs: number[], xe: number, ys: number[], ye: number): number => {
    let n = 0,
      s = 0,
      s2 = 0;
    for (let y = ys[0]!; y < ye; y++)
      for (let x = xs[0]!; x < xe; x++) {
        const v = data[y * w + x]!;
        n++;
        s += v;
        s2 += v * v;
      }
    const m = s / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m));
  };
  const sides = [std([0], w, [0], t), std([0], w, [h - t], h), std([0], t, [0], h), std([w - t], w, [0], h)];
  return sides.filter((s) => s > busy).length;
}

export async function analysePhoto(body: Uint8Array, rules: MediaQualitySettings, ratio: Ratio): Promise<QualityReport> {
  const info = await inspectImage(body);
  if (!info) throw new Error('not a picture');
  const stats = await sharp(body).rotate().greyscale().stats();
  const brightness = stats.channels[0]!.mean;
  const sharpness = await sharpnessOf(body);
  const want = ratio.width / ratio.height;
  const ratioOff = Math.abs(info.width / info.height - want) / want;
  const busy = await busySides(body, rules.edgeBusy);
  const issues: QualityIssue[] = [];
  if (Math.min(info.width, info.height) < rules.minSide) issues.push('small');
  if (sharpness < rules.sharpnessMin) issues.push('blurry');
  if (brightness < rules.darkBelow) issues.push('dark');
  if (ratioOff * 100 > rules.ratioTolerancePct) issues.push('ratio');
  if (busy >= 2) issues.push('cut');
  return {
    width: info.width,
    height: info.height,
    issues,
    fixable: issues.filter((i) => FIXABLE.includes(i)),
    metrics: {
      sharpness,
      brightness: Math.round(brightness),
      ratioOff: Math.round(ratioOff * 1000) / 10,
      busySides: busy,
    },
  };
}

/** One-click fix: reframes to the shop's shape on its background, then lifts the light. Returns a JPEG, or null when nothing is fixable. */
export async function fixPhoto(
  body: Uint8Array,
  issues: readonly QualityIssue[],
  cfg: {
    ratio: Ratio;
    background: string | { r: number; g: number; b: number };
  },
  targetBrightness = 110,
): Promise<Uint8Array | null> {
  const todo = issues.filter((i) => FIXABLE.includes(i));
  if (!todo.length) return null;
  const info = await inspectImage(body);
  if (!info) throw new Error('not a picture');
  let img = sharp(body).rotate().toColourspace('srgb').flatten({ background: cfg.background });
  if (todo.includes('ratio')) {
    const f = frameOf(info.width, info.height, {
      ratio: cfg.ratio,
      fit: 'contain',
    });
    img = img.resize(f.width, f.height, {
      fit: 'contain',
      position: 'centre',
      background: cfg.background,
    });
  }
  if (todo.includes('dark')) {
    const mean = (await sharp(body).rotate().greyscale().stats()).channels[0]!.mean || 1;
    img = img.linear(Math.min(2.2, Math.max(1, targetBrightness / mean)), 0);
  }
  return new Uint8Array(await img.jpeg({ quality: 95 }).toBuffer());
}
