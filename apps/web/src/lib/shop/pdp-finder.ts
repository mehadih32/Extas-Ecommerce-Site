// PR 58 — Find My Size on the product page (Blueprint D3.8, demo 30-product.js pdp_fmsCard / pdp_finderHTML /
// pdp_reasons / pdp_stepApply): what the page needs around the engine in @extas/catalogue/size-finder. The product's
// chart as the engine reads it, the store's rules from `pdp.finder`, whether the finder is offered at all (only with a
// chart it can read: never an invented size), the height and weight kept on this phone (one small cookie, nothing
// else), the steppers' arithmetic, and the reasons in the page's language with their numbers in bold. Pure: the page,
// the popup, the T3 card and the server's record all call these, so they say the same size for the same answer.
import { canRecommend, CM_PER_INCH, recommendSize, type FinderChart, type FinderRules, type Recommendation } from '@extas/catalogue/size-finder';
import type { PdpFinderSettings } from '@extas/settings';
import { measureText } from './pdp-size';
import { isOneSize, type PdpChart, type PdpModel } from './product-model';

/** The cookie that keeps the shopper's height and weight (`67.66`: inches, kilograms). */
export const FIT_COOKIE = 'extas_fit';
/** `?finder=1` on a product address opens Find My Size (the bag's "Help me pick my size"). */
export const FINDER_QUERY = 'finder';

/** The shopper's answer: height in whole inches, weight in whole kilograms. */
export interface FitBody {
  heightIn: number;
  weightKg: number;
}

type Rules = Pick<
  PdpFinderSettings,
  'on' | 'body' | 'toleranceInch' | 'length' | 'heightMinIn' | 'heightMaxIn' | 'weightMinKg' | 'weightMaxKg' | 'startHeightIn' | 'startWeightKg'
>;

/** The engine's rules from the setting (the length line off = a field no chart has). */
export function finderRules(f: Pick<PdpFinderSettings, 'body' | 'toleranceInch' | 'length'>): FinderRules {
  return {
    body: f.body,
    toleranceInch: f.toleranceInch,
    length: { field: f.length.on ? f.length.field : '', toleranceInch: f.length.toleranceInch, topRatio: f.length.topRatio, bottomRatio: f.length.bottomRatio, byGarment: f.length.byGarment },
  };
}

/** The page's chart as the engine reads it. */
export function finderChart(c: PdpChart | null): FinderChart | null {
  return c ? { fields: c.fields, rows: c.rows.map((r) => ({ size: r.size, inch: r.inch })), easeInch: c.easeInch } : null;
}

/** The finder is offered on this product: switched on, on sale, more than one size, and a chart it can answer from. */
export function finderOffered(m: Pick<PdpModel, 'onSale' | 'sizes' | 'chart'>, f: Pick<PdpFinderSettings, 'on' | 'body'>): boolean {
  return f.on && m.onSale && !isOneSize(m) && canRecommend(finderChart(m.chart), f);
}

/** The size this answer gives on this product's chart (null: the chart cannot answer). */
export function sizeFor(m: Pick<PdpModel, 'chart' | 'garment'>, f: Pick<PdpFinderSettings, 'body' | 'toleranceInch' | 'length'>, b: FitBody): Recommendation | null {
  return recommendSize(finderChart(m.chart), b.heightIn, b.weightKg, finderRules(f), m.garment);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** An answer held inside the steppers' range, in whole numbers. */
export function clampBody(b: FitBody, f: Rules): FitBody {
  return { heightIn: clamp(Math.round(b.heightIn), f.heightMinIn, f.heightMaxIn), weightKg: clamp(Math.round(b.weightKg), f.weightMinKg, f.weightMaxKg) };
}

/** Where the steppers start: the kept answer, else the setting's first answer. */
export function startBody(kept: FitBody | null, f: Rules): FitBody {
  return clampBody(kept ?? { heightIn: f.startHeightIn, weightKg: f.startWeightKg }, f);
}

/** One press of a stepper: a foot is twelve inches; the range holds. */
export function stepBody(b: FitBody, k: 'ft' | 'in' | 'kg', d: 1 | -1, f: Rules): FitBody {
  if (k === 'kg') return clampBody({ ...b, weightKg: b.weightKg + d }, f);
  return clampBody({ ...b, heightIn: b.heightIn + (k === 'ft' ? 12 * d : d) }, f);
}

/** Whether a press would change anything (the − at the floor and the + at the top are spent). */
export function canStep(b: FitBody, k: 'ft' | 'in' | 'kg', d: 1 | -1, f: Rules): boolean {
  const n = stepBody(b, k, d, f);
  return n.heightIn !== b.heightIn || n.weightKg !== b.weightKg;
}

export const feetInches = (heightIn: number) => ({ ft: Math.floor(heightIn / 12), inch: heightIn % 12 });
export const heightCm = (heightIn: number) => Math.round(heightIn * CM_PER_INCH);

/** The kept answer read back (a damaged or out-of-range cookie is no answer). */
export function readFit(value: string | null | undefined, f: Rules): FitBody | null {
  const m = /^(\d{2})\.(\d{2,3})$/.exec(decodeURIComponent(value ?? ''));
  if (!m) return null;
  const b = { heightIn: Number(m[1]), weightKg: Number(m[2]) };
  if (b.heightIn < f.heightMinIn || b.heightIn > f.heightMaxIn || b.weightKg < f.weightMinKg || b.weightKg > f.weightMaxKg) return null;
  return b;
}

export const fitCookieValue = (b: FitBody) => `${Math.round(b.heightIn)}.${Math.round(b.weightKg)}`;

/** What the reasons need from the page: its words, digits and the unit the shopper reads in. */
export interface ReasonWords {
  w: (key: string, vars?: Record<string, string | number>) => string;
  has: (key: string) => boolean;
  num: (n: number | string) => string;
  unit: 'inch' | 'cm';
  /** A size key's label ("L", "32"). */
  label: (size: string) => string;
  /** A measure's name as written mid-sentence (lower case in English). */
  low: (label: string) => string;
  height: string;
  weight: string;
  garment: string | null;
  /** The chart's length key (`pdp.finder.length.field`). */
  lengthField: string;
}

/** "5'7"" and "66 kg" in the page's language and digits. */
export function bodyWords(b: FitBody, w: ReasonWords['w'], num: ReasonWords['num']): { height: string; weight: string } {
  const { ft, inch } = feetInches(b.heightIn);
  return { height: w('finder.heightFmt', { ft: num(ft), in: num(inch) }), weight: w('finder.weightFmt', { n: num(b.weightKg) }) };
}

/**
 * The reasons under the answer (demo pdp_reasons), each with its numbers in **bold**: the measure that decided it (what
 * the body needs, the chart's room for this fit, the closest size that covers it — or that even the largest may feel
 * close), then the length against the height when the chart has one.
 */
export function reasonLines(rec: Recommendation, chart: PdpChart, o: ReasonWords): string[] {
  const { w, num } = o;
  const at = (key: string) => chart.fields.findIndex((f) => f.key === key);
  const row = chart.rows.find((r) => r.size === rec.size);
  const val = (inch: number, cm?: number | null) =>
    o.unit === 'cm' ? w('cm', { v: num(measureText(cm ?? Math.round(inch * CM_PER_INCH))) }) : w('inch', { v: num(measureText(inch)) });
  const i = at(rec.field);
  if (i < 0 || !row) return [];
  const field = chart.fields[i]!.label;
  const size = o.label(rec.size);
  const out = [
    rec.covered
      ? w('finder.why.covers', {
          field,
          value: val(rec.value, row.cm[i]),
          height: o.height,
          weight: o.weight,
          need: val(rec.need),
          fieldLow: o.low(field),
          body: val(rec.body),
          ease: val(rec.ease),
          size,
        })
      : w('finder.why.largest', { field, value: val(rec.value, row.cm[i]), need: val(rec.need), size }),
  ];
  const len = rec.length;
  const li = len ? at(o.lengthField) : -1;
  if (len && li >= 0) {
    const vars = { field: chart.fields[li]!.label, value: val(len.value, row.cm[li]), height: o.height };
    const where = o.garment ? `finder.where.${o.garment}` : '';
    if (len.verdict === 'ok') out.push(where && o.has(where) ? w('finder.len.ok', { ...vars, where: w(where) }) : w('finder.len.okPlain', vars));
    else if (len.verdict === 'long') out.push(w(rec.kind === 'bottom' ? 'finder.len.longBottom' : 'finder.len.longTop', vars));
    else if (rec.next && len.more) out.push(w('finder.len.short', { ...vars, next: o.label(rec.next), more: val(len.more) }));
    else out.push(w('finder.len.shortLast', vars));
  }
  return out;
}
