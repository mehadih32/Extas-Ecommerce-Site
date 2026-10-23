// PR 57 — the size chart popup (Blueprint D3.8, demo 30-product.js pdp_chartHTML): which chart a product uses and what
// the table holds. The chart is the owner's (PR 27/28): one per garment type and fit, assigned to a product or to its
// category. A measurement no size of this product has is not a column (D3.8: an empty measurement never renders), and
// only the product's own sizes are rows, in the shop's size order. Pure: product.ts reads the rows, this builds them.
import type { PdpChart, PdpChartField } from './product-model';

export interface ChartCandidate {
  id: string;
  fitKey: string | null;
  /** Assigned to this product (else to a category). */
  productId: string | null;
  categoryId: string | null;
}

/**
 * The chart for a product: one assigned to the product itself; else one assigned to its category, then the parent
 * categories, nearest first — the one of the product's fit, else of the shop's fallback fit, else any.
 */
export function pickChart<T extends ChartCandidate>(list: readonly T[], productId: string, categoryChain: readonly string[], fitKey: string | null, fallbackFit: string): T | null {
  const best = (pool: readonly T[]) =>
    pool.find((c) => fitKey && c.fitKey === fitKey) ?? pool.find((c) => c.fitKey === fallbackFit) ?? pool.find((c) => !c.fitKey) ?? pool[0] ?? null;
  const own = list.filter((c) => c.productId === productId);
  if (own.length) return best(own);
  for (const cat of categoryChain) {
    const pool = list.filter((c) => !c.productId && c.categoryId === cat);
    if (pool.length) return best(pool);
  }
  return null;
}

export interface ChartInput {
  name: string;
  /** The chart's measurement keys, in its own order. */
  fields: readonly string[];
  rows: readonly { size: string; values: readonly number[] }[];
}

export interface FieldMeta {
  key: string;
  label: string;
  unit: 'inch' | 'cm';
  howTo: string | null;
}

/**
 * The table the popup draws. `sizes` = the product's sizes in the shop's order; `convert` turns a value in its field's
 * unit into both units (the catalogue's `bothUnits`, with the shop's cm rounding).
 */
export function chartTable(
  chart: ChartInput,
  meta: ReadonlyMap<string, FieldMeta>,
  sizes: readonly string[],
  convert: (value: number, unit: 'inch' | 'cm') => { inch: number; cm: number },
): PdpChart | null {
  const rows = sizes.flatMap((s) => {
    const r = chart.rows.find((x) => x.size === s);
    return r ? [r] : [];
  });
  if (!rows.length) return null;
  const has = (v: number | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const keep = chart.fields.map((k, i) => ({ k, i })).filter(({ i }) => rows.some((r) => has(r.values[i])));
  if (!keep.length) return null;
  const fields: PdpChartField[] = keep.map(({ k }) => ({ key: k, label: meta.get(k)?.label ?? k, howTo: meta.get(k)?.howTo ?? null }));
  return {
    name: chart.name,
    fields,
    rows: rows.map((r) => {
      const both = keep.map(({ k, i }) => (has(r.values[i]) ? convert(r.values[i]!, meta.get(k)?.unit ?? 'inch') : null));
      return { size: r.size, inch: both.map((b) => b?.inch ?? null), cm: both.map((b) => b?.cm ?? null) };
    }),
  };
}

/**
 * A bottom garment gets the trousers tip under "How to measure", anything else the shirt tip: the garment types the
 * owner draws with the bottom diagram (`catalogue.sizeCharts.diagramFor`).
 */
export function isBottom(garment: string | null, diagramFor: Readonly<Record<string, string>>): boolean {
  return !!garment && diagramFor[garment] === 'bottom';
}

/**
 * The owner's "how to measure" text without its own lead-in: the catalogue's texts start with the field's name
 * ("Chest — across under the arms"), and the popup already writes the name in bold before it.
 */
export function howToText(label: string, text: string): string {
  const t = text.trim();
  const l = label.trim();
  if (!l || t.toLocaleLowerCase().indexOf(l.toLocaleLowerCase()) !== 0) return t;
  const after = t.slice(l.length);
  const rest = after.replace(/^\s*[—–:-]\s*/, '');
  return rest && rest !== after ? rest : t;
}
