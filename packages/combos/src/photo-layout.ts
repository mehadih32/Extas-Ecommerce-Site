// PR 575 — the set photo's layout, pure (Blueprint D8.5; demo ca_setPhoto and r12-zauto.css / r12-zcombo2.css):
// where each piece's photo goes on the one house background. Three layouts, one standard:
//   - side by side: two pieces in two halves (a colour pair, a two-piece pack);
//   - top + bottom: a top beside its trousers, the bottom set a little lower, the outfit flat-lay of the P3 page;
//   - three-up: one large piece on the left and two stacked on the right; four or more pieces share a grid.
// No text is ever baked in: "2 pcs" and "Save ৳…" are page badges. The geometry is the demo's; the canvas size,
// background, format and quality are the shop's settings (`combos.photo.*`).

export type PhotoLayout = 'side-by-side' | 'top-bottom' | 'three-up' | 'grid';

export interface PhotoCell {
  /** Which piece (0-based, page order). */
  piece: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A garment photo's shape in the demo (`.ca-pc { aspect-ratio: 200/222 }`): taller than wide. */
const PIECE_TALL = 222 / 200;
/** The space kept around a piece inside its cell (`.ca-half .ca-art { inset: 6% }`). */
const INSET = 0.06;
/** The thin line between cells in the hero layouts (`gap: 4px` at the demo's 1200 px width). */
const GAP = 4 / 1200;
/** Three-up (`.ca-ph-hero.n3 { grid-template-columns: 3fr 2fr }`): the big piece takes three fifths. */
const THREE_UP_BIG = 3 / 5;
/** Top + bottom (r12-zcombo2.css): the top at 3 % from the left, the bottom 3 % from the right and 6 % lower. */
const TB = { side: 0.03, width: 0.47, topY: 0.02, bottomY: 0.08 } as const;

/** The layout for a set: a top + bottom set of two keeps its outfit look; three pieces are three-up; more share a grid. */
export function layoutFor(type: string, pieces: number): PhotoLayout {
  if (pieces >= 4) return 'grid';
  if (pieces === 3) return 'three-up';
  return type === 'TOP_BOTTOM' && pieces === 2 ? 'top-bottom' : 'side-by-side';
}

const px = (v: number) => Math.round(v);

/** Shrinks a cell by the inset, so a piece never touches the edge or its neighbour. */
function inset(c: PhotoCell): PhotoCell {
  const m = Math.round(Math.min(c.width, c.height) * INSET);
  return { piece: c.piece, left: c.left + m, top: c.top + m, width: Math.max(1, c.width - 2 * m), height: Math.max(1, c.height - 2 * m) };
}

/** Where every piece goes on a canvas of `width` × `height` pixels (whole pixels, inside the canvas). */
export function photoCells(layout: PhotoLayout, pieces: number, width: number, height: number): PhotoCell[] {
  const n = Math.max(1, pieces);
  const gap = Math.max(1, px(width * GAP));
  const cells: PhotoCell[] = [];
  if (layout === 'top-bottom' && n === 2) {
    const w = px(width * TB.width);
    const h = Math.min(px(w * PIECE_TALL), height - px(height * TB.bottomY));
    cells.push({ piece: 0, left: px(width * TB.side), top: px(height * TB.topY), width: w, height: h });
    cells.push({ piece: 1, left: width - px(width * TB.side) - w, top: px(height * TB.bottomY), width: w, height: h });
    return cells;
  }
  if (layout === 'three-up' && n === 3) {
    const big = px((width - gap) * THREE_UP_BIG);
    const small = width - gap - big;
    const half = px((height - gap) / 2);
    cells.push({ piece: 0, left: 0, top: 0, width: big, height });
    cells.push({ piece: 1, left: big + gap, top: 0, width: small, height: half });
    cells.push({ piece: 2, left: big + gap, top: half + gap, width: small, height: height - half - gap });
    return cells.map(inset);
  }
  // Side by side (one row), or a grid of two rows for four or more.
  const rows = layout === 'grid' && n >= 4 ? 2 : 1;
  const cols = Math.ceil(n / rows);
  const cw = Math.floor((width - gap * (cols - 1)) / cols);
  const ch = Math.floor((height - gap * (rows - 1)) / rows);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const k = i % cols;
    cells.push({ piece: i, left: k * (cw + gap), top: r * (ch + gap), width: cw, height: ch });
  }
  return cells.map(inset);
}
