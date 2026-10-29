// PR 179 — drawing one page: lines, boxes and the barcode as SVG, every text block shaped by the server's text engine
// (Pango through sharp: Bengali joined letters come out right, long words wrap) and placed on top, then the page as
// greyscale pixels for the PDF writer. Text is measured before it is placed, so a layout can flow blocks down the page,
// shrink them to fit, or carry on onto the next page — nothing cut, nothing overlapping (Blueprint B1.4, B1.6).
//
// The text engine is passed in (`TextEngine`): the server uses `sharpText()`, the tests a stand-in that needs no fonts.
import sharp from 'sharp';
import { code128Svg } from './code128';
import { mmToPt, mmToPx, type PdfPage } from './pdf';

export interface TextStyle {
  /** Size in points (1/72 inch), at the document's scale 1. */
  sizePt: number;
  bold?: boolean;
  align?: 'left' | 'centre' | 'right';
  /** White text (drawn on a black band). */
  inverse?: boolean;
}

export interface TextBlock {
  png: Buffer;
  width: number;
  height: number;
}

/** Shapes and draws one block of text, wrapped to `widthPx`, at `dpi`. */
export interface TextEngine {
  render(text: string, style: TextStyle, widthPx: number, dpi: number): Promise<TextBlock>;
}

/** The fonts tried, in order: the shop's own Bengali face where the server has it, then the server's (Docker image). */
export const FONT_FAMILIES = 'Hind Siliguri, Noto Sans Bengali, Lohit Bengali, DejaVu Sans';

const escapeMarkup = (s: string): string => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** The server's text engine: Pango through sharp, with the families above. */
export function sharpText(families: string = FONT_FAMILIES): TextEngine {
  return {
    async render(text, style, widthPx, dpi) {
      const colour = style.inverse ? '#FFFFFF' : '#000000';
      const markup = `<span foreground="${colour}">${escapeMarkup(text)}</span>`;
      const { data, info } = await sharp({
        text: {
          text: markup,
          font: `${families} ${style.bold ? 'Bold' : ''} ${style.sizePt}`.replace(/\s+/g, ' '),
          width: Math.max(1, Math.floor(widthPx)),
          dpi,
          rgba: true,
          align: style.align === 'centre' ? 'centre' : style.align === 'right' ? 'right' : 'left',
          wrap: 'word-char',
        },
      })
        .png()
        .toBuffer({ resolveWithObject: true });
      return { png: data, width: info.width, height: info.height };
    },
  };
}

/** A blank text: nothing drawn, no height. */
const EMPTY = { png: Buffer.alloc(0), width: 0, height: 0 };

/** One page being drawn, in pixels at `dpi`. */
export class Sheet {
  readonly width: number;
  readonly height: number;
  private readonly shapes: string[] = [];
  private readonly texts: { input: Buffer; left: number; top: number }[] = [];

  constructor(
    readonly widthMm: number,
    readonly heightMm: number,
    readonly dpi: number,
    private readonly engine: TextEngine,
  ) {
    this.width = mmToPx(widthMm, dpi);
    this.height = mmToPx(heightMm, dpi);
  }

  /** Millimetres to this sheet's pixels. */
  px(mm: number): number {
    return mmToPx(mm, this.dpi);
  }

  /** Shapes a text block without placing it (to measure it first). Empty text is nothing. */
  async shape(text: string, style: TextStyle, widthPx: number): Promise<TextBlock> {
    if (!text.trim()) return EMPTY;
    return this.engine.render(text, style, widthPx, this.dpi);
  }

  /** Places a shaped block; `align` within `widthPx` from `x`. Returns its height. */
  place(block: TextBlock, x: number, y: number, widthPx: number, align: TextStyle['align'] = 'left'): number {
    if (!block.height) return 0;
    const left = align === 'centre' ? x + Math.max(0, Math.round((widthPx - block.width) / 2)) : align === 'right' ? x + Math.max(0, widthPx - block.width) : x;
    this.texts.push({ input: block.png, left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(y)) });
    return block.height;
  }

  /** Shapes and places a text block. Returns its height. */
  async text(text: string, x: number, y: number, widthPx: number, style: TextStyle): Promise<number> {
    return this.place(await this.shape(text, style, widthPx), x, y, widthPx, style.align);
  }

  rect(x: number, y: number, w: number, h: number, o: { stroke?: number; fill?: boolean } = {}): void {
    const sw = o.stroke ?? 0;
    this.shapes.push(`<rect x="${x + sw / 2}" y="${y + sw / 2}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" fill="${o.fill ? '#000' : 'none'}"${sw ? ` stroke="#000" stroke-width="${sw}"` : ''}/>`);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke = 1, dashed = false): void {
    this.shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${stroke}"${dashed ? ` stroke-dasharray="${stroke * 4} ${stroke * 3}"` : ''}/>`);
  }

  /**
   * PR 407 — a picture (the shop's logo) fitted inside `maxW` × `maxH`, kept in proportion, ready to place like a
   * text block (measured first). A picture that cannot be read is nothing (the caller prints the shop's name instead).
   */
  async shapePicture(image: Buffer, maxW: number, maxH: number): Promise<TextBlock> {
    try {
      const { data, info } = await sharp(image)
        .resize({ width: Math.max(1, Math.floor(maxW)), height: Math.max(1, Math.floor(maxH)), fit: 'inside' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer({ resolveWithObject: true });
      return { png: data, width: info.width, height: info.height };
    } catch {
      return EMPTY;
    }
  }

  /** The barcode of `value` in the box; false when it does not fit (print the value as text instead). */
  barcode(value: string, x: number, y: number, w: number, h: number): boolean {
    const svg = code128Svg(value, x, y, w, h);
    if (!svg) return false;
    this.shapes.push(svg);
    return true;
  }

  /** The page as greyscale pixels, for the PDF writer. */
  async render(): Promise<PdfPage> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><rect width="100%" height="100%" fill="#fff"/>${this.shapes.join('')}</svg>`;
    const fits = this.texts.filter((t) => t.left < this.width && t.top < this.height);
    const gray = await sharp(Buffer.from(svg))
      .composite(await Promise.all(fits.map(async (t) => ({ input: await clip(t.input, this.width - t.left, this.height - t.top), left: t.left, top: t.top }))))
      .flatten({ background: '#ffffff' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { widthPt: mmToPt(this.widthMm), heightPt: mmToPt(this.heightMm), image: { width: gray.info.width, height: gray.info.height, gray: gray.info.channels === 1 ? gray.data : toOneChannel(gray.data, gray.info.channels) } };
  }
}

/** A text picture cut to what is left of the page (sharp refuses an overlay larger than its base). */
async function clip(png: Buffer, maxW: number, maxH: number): Promise<Buffer> {
  const m = await sharp(png).metadata();
  if ((m.width ?? 0) <= maxW && (m.height ?? 0) <= maxH) return png;
  return sharp(png)
    .extract({ left: 0, top: 0, width: Math.max(1, Math.min(m.width ?? 1, maxW)), height: Math.max(1, Math.min(m.height ?? 1, maxH)) })
    .png()
    .toBuffer();
}

function toOneChannel(data: Buffer, channels: number): Buffer {
  const out = Buffer.alloc(data.length / channels);
  for (let i = 0; i < out.length; i++) out[i] = data[i * channels]!;
  return out;
}

/** Several small pages placed on one sheet (e.g. 4 stickers on an A4 page), in rows from the top left. */
export async function tile(pages: readonly PdfPage[], sheet: { widthMm: number; heightMm: number; across: number; down: number; dpi: number }): Promise<PdfPage[]> {
  const W = mmToPx(sheet.widthMm, sheet.dpi);
  const H = mmToPx(sheet.heightMm, sheet.dpi);
  const cellW = Math.floor(W / sheet.across);
  const cellH = Math.floor(H / sheet.down);
  const per = sheet.across * sheet.down;
  const out: PdfPage[] = [];
  for (let i = 0; i < pages.length; i += per) {
    const group = pages.slice(i, i + per);
    const overlays = await Promise.all(
      group.map(async (p, k) => {
        const png = await sharp(p.image.gray, { raw: { width: p.image.width, height: p.image.height, channels: 1 } })
          .resize({ width: cellW, height: cellH, fit: 'inside' })
          .png()
          .toBuffer();
        return { input: png, left: (k % sheet.across) * cellW, top: Math.floor(k / sheet.across) * cellH };
      }),
    );
    const cut = Array.from({ length: sheet.across - 1 }, (_, c) => `<line x1="${(c + 1) * cellW}" y1="0" x2="${(c + 1) * cellW}" y2="${H}" stroke="#999" stroke-width="1" stroke-dasharray="6 6"/>`)
      .concat(Array.from({ length: sheet.down - 1 }, (_, r) => `<line x1="0" y1="${(r + 1) * cellH}" x2="${W}" y2="${(r + 1) * cellH}" stroke="#999" stroke-width="1" stroke-dasharray="6 6"/>`))
      .join('');
    const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${cut}</svg>`);
    const g = await sharp(base).composite(overlays).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    out.push({ widthPt: mmToPt(sheet.widthMm), heightPt: mmToPt(sheet.heightMm), image: { width: g.info.width, height: g.info.height, gray: g.info.channels === 1 ? g.data : toOneChannel(g.data, g.info.channels) } });
  }
  return out;
}
