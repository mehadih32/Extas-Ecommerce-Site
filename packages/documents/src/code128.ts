// PR 179 — the Code 128 barcode of a courier's consignment id (Blueprint B1.4: the id always comes from the courier,
// never made by the shop; this only draws it). Code set C for an even run of digits (a Steadfast consignment id is
// all digits: half as wide), else code set B (printable ASCII). The checksum is the standard weighted sum mod 103.
// Output is the bar/space widths in modules, starting with a bar, so any drawing (SVG here) can scale it.

/** The 107 symbols (0–102 data, 103–105 start A/B/C, 106 stop): bar, space, bar, space, bar, space widths. */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Quiet zone each side, in modules (the scanners' minimum is 10). */
export const QUIET_MODULES = 10;

/** True when the text can be drawn (printable ASCII, 1–80 characters). */
export function canEncode(text: string): boolean {
  return text.length > 0 && text.length <= 80 && /^[\x20-\x7E]+$/.test(text);
}

/** The symbol values of `text`, start and checksum included (stop not included). */
export function code128Values(text: string): number[] {
  if (!canEncode(text)) throw new Error('Code 128: printable ASCII, 1–80 characters');
  const digits = /^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4;
  const values: number[] = [];
  if (digits) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const ch of text) values.push(ch.charCodeAt(0) - 32);
  }
  const sum = values.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0);
  values.push(sum % 103);
  return values;
}

/** The widths (in modules) of every bar and space, first a bar, stop included; no quiet zone. */
export function code128Widths(text: string): number[] {
  const out: number[] = [];
  for (const v of [...code128Values(text), STOP]) for (const c of CODE128_PATTERNS[v]!) out.push(Number(c));
  return out;
}

/** How many modules wide the symbol is, quiet zones included. */
export const code128Modules = (text: string): number => code128Widths(text).reduce((s, w) => s + w, 0) + 2 * QUIET_MODULES;

/**
 * The bars as SVG rectangles inside a box (`x`, `y`, `width`, `height` in px): a whole number of pixels per module (so
 * every bar keeps its exact ratio on a thermal printer), centred, quiet zones included. Null when even one pixel per
 * module does not fit (the caller then prints the id as text only).
 */
export function code128Svg(text: string, x: number, y: number, width: number, height: number): string | null {
  const widths = code128Widths(text);
  const modules = code128Modules(text);
  const module = Math.floor(width / modules);
  if (module < 1) return null;
  let at = Math.round(x + (width - modules * module) / 2) + QUIET_MODULES * module;
  const rects: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${at}" y="${Math.round(y)}" width="${w * module}" height="${Math.round(height)}"/>`);
    at += w * module;
  });
  return `<g fill="#000" shape-rendering="crispEdges">${rects.join('')}</g>`;
}
