// PR 56 — the product page's size boxes (Blueprint D3.5, demo 30-product.js pdp_pills / pdp_fitLine): one box per
// size on one row, the chosen one marked, a size out of stock in this colour crossed out and not tappable, a size sold
// out in every colour crossed out or left out (`pdp.size.soldOutEverywhere`, SIM-F-035), and the measurement line of
// the chosen size. Pure.
import type { PdpSizeSettings } from '@extas/settings';
import { stockOf, type PdpChart, type PdpChoice, type PdpModel } from './product-model';

export interface PdpPill {
  key: string;
  label: string;
  on: boolean;
  /** Out of stock in the chosen colour: crossed out, not tappable. */
  out: boolean;
  /** Out of stock in every colour. */
  gone: boolean;
}

/** The size boxes for the chosen colour. */
export function sizePills(m: Pick<PdpModel, 'sizes' | 'variants' | 'colours'>, choice: PdpChoice, mode: PdpSizeSettings['soldOutEverywhere']): PdpPill[] {
  const colours = m.colours.length ? m.colours.map((c) => c.key) : [null];
  return m.sizes
    .map((s) => {
      const gone = colours.every((c) => stockOf(m, c, s.key) <= 0);
      return { key: s.key, label: s.label, on: choice.size === s.key, out: stockOf(m, choice.colour, s.key) <= 0, gone };
    })
    .filter((p) => !(mode === 'hide' && p.gone && !p.on));
}

/** The chosen size's measurements, in the chart's order (R14 · 14.9: every field the chart has, the first one leads). */
export function measureParts(chart: PdpChart | null, size: string | null, unit: 'inch' | 'cm'): { field: string; value: number }[] {
  if (!chart || !size) return [];
  const row = chart.rows.find((r) => r.size === size);
  if (!row) return [];
  const vals = unit === 'cm' ? row.cm : row.inch;
  return chart.fields.flatMap((f, i) => (vals[i] == null ? [] : [{ field: f.label, value: vals[i]! }]));
}

/** A measurement as the page writes it: inches to a quarter, centimetres whole (the chart's own rounding). */
export function measureText(v: number): string {
  return String(Math.round(v * 100) / 100);
}
