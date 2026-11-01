// S20 · PR 408 — the print quality rules of Blueprint B2.4, checked on what was really drawn: nothing cut at the page's
// edge, no text wider than its box, no text over other text (what `Sheet` noticed while placing), no ink in the outer
// band a printer cannot reach (`edgeMm`), and black-and-white safe (every page is one greyscale picture drawn in black on
// white, so nothing depends on colour; the check counts how much of the ink is mid-grey, which a weak printer loses).
// Pure: pages in, findings out. The admin's "Print check" and the tests run every document at every size through it.
import { mmToPx, type PdfPage } from './pdf';

/** What one page broke (none: an empty list). */
export type PrintProblem = 'CUT' | 'OVERFLOW' | 'OVERLAP' | 'EDGE_INK' | 'FAINT';

export interface PageQuality {
  problems: PrintProblem[];
  /** Dark pixels inside the outer band. */
  edgeInk: number;
  /** Of all the ink, the share that is mid-grey (0–1). */
  faintShare: number;
}

/** Ink darker than this is "black" (0 black … 255 white). */
const DARK = 128;
/** Lighter than black but still ink: what a weak or a black-only printer may drop. */
const FAINT = 200;
/** Above this share of faint ink the page is not black-and-white safe (anti-aliased letter edges stay well below). */
const FAINT_MAX = 0.45;

/** One page's quality with an outer band of `edgeMm` (at the page's own pixels per inch). */
export function pageQuality(page: PdfPage, opts: { edgeMm: number }): PageQuality {
  const { width, height, gray } = page.image;
  const dpi = page.widthPt > 0 ? (width * 72) / page.widthPt : 0;
  const band = Math.min(Math.floor(Math.min(width, height) / 4), mmToPx(opts.edgeMm, dpi));
  let edgeInk = 0;
  let dark = 0;
  let faint = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const inBandY = y < band || y >= height - band;
    for (let x = 0; x < width; x++) {
      const v = gray[row + x]!;
      if (v >= FAINT) continue;
      if (v < DARK) {
        dark += 1;
        if (inBandY || x < band || x >= width - band) edgeInk += 1;
      } else faint += 1;
    }
  }
  const ink = dark + faint;
  const faintShare = ink ? faint / ink : 0;
  const problems: PrintProblem[] = [];
  if (page.check?.cut) problems.push('CUT');
  if (page.check?.overflow) problems.push('OVERFLOW');
  if (page.check?.overlap) problems.push('OVERLAP');
  if (edgeInk) problems.push('EDGE_INK');
  if (faintShare > FAINT_MAX) problems.push('FAINT');
  return { problems, edgeInk, faintShare };
}

/** A whole document's quality: its pages and the problems of any page (each once). */
export function printQuality(pages: readonly PdfPage[], opts: { edgeMm: number }): { pages: number; problems: PrintProblem[] } {
  const all = new Set<PrintProblem>();
  for (const p of pages) for (const x of pageQuality(p, opts).problems) all.add(x);
  return { pages: pages.length, problems: [...all] };
}
