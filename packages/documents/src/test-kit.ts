// Test helpers for the documents: a text engine that needs no fonts (a grey box the size the text would take), a
// minimal PDF reader for the checks, and sample sticker words and data.
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { CODE128_PATTERNS } from './code128';
import type { TextEngine } from './layout';
import type { StickerInput, StickerWords } from './sticker';

/** Every character as a box of half its size wide; lines wrap at the width; one line per 1.3 × size. */
export function boxText(): TextEngine & { calls: string[]; sizes: Map<string, number> } {
  const calls: string[] = [];
  /** The type size each text was last drawn at. */
  const sizes = new Map<string, number>();
  return {
    calls,
    sizes,
    async render(text, style, widthPx, dpi) {
      calls.push(text);
      sizes.set(text, style.sizePt);
      const px = (style.sizePt * dpi) / 72;
      const perLine = Math.max(1, Math.floor(widthPx / (px * 0.5)));
      const lines = Math.max(1, Math.ceil(text.length / perLine));
      const width = Math.max(1, Math.min(widthPx, Math.ceil(text.length * px * 0.5)));
      const height = Math.ceil(lines * px * 1.3);
      const png = await sharp({ create: { width, height, channels: 4, background: style.inverse ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
      return { png, width, height };
    },
  };
}

export interface ReadPdf {
  version: string;
  pages: { mediaBox: number[]; image: { width: number; height: number; gray: Buffer } }[];
  title: string | null;
  xrefOk: boolean;
}

/** Reads back what writePdf wrote (enough for the tests: the page sizes and the pictures). */
export function readPdf(pdf: Buffer): ReadPdf {
  const s = pdf.toString('latin1');
  const version = /^%PDF-(\d\.\d)/.exec(s)?.[1] ?? '';
  const objects = new Map<number, number>();
  for (const m of s.matchAll(/(\d+) 0 obj\n/g)) objects.set(Number(m[1]), m.index!);
  const xref = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  const entries = [...s.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  const xrefOk = s.slice(xref, xref + 4) === 'xref' && entries.every((off, i) => objects.get(i + 1) === off);
  const kids = [...(/\/Kids \[([^\]]*)\]/.exec(s)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const pages = kids.map((n) => {
    const at = objects.get(n)!;
    const body = s.slice(at, s.indexOf('endobj', at));
    const mediaBox = (/\/MediaBox \[([^\]]*)\]/.exec(body)?.[1] ?? '').split(' ').map(Number);
    const imgN = Number(/\/XObject << \/P\d+ (\d+) 0 R/.exec(body)?.[1]);
    const iat = objects.get(imgN)!;
    const head = s.slice(iat, s.indexOf('stream\n', iat));
    const width = Number(/\/Width (\d+)/.exec(head)?.[1]);
    const height = Number(/\/Height (\d+)/.exec(head)?.[1]);
    const length = Number(/\/Length (\d+)/.exec(head)?.[1]);
    const start = s.indexOf('stream\n', iat) + 'stream\n'.length;
    const gray = inflateSync(pdf.subarray(start, start + length));
    return { mediaBox, image: { width, height, gray } };
  });
  const title = /\/Title \(([^)]*)\)/.exec(s)?.[1] ?? null;
  return { version, pages, title, xrefOk };
}

export const SAMPLE_WORDS: StickerWords = {
  to: 'To',
  order: 'Order',
  collect: 'Collect',
  paid: 'PAID: collect nothing',
  items: 'Items',
  pieces: '{count} pcs',
  consignment: 'Consignment',
  tracking: 'Tracking',
  giftFrom: 'Gift from',
  deliverAfter: 'Deliver on or after',
  note: 'Note',
  reprint: 'REPRINT {n}',
  page: '{n}/{of}',
  continued: 'Continued on the next sticker',
  practice: 'PRACTICE: not a real parcel',
};

export function sampleSticker(over: Partial<StickerInput> = {}): StickerInput {
  return {
    shopName: 'Sample Shop',
    shopPhone: '01700000000', // hardcode-ok: a made-up test number
    courierName: 'Practice courier',
    consignmentId: '12345678',
    trackingCode: 'TRK12345',
    orderNumber: '1042',
    receiver: { name: 'Rahim Uddin', phone: '01711111111', address: 'House 4, Road 2, Dhanmondi, Dhaka' }, // hardcode-ok: a made-up test number
    collect: '৳1,580', // hardcode-ok: a made-up test amount
    exactLine: null,
    items: [{ name: 'Linen shirt', colour: 'White', size: 'M', quantity: 1 }],
    gift: null,
    note: null,
    reprint: null,
    practice: false,
    ...over,
  };
}

/** Reads bar/space widths back into the text (what a scanner does), so the tests check the code, not our tables. */
export function decode128(widths: readonly number[]): string {
  const symbols: number[] = [];
  for (let i = 0; i + 6 <= widths.length; i += 6) {
    const pat = widths.slice(i, i + 6).join('');
    const stop = widths.slice(i, i + 7).join('');
    if (stop === CODE128_PATTERNS[106]) break;
    const v = CODE128_PATTERNS.indexOf(pat);
    if (v < 0) throw new Error(`unknown symbol ${pat}`);
    symbols.push(v);
  }
  const [start, ...rest] = symbols;
  const check = rest.pop()!;
  const sum = [start!, ...rest].reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0);
  if (sum % 103 !== check) throw new Error('bad checksum');
  if (start === 105) return rest.map((v) => String(v).padStart(2, '0')).join('');
  if (start === 104) return rest.map((v) => String.fromCharCode(v + 32)).join('');
  throw new Error('unknown start');
}
