// PR 27, 28 — the size chart's arithmetic, with no database and no settings: callers pass the store's values. It is
// imported by the admin screen in the browser too (`@extas/catalogue/size-chart-math`), so the screen and the server
// agree on every number. Ported from the approved demo (docs/demo/src/82-admin-sizecharts.js: sc_sortKeys, sc_addRow,
// sc_parse, sc_missing; 02-core.js inchToCm).

/** One centimetre in inches is 1 / 2.54 — the international inch, a unit definition, not a business number. */
const CM_PER_INCH = 2.54;

export type MeasureUnit = 'inch' | 'cm';

export interface ChartRow {
  /** The size key (Size.key, e.g. `m`, `xl`, `32`). */
  size: string;
  /** One value per field, in each field's own unit. */
  values: number[];
}

/** Rounds to `decimals` places without floating noise (40.6399999 → 40.64). */
export function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * f) / f;
}

/** Rounds to the nearest step (0.25 → quarter inches). */
export function roundToStep(v: number, step: number): number {
  if (!(step > 0)) return v;
  const decimals = Math.min(6, Math.max(0, (String(step).split('.')[1] ?? '').length));
  return round(Math.round(v / step) * step, decimals);
}

export const inchToCm = (inch: number, decimals: number): number => round(inch * CM_PER_INCH, decimals);
export const cmToInch = (cm: number, decimals: number): number => round(cm / CM_PER_INCH, decimals);

/** A value in both units: inches typed once, cm worked out (or the other way for a cm field). */
export function bothUnits(value: number, unit: MeasureUnit, cmDecimals: number, inchDecimals = 2): { inch: number; cm: number } {
  return unit === 'cm' ? { inch: cmToInch(value, inchDecimals), cm: round(value, cmDecimals) } : { inch: round(value, inchDecimals), cm: inchToCm(value, cmDecimals) };
}

/** Sizes in the shop's order (`order` = size keys by Size.sortOrder); unknown keys last, numbers by value. */
export function sortSizes<T extends string>(keys: readonly T[], order: readonly string[]): T[] {
  const pos = new Map(order.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

export function sortRows(rows: readonly ChartRow[], order: readonly string[]): ChartRow[] {
  const by = new Map(rows.map((r) => [r.size, r]));
  return sortSizes([...by.keys()], order).map((k) => by.get(k)!);
}

/**
 * A suggested row for a size the chart lacks (the coverage warning's "Add row"): between two rows it is their middle;
 * past the last (or before the first) it continues the chart's own step (the last row minus the one before); with a
 * single neighbour it copies it. Rounded to the measurement step. The person always checks it before saving.
 */
export function suggestRow(rows: readonly ChartRow[], order: readonly string[], size: string, step: number): number[] {
  const sorted = sortRows(rows.filter((r) => r.size !== size), order);
  const keys = sortSizes([...sorted.map((r) => r.size), size], order);
  const i = keys.indexOf(size);
  const at = (k: number) => (k >= 0 && k < keys.length && k !== i ? sorted.find((r) => r.size === keys[k]) : undefined);
  const prev = at(i - 1);
  const prev2 = at(i - 2);
  const next = at(i + 1);
  const next2 = at(i + 2);
  const n = (prev ?? next)?.values.length ?? 0;
  const out: number[] = [];
  for (let f = 0; f < n; f++) {
    let v: number;
    if (prev && next) v = (prev.values[f]! + next.values[f]!) / 2;
    else if (prev) v = prev.values[f]! + (prev2 ? prev.values[f]! - prev2.values[f]! : 0);
    else v = next!.values[f]! - (next2 ? next2.values[f]! - next!.values[f]! : 0);
    out.push(roundToStep(v, step));
  }
  return out;
}

export interface PastedRows {
  rows: ChartRow[];
  /** Lines whose size is not one of the shop's sizes. */
  unknownSizes: string[];
  /** Lines skipped: a header line, too few numbers. */
  skipped: number;
}

/**
 * Rows pasted from Excel or Google Sheets: one size per line, the size first, then the numbers in the chart's field
 * order; tabs, spaces, commas or semicolons; a header line is skipped. `sizeOf` maps what was typed ("XL", "32") to
 * the shop's size key, or null.
 */
export function parsePasted(text: string, fields: number, sizeOf: (typed: string) => string | null): PastedRows {
  const rows = new Map<string, number[]>();
  const unknownSizes: string[] = [];
  let skipped = 0;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const tk = line.trim().split(/[\s,;\t]+/).filter(Boolean);
    if (!tk.length) continue;
    const nums = tk.slice(1).map((x) => Number(x));
    if (tk.length < 2 || nums.some((x) => !Number.isFinite(x)) || nums.length < fields) {
      skipped++;
      continue;
    }
    const key = sizeOf(tk[0]!);
    if (!key) {
      unknownSizes.push(tk[0]!);
      continue;
    }
    rows.set(key, nums.slice(0, fields));
  }
  return { rows: [...rows].map(([size, values]) => ({ size, values })), unknownSizes, skipped };
}

/** The sizes a product sells (from the ERP) that the chart has no row for. */
export function missingSizes(chartSizes: readonly string[], productSizes: readonly string[]): string[] {
  const have = new Set(chartSizes);
  return [...new Set(productSizes)].filter((s) => !have.has(s));
}

/**
 * Find my size, rule-based (works with AI off): the smallest size whose garment measure in `field` is at least the
 * body measure plus the chart's ease. Null when even the largest is too small.
 */
export function sizeForBody(rows: readonly ChartRow[], order: readonly string[], field: number, bodyInch: number, easeInch: number): string | null {
  for (const r of sortRows(rows, order)) {
    const v = r.values[field];
    if (v !== undefined && v >= bodyInch + easeInch) return r.size;
  }
  return null;
}
