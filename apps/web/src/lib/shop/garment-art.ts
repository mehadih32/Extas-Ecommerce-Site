// PR 41 · the garment drawing a product shows until its photo is uploaded (demo 02-core.js garmentSVG / productImg):
// a flat drawing of the garment type in the colour's own hex, on a tint mixed from that colour. Once the owner uploads
// a photo for the colour, the photo shows instead (ProductCard). Pure string building, so it is tested on its own.

/** The drawing's paper colour and the photo-free card's view backgrounds (the demo's, part of the drawing itself). */
const PAPER = '#EFEDE8'; // hardcode-ok: the drawing's paper, a design constant of the demo artwork
const MODEL_PAPER = '#D9D5CE'; // hardcode-ok: the on-model view's paper
const FLAT_PAPER = '#ECEAE5'; // hardcode-ok: the flat-lay view's paper
const BLACK = '#000000'; // hardcode-ok: shading mix
const WHITE = '#ffffff'; // hardcode-ok: highlight mix

const FALLBACK = '#9A9A9A'; // hardcode-ok: a colour row with no usable hex draws grey, never breaks the drawing

/** A colour as `#rrggbb`, or grey: the catalogue's hex is checked before it goes into the drawing. */
export function safeHex(hex: string | null | undefined): string {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : FALLBACK;
}

export type GarmentView = 'front' | 'back' | 'detail' | 'flat' | 'model';

const rgb = (h: string) => {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(x.slice(i, i + 2), 16));
};

/** Mix two `#rrggbb` colours: t = 0 gives a, t = 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v * (1 - t) + y[i]! * t).toString(16).padStart(2, '0')).join('')}`;
}

/** A light colour (the demo's perceived-brightness test, > 170 of 255). */
export function isLight(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return (r! * 299 + g! * 587 + b! * 114) / 1000 > 170;
}

/** The tint behind a drawing or a loading photo. */
export function drawingBackground(colour: string, view: GarmentView = 'front'): string {
  const hex = safeHex(colour);
  if (view === 'flat') return FLAT_PAPER;
  if (view === 'model') return mixHex(hex, MODEL_PAPER, 0.86);
  return mixHex(hex, PAPER, isLight(hex) ? 0.55 : 0.8);
}

/** The garment types with a drawing (the catalogue's garment type keys). */
export const DRAWN_GARMENTS = ['polo', 'tee', 'shirt', 'panjabi', 'hoodie', 'trouser'] as const;

/** The inside of the drawing's <svg viewBox="0 0 200 222">, or '' for a garment type without one. */
export function garmentArt(type: string | null, colour: string, view: GarmentView = 'front'): string {
  const hex = safeHex(colour);
  const dark = mixHex(hex, BLACK, 0.28);
  const light = isLight(hex);
  const line = light ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.22)';
  const det = light ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.30)';
  const back = view === 'back';
  let g = '';
  if (type === 'polo' || type === 'tee') {
    g += `<path d="M62 22 L82 12 Q100 28 118 12 L138 22 L178 46 L162 82 L146 74 L146 208 L54 208 L54 74 L38 82 L22 46 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    g += `<path d="M54 196 L146 196" stroke="${det}" stroke-width="1.2"/><path d="M38 82 L54 74 M162 82 L146 74" stroke="${det}" stroke-width="1.2"/>`;
    if (type === 'polo' && !back) {
      g += `<path d="M82 12 L100 38 L118 12 L111 9 Q100 20 89 9 Z" fill="${dark}" opacity=".55"/>`;
      g += `<path d="M82 12 L70 30 L94 30 Z M118 12 L130 30 L106 30 Z" fill="${hex}" stroke="${line}" stroke-width="1.2"/>`;
      g += `<path d="M100 38 L100 72" stroke="${det}" stroke-width="1.4"/><circle cx="100" cy="50" r="2.2" fill="${det}"/><circle cx="100" cy="63" r="2.2" fill="${det}"/>`;
    } else if (type === 'tee') {
      g += `<path d="M82 12 Q100 30 118 12" fill="none" stroke="${det}" stroke-width="3"/>`;
    } else {
      g += `<path d="M82 12 Q100 18 118 12" fill="none" stroke="${det}" stroke-width="5"/>`;
    }
  } else if (type === 'shirt') {
    g += `<path d="M64 22 L84 12 L100 30 L116 12 L136 22 L174 50 L186 156 L168 160 L154 86 L150 210 L50 210 L46 86 L32 160 L14 156 L26 50 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    if (!back) {
      g += `<path d="M84 12 L100 30 L116 12 L108 8 L100 18 L92 8 Z" fill="${mixHex(hex, WHITE, 0.25)}" stroke="${line}" stroke-width="1"/><path d="M100 30 L100 206" stroke="${det}" stroke-width="1.4"/>`;
      for (let i = 0; i < 6; i++) g += `<circle cx="103.5" cy="${48 + i * 26}" r="2" fill="${det}"/>`;
      g += `<rect x="62" y="64" width="22" height="18" fill="none" stroke="${det}" stroke-width="1.1"/>`;
    }
    g += `<path d="M168 160 L186 156 M14 156 L32 160" stroke="${det}" stroke-width="2"/>`;
  } else if (type === 'panjabi') {
    g += `<path d="M68 20 L86 12 Q100 18 114 12 L132 20 L168 46 L180 156 L164 158 L152 80 L152 216 L48 216 L48 80 L36 158 L20 156 L32 46 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    if (!back) {
      g += `<path d="M88 11 Q100 17 112 11 L112 16 Q100 22 88 16 Z" fill="${dark}" opacity=".5"/><path d="M100 18 L100 86" stroke="${det}" stroke-width="1.4"/>`;
      for (let j = 0; j < 4; j++) g += `<circle cx="100" cy="${30 + j * 15}" r="2" fill="${det}"/>`;
    }
    g += `<path d="M48 200 L60 216 M152 200 L140 216" stroke="${det}" stroke-width="1.2"/>`;
  } else if (type === 'hoodie') {
    g += `<path d="M62 30 L80 20 L120 20 L138 30 L174 54 L186 160 L168 164 L154 90 L152 206 L48 206 L46 90 L32 164 L14 160 L26 54 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    g += `<path d="M74 28 Q100 -8 126 28 L120 46 Q100 58 80 46 Z" fill="${mixHex(hex, BLACK, 0.12)}" stroke="${line}" stroke-width="1.2"/>`;
    if (!back) g += `<path d="M92 52 L90 84 M108 52 L110 84" stroke="${det}" stroke-width="1.6"/><path d="M68 140 L132 140 L142 186 L58 186 Z" fill="none" stroke="${det}" stroke-width="1.4"/>`;
    g += `<path d="M48 194 L152 194 M168 164 L186 160 M14 160 L32 164" stroke="${det}" stroke-width="2"/>`;
  } else if (type === 'trouser') {
    g += `<path d="M58 10 L142 10 L152 212 L112 212 L100 74 L88 212 L48 212 Z" fill="${hex}" stroke="${line}" stroke-width="1.5"/>`;
    g += `<path d="M58 24 L142 24" stroke="${det}" stroke-width="1.6"/><path d="M100 24 L100 74" stroke="${det}" stroke-width="1.2"/>`;
    if (!back) g += `<path d="M62 26 Q72 50 86 30 M138 26 Q128 50 114 30" fill="none" stroke="${det}" stroke-width="1.2"/>`;
    else g += `<rect x="66" y="40" width="22" height="22" fill="none" stroke="${det}" stroke-width="1.1"/><rect x="112" y="40" width="22" height="22" fill="none" stroke="${det}" stroke-width="1.1"/>`;
  }
  if (!g) return '';
  const tr = view === 'detail' ? ' transform="translate(-100 -10) scale(2)"' : view === 'flat' ? ' transform="rotate(-4 100 110)"' : '';
  return `<g${tr}>${g}</g>`;
}
