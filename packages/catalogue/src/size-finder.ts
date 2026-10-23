// PR 58 — Find My Size, rule-based (Blueprint D3.8 "ease per fit feeds Find my size (rule-based, works with AI off)";
// demo 02-core.js recommendSize, 30-product.js pdp_reasons). Height and weight give an estimate of the body measure the
// chart is cut for (chest for a top, waist for a bottom: the `body` models of the `pdp.finder` setting), the chart's own
// ease (room over the body, per chart = per garment type and fit, S01 PR 27) is added, and the smallest size whose
// garment measure covers it is the answer. The answer always comes from the owner's chart: a product without a chart,
// or a chart without the measure a model needs, gets no answer at all (never an invented size). The length of that
// size is then checked against the height (the `length` rule). Pure: no database, no settings reader — callers pass the
// chart and the store's rules. Imported in the browser as `@extas/catalogue/size-finder`, so the page, the server's
// record and the reply drafter (S22, SIM-F-012: `parseBodyText`) give the same size for the same question.

/** One centimetre in inches is 1 / 2.54 — the international inch, a unit definition, not a business number. */
export const CM_PER_INCH = 2.54;

/** How a body measure (cm) is estimated from height and weight: base + perKg × kg + perHeightCm × height in cm. */
export interface BodyModel {
  /** The chart's measurement key this model estimates (`chest`, `waist`). */
  field: string;
  /** A top or a bottom: which length words and which length ratio apply. */
  kind: 'top' | 'bottom';
  baseCm: number;
  perKgCm: number;
  perHeightCm: number;
}

/** The length check: a garment's length against the wearer's height (length ≈ ratio × height). */
export interface LengthRule {
  /** The chart's length key; a chart without it gets no length line. */
  field: string;
  /** Within this many inches either side the length is "right". */
  toleranceInch: number;
  topRatio: number;
  bottomRatio: number;
  /** A garment type's own ratio (polo 0.42, panjabi 0.6 …), by GarmentType.key. */
  byGarment: Readonly<Record<string, number>>;
}

export interface FinderRules {
  /** In order: the first model whose field the chart has is used. */
  body: readonly BodyModel[];
  /** A size still covers the need when its measure is short of it by at most this (the demo's half inch). */
  toleranceInch: number;
  length: LengthRule;
}

/** The chart as the finder reads it: the product's own sizes, in the shop's order, each value in inches. */
export interface FinderChart {
  fields: readonly { key: string }[];
  rows: readonly { size: string; inch: readonly (number | null)[] }[];
  /** The chart's ease in inches (the owner's per-chart value, else the store's default). */
  easeInch: number;
}

export interface LengthVerdict {
  /** The size's length, inches. */
  value: number;
  verdict: 'ok' | 'long' | 'short';
  /** How much longer the next size is (inches), when it is. */
  more: number | null;
}

export interface Recommendation {
  /** The size key the chart answers. */
  size: string;
  /** The next size up (between sizes, or roomier), null at the largest. */
  next: string | null;
  /** The measure that decided it, and that size's value of it (inches). */
  field: string;
  kind: BodyModel['kind'];
  value: number;
  /** About how much the wearer needs (body + ease) and the body estimate alone, inches, to a tenth. */
  need: number;
  body: number;
  ease: number;
  /** False when even the largest size is short of the need (the answer is the largest, "it may feel close"). */
  covered: boolean;
  length: LengthVerdict | null;
}

const tenth = (v: number) => Math.round(v * 10) / 10;
const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The model this chart can answer with (the first whose field the chart has a value for), or null: no answer. */
export function bodyModelFor(chart: FinderChart | null, rules: Pick<FinderRules, 'body'>): { model: BodyModel; index: number } | null {
  if (!chart || !chart.rows.length) return null;
  for (const model of rules.body) {
    const index = chart.fields.findIndex((f) => f.key === model.field);
    if (index >= 0 && chart.rows.some((r) => ok(r.inch[index]))) return { model, index };
  }
  return null;
}

/** The finder is offered on this chart (it has a measure one of the models can answer with). */
export function canRecommend(chart: FinderChart | null, rules: Pick<FinderRules, 'body'>): boolean {
  return bodyModelFor(chart, rules) !== null;
}

/**
 * The size for a height (inches) and weight (kg) on this chart, or null when the chart cannot answer. `garment` is the
 * product's garment type key (its own length ratio).
 */
export function recommendSize(chart: FinderChart | null, heightIn: number, weightKg: number, rules: FinderRules, garment: string | null = null): Recommendation | null {
  const pick = bodyModelFor(chart, rules);
  if (!chart || !pick || !(heightIn > 0) || !(weightKg > 0)) return null;
  const { model, index } = pick;
  const rows = chart.rows.filter((r) => ok(r.inch[index]));
  const heightCm = heightIn * CM_PER_INCH;
  const body = (model.baseCm + model.perKgCm * weightKg + model.perHeightCm * heightCm) / CM_PER_INCH;
  const ease = Math.max(0, chart.easeInch);
  const need = body + ease;
  let at = rows.findIndex((r) => r.inch[index]! >= need - rules.toleranceInch);
  const covered = at >= 0;
  if (!covered) at = rows.length - 1;
  const row = rows[at]!;
  const nextRow = rows[at + 1] ?? null;
  return {
    size: row.size,
    next: nextRow?.size ?? null,
    field: model.field,
    kind: model.kind,
    value: row.inch[index]!,
    need: tenth(need),
    body: tenth(body),
    ease: tenth(ease),
    covered,
    length: lengthVerdict(chart, row.size, nextRow?.size ?? null, heightIn, model.kind, rules.length, garment),
  };
}

/** The length line: the size's length against `ratio × height` (null when the chart has no length). */
export function lengthVerdict(chart: FinderChart, size: string, next: string | null, heightIn: number, kind: BodyModel['kind'], rule: LengthRule, garment: string | null): LengthVerdict | null {
  const li = chart.fields.findIndex((f) => f.key === rule.field);
  if (li < 0) return null;
  const v = chart.rows.find((r) => r.size === size)?.inch[li];
  if (!ok(v)) return null;
  const ratio = (garment ? rule.byGarment[garment] : undefined) ?? (kind === 'bottom' ? rule.bottomRatio : rule.topRatio);
  const d = v - heightIn * ratio;
  const nv = next ? chart.rows.find((r) => r.size === next)?.inch[li] : null;
  const more = ok(nv) && nv > v ? Math.round((nv - v) * 100) / 100 : null;
  return { value: v, verdict: Math.abs(d) <= rule.toleranceInch ? 'ok' : d > 0 ? 'long' : 'short', more };
}

// ---- SIM-F-012: a size question in words ----

/** Bengali digits to Western ones, for reading what a customer typed. */
export function westernDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

const FT = String.raw`(?:'|’|′|ft\.?|feet|foot|fit|fut|ফুট|ফিট|ফু)`;
const IN = String.raw`(?:"|”|″|''|in\.?|inch(?:es)?|inchi|ইঞ্চি|ইঞ্চ)`;
const KG = String.raw`(?:kg|kgs|kilo(?:gram)?s?|কেজি|কিলো)`;
const CM = String.raw`(?:cm|সেমি|সেন্টিমিটার)`;
const WEIGHT_WORD = String.raw`(?:weight|wt|ojon|ozon|wajan|wazan|ওজন)`;
const HEIGHT_WORD = String.raw`(?:height|ht|uchcota|uchota|lomba|উচ্চতা|লম্বা|হাইট)`;

/** The plausible range of what the parser accepts (a typo like "56 ft" is not a height). */
const HEIGHT_IN = { min: 48, max: 90 } as const;
const WEIGHT_KG = { min: 30, max: 200 } as const;

/**
 * Height and weight read from a customer's own words, in English, Banglish or Bengali, with Bengali or Western digits:
 * "উচ্চতা ৫ ফুট ৬, ওজন ৬৫", "5'6\" 65kg", "height 5 feet 8 inch weight 70", "ami 5.7, 68 kg", "170 cm 72 kg".
 * Null when either is missing or out of range — the drafter then asks for it instead of guessing.
 */
export function parseBodyText(text: string): { heightIn: number; weightKg: number } | null {
  const s = ` ${westernDigits(String(text ?? '')).toLowerCase().replace(/[,;]/g, ' ')} `;
  let heightIn: number | null = null;
  let used: [number, number] | null = null;
  const ftIn = new RegExp(String.raw`(\d)\s*${FT}\s*(?:(\d{1,2}(?:\.\d+)?)\s*${IN}?)?`, 'u').exec(s);
  if (ftIn) {
    heightIn = Number(ftIn[1]) * 12 + (ftIn[2] ? Number(ftIn[2]) : 0);
    used = [ftIn.index, ftIn.index + ftIn[0].length];
  }
  if (heightIn === null) {
    const cm = new RegExp(String.raw`(\d{3}(?:\.\d)?)\s*${CM}`, 'u').exec(s);
    if (cm) {
      heightIn = Number(cm[1]) / CM_PER_INCH;
      used = [cm.index, cm.index + cm[0].length];
    }
  }
  if (heightIn === null) {
    // "5.6" or "5.10" = five feet six / ten (how heights are written in chat), only in the 4–7 ft band
    const dot = /(?<![\d.])([4-7])\.(\d{1,2})(?![\d.]|\s*(?:kg|kgs|kilo|কেজি))/u.exec(s);
    if (dot && Number(dot[2]) < 12) {
      heightIn = Number(dot[1]) * 12 + Number(dot[2]);
      used = [dot.index, dot.index + dot[0].length];
    }
  }
  const rest = used ? s.slice(0, used[0]) + ' '.repeat(used[1] - used[0]) + s.slice(used[1]) : s;
  let weightKg: number | null = null;
  const kg = new RegExp(String.raw`(\d{2,3}(?:\.\d)?)\s*${KG}`, 'u').exec(rest);
  if (kg) weightKg = Number(kg[1]);
  if (weightKg === null) {
    const word = new RegExp(String.raw`${WEIGHT_WORD}\D{0,8}?(\d{2,3}(?:\.\d)?)`, 'u').exec(rest);
    if (word) weightKg = Number(word[1]);
  }
  if (heightIn === null) {
    const word = new RegExp(String.raw`${HEIGHT_WORD}\D{0,8}?(\d{3})(?!\d)`, 'u').exec(rest);
    if (word) heightIn = Number(word[1]) / CM_PER_INCH;
  }
  if (heightIn === null || weightKg === null) return null;
  if (heightIn < HEIGHT_IN.min || heightIn > HEIGHT_IN.max || weightKg < WEIGHT_KG.min || weightKg > WEIGHT_KG.max) return null;
  return { heightIn: Math.round(heightIn), weightKg: Math.round(weightKg) };
}

/** A size question answered from the chart (SIM-F-012: the drafter's "size" intent calls this), or null. */
export function answerSizeText(text: string, chart: FinderChart | null, rules: FinderRules, garment: string | null = null): ({ heightIn: number; weightKg: number } & { rec: Recommendation }) | null {
  const body = parseBodyText(text);
  if (!body) return null;
  const rec = recommendSize(chart, body.heightIn, body.weightKg, rules, garment);
  return rec ? { ...body, rec } : null;
}
