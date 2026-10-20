// PR 23 / Blueprint C7.11 — the watermark is put on a COPY at the moment of download. The stored original and every
// rendition the shop shows stay clean. The text, place, strength and size are settings (media.watermark.*); the text
// is the owner's brand (owner data) and falls back to the store name.
//
// The mark is drawn as SVG over the photo: the text on a soft dark plate, so it stays readable on light and dark
// garments alike (and still marks the copy where the server lacks the font for a script).
import sharp from 'sharp';
import type { WatermarkPosition } from './config';

export interface StampOptions {
  text: string;
  position: WatermarkPosition;
  /** 0.05 … 1 */
  opacity: number;
  /** Text height in hundredths of the photo width. */
  scale: number;
  /** JPEG quality of the copy. */
  quality: number;
}

const FONTS = "'DejaVu Sans', 'Noto Sans', 'Noto Sans Bengali', 'Lohit Bengali', sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** The SVG layer for a photo of `width` × `height`. Pure, so the geometry can be tested without pixels. */
export function watermarkSvg(width: number, height: number, o: Pick<StampOptions, 'text' | 'position' | 'opacity' | 'scale'>): string {
  const size = Math.max(10, Math.round((width * o.scale) / 100));
  const pad = Math.round(size * 0.45);
  const margin = Math.round(Math.min(width, height) * 0.03);
  // A generous width estimate (no font metrics here): the plate is a little wider than the text, never narrower.
  const textW = Math.round(size * 0.62 * [...o.text].length);
  const plateW = Math.min(width - 2 * margin, textW + 2 * pad);
  const plateH = size + 2 * pad;
  const text = escapeXml(o.text);
  const op = o.opacity.toFixed(3);
  const plateOp = (o.opacity * 0.55).toFixed(3);

  const mark = (cx: number, cy: number) =>
    `<rect x="${Math.round(cx - plateW / 2)}" y="${Math.round(cy - plateH / 2)}" width="${plateW}" height="${plateH}" rx="${pad}" fill="#000" fill-opacity="${plateOp}"/>` +
    `<text x="${Math.round(cx)}" y="${Math.round(cy)}" font-family="${FONTS}" font-size="${size}" font-weight="700" fill="#fff" fill-opacity="${op}" text-anchor="middle" dominant-baseline="central">${text}</text>`;

  let body: string;
  if (o.position === 'tiled') {
    const stepX = plateW + size * 2;
    const stepY = plateH + size * 3;
    const marks: string[] = [];
    for (let y = stepY / 2, row = 0; y < height + stepY; y += stepY, row++) {
      for (let x = (row % 2 ? stepX / 2 : 0) + stepX / 2; x < width + stepX; x += stepX) marks.push(mark(x, y));
    }
    body = `<g transform="rotate(-30 ${Math.round(width / 2)} ${Math.round(height / 2)})">${marks.join('')}</g>`;
  } else {
    const left = margin + plateW / 2;
    const right = width - margin - plateW / 2;
    const top = margin + plateH / 2;
    const bottom = height - margin - plateH / 2;
    const at: Record<Exclude<WatermarkPosition, 'tiled'>, [number, number]> = {
      'bottom-right': [right, bottom],
      'bottom-left': [left, bottom],
      'top-right': [right, top],
      'top-left': [left, top],
      centre: [width / 2, height / 2],
    };
    const [cx, cy] = at[o.position];
    body = mark(cx, cy);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

/** A watermarked JPEG copy of `body`. `body` itself is never changed. */
export async function stampWatermark(body: Uint8Array, o: StampOptions): Promise<Uint8Array> {
  const meta = await sharp(body).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('not a picture');
  const svg = Buffer.from(watermarkSvg(width, height, o));
  const out = await sharp(body).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: o.quality, mozjpeg: true }).toBuffer();
  return new Uint8Array(out);
}
