// PR 22 — standardisation with sharp: every original becomes each preset width at the store's ratio (4:5), in each
// format (AVIF, WebP, JPEG), at the store's quality, in sRGB with all metadata stripped (P05). A photo of another
// shape is either kept whole on a background-coloured frame (`contain`, the default: the garment is never cut) or cut
// to the shape (`cover`). Nothing is ever enlarged: when the original is narrower than a preset, that rendition is
// made at the largest width the original allows, and its real width and height are recorded.
// The dominant colour is measured on the photo itself (not on the frame) for the loading placeholder (PR 24).
import sharp, { type Sharp } from 'sharp';
import { heightFor, type ImageFormat, type RenderConfig } from './config';

export interface Inspected {
  /** sharp's format name: jpeg, png, webp, tiff, heif, gif, svg … */
  format: string;
  /** The real type, read from the bytes (never from the file name). */
  mime: string;
  /** Size as displayed, after the camera's rotation flag. */
  width: number;
  height: number;
  hasAlpha: boolean;
}

/** What the bytes are, or null when they are not a picture sharp can read. */
export async function inspectImage(body: Uint8Array): Promise<Inspected | null> {
  try {
    const m = await sharp(body).metadata();
    if (!m.format || !m.width || !m.height) return null;
    const rotated = (m.orientation ?? 1) >= 5;
    const mime = m.format === 'heif' ? (m.compression === 'av1' ? 'image/avif' : 'image/heif') : m.format === 'svg' ? 'image/svg+xml' : `image/${m.format}`;
    return {
      format: m.format,
      mime,
      width: rotated ? m.height : m.width,
      height: rotated ? m.width : m.height,
      hasAlpha: Boolean(m.hasAlpha),
    };
  } catch {
    return null;
  }
}

export interface RenderedFile {
  preset: string;
  format: ImageFormat;
  width: number;
  height: number;
  quality: number;
  body: Uint8Array;
}

export interface Standardised {
  files: RenderedFile[];
  /** `#rrggbb`, the photo's main colour. */
  dominantColor: string;
}

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Width and height of the largest 4:5 frame the original fills (contain: around it; cover: inside it). */
export function frameOf(w: number, h: number, cfg: Pick<RenderConfig, 'ratio' | 'fit'>): { width: number; height: number } {
  const r = cfg.ratio.width / cfg.ratio.height;
  const wider = w / h > r;
  if (cfg.fit === 'contain') return wider ? { width: w, height: Math.round(w / r) } : { width: Math.round(h * r), height: h };
  return wider ? { width: Math.round(h * r), height: h } : { width: w, height: Math.round(w / r) };
}

/** The width each preset will really get from an original of this size (never larger than the frame). */
export function plannedWidths(w: number, h: number, cfg: Pick<RenderConfig, 'ratio' | 'fit' | 'presets'>): Map<string, number> {
  const frame = frameOf(w, h, cfg);
  return new Map(cfg.presets.map((p) => [p.name, Math.min(p.width, frame.width)]));
}

function encode(img: Sharp, format: ImageFormat, cfg: RenderConfig): Sharp {
  switch (format) {
    case 'avif':
      return img.avif({ quality: cfg.quality, effort: cfg.avifEffort });
    case 'webp':
      return img.webp({ quality: cfg.quality });
    case 'jpeg':
      return img.jpeg({ quality: cfg.quality, mozjpeg: true });
  }
}

export async function standardise(body: Uint8Array, cfg: RenderConfig): Promise<Standardised> {
  const info = await inspectImage(body);
  if (!info) throw new Error('not a picture');
  const frame = frameOf(info.width, info.height, cfg);
  const maxWidth = Math.max(...cfg.presets.map((p) => p.width));
  const baseWidth = Math.min(frame.width, maxWidth);
  const baseHeight = heightFor(baseWidth, cfg.ratio);
  const background = cfg.background;

  // One base image at the largest needed size, raw pixels in memory; every rendition is cut from it.
  const base = await sharp(body)
    .rotate()
    .toColourspace('srgb')
    .flatten({ background })
    .resize(baseWidth, baseHeight, { fit: cfg.fit, position: 'centre', background, kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { width: base.info.width, height: base.info.height, channels: base.info.channels };

  const files: RenderedFile[] = [];
  for (const p of cfg.presets) {
    const width = Math.min(p.width, baseWidth);
    const height = heightFor(width, cfg.ratio);
    const outs = await Promise.all(
      cfg.formats.map(async (format) => {
        let img = sharp(base.data, { raw });
        if (width !== raw.width || height !== raw.height) img = img.resize(width, height, { fit: 'fill', kernel: 'lanczos3' });
        const out = await encode(img, format, cfg).toBuffer();
        return { preset: p.name, format, width, height, quality: cfg.quality, body: new Uint8Array(out) } satisfies RenderedFile;
      }),
    );
    files.push(...outs);
  }

  // The photo's own main colour (a small copy is enough), not the frame's background.
  const small = await sharp(body).rotate().toColourspace('srgb').flatten({ background }).resize(200, 200, { fit: 'inside' }).toBuffer();
  const { dominant } = await sharp(small).stats();
  return { files, dominantColor: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}` };
}
