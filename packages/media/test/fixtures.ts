// Small pictures made on the fly with sharp (no binary files in Git): a two-colour "garment" so resizing, cropping,
// padding and the dominant colour can be checked by reading pixels back.
import sharp from 'sharp';
import { memoryBackend, registry, SettingsResolver } from '@extas/settings';
import type { RenderConfig } from '../src';

export const NAVY = { r: 20, g: 32, b: 80 };
export const WHITE = { r: 255, g: 255, b: 255 };

/** A `width` × `height` photo: navy everywhere with a white square in the middle (a third of the short side). */
export async function photo(width: number, height: number, format: 'jpeg' | 'png' | 'webp' = 'jpeg', opts: { orientation?: number; alpha?: boolean } = {}): Promise<Uint8Array> {
  const side = Math.round(Math.min(width, height) / 3);
  const square = await sharp({ create: { width: side, height: side, channels: 3, background: WHITE } }).png().toBuffer();
  let img = sharp({ create: { width, height, channels: opts.alpha ? 4 : 3, background: opts.alpha ? { ...NAVY, alpha: 0.5 } : NAVY } })
    .composite([{ input: square, left: Math.round((width - side) / 2), top: Math.round((height - side) / 2) }]);
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  const out = format === 'png' ? await img.png().toBuffer() : format === 'webp' ? await img.webp().toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
  return new Uint8Array(out);
}

/** The colour of one pixel. */
export async function pixel(body: Uint8Array, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(body).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
}

export const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tol = 24) =>
  Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;

/** The registry defaults (the owner's spec) as a render config, with a fast AVIF effort for tests. */
export function defaultRenderConfig(over: Partial<RenderConfig> = {}): RenderConfig {
  return {
    presets: registry['media.image.presets'].default,
    ratio: registry['media.image.aspectRatio'].default,
    formats: registry['media.image.formats'].default,
    quality: registry['media.image.quality'].default,
    avifEffort: 0,
    fit: registry['media.image.fit'].default,
    background: registry['media.image.background'].default,
    ...over,
  };
}

/** A settings resolver on memory (no database), with every default from the registry. */
export function memorySettings() {
  return new SettingsResolver(memoryBackend(), registry);
}
