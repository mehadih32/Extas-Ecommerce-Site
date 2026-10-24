// PR 27, 28 — size charts (Blueprint D3.7 "Size charts live in e-commerce, not the ERP", D3.8; demo
// docs/demo/src/82-admin-sizecharts.js, #/admin/size-charts).
// - One chart per garment type and fit (e.g. Polo · Regular fit), with that garment type's measurement fields
//   (tops: chest/length/shoulder/sleeve; bottoms: waist/hip/thigh/length/leg opening). A chart may use fewer fields
//   than its type has: a measurement that is not on the chart never shows (D3.8).
// - The ERP holds only the size labels; the chart has one row per size of the shop (Size.key), values in the field's
//   unit (inches typed once, cm worked out: size-chart-math.ts). Ease (room over the body) per chart feeds Find my
//   size; a how-to-measure drawing per chart.
// - Which chart a product gets: its own (a per-style override) → else the category's default for the product's fit,
//   looked for from the category up through its parents → else the default of the fallback fit → else any default up
//   the tree. Set on upload by category + fit, nothing to do by hand.
// - Coverage check: a product that sells a size the chart has no row for is listed, with a suggested row.
// - Copy for a style that fits differently; archive only when nothing uses the chart; nothing is deleted.
//
// Stored shape (SizeChart.columns / .rows, Json): `columns` = { fields, easeInch, diagram, copiedFromId } and `rows` =
// [{ size, values }]. The PR 14 sample seed writes `columns` as the bare field list; both read the same.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { dictionaryKeySchema, measurementKeySchema, type Dictionary } from '@extas/settings';
import { allow, changed, found, logChange, parse, setting, TX, type CatalogueDeps, type Db, type Tx, type Who } from './context';
import { effectiveGarmentTypeOf } from './categories';
import { CatalogueError } from './errors';
import type { MeasurementField } from './garment-types';
import { bothUnits, missingSizes, sortRows, suggestRow, type ChartRow } from './size-chart-math';
import { normalizeName } from './text';

// ---------------------------------------------------------------------------------------------------------------
// Settings and stored shape
// ---------------------------------------------------------------------------------------------------------------

export interface SizeChartSettings {
  fits: Dictionary;
  fallbackFit: string;
  diagrams: Dictionary;
  diagramFor: Record<string, string>;
  howTo: Record<string, { en: string; bn: string }>;
  defaultEaseInch: number;
  stepInch: number;
  maxValueInch: number;
  maxRows: number;
  cmDecimals: number;
}

export async function sizeChartSettings(deps: CatalogueDeps, who: Who): Promise<SizeChartSettings> {
  const s = <K extends Parameters<typeof setting>[2]>(k: K) => setting(deps, who, k);
  const [fits, fallbackFit, diagrams, diagramFor, howTo, defaultEaseInch, stepInch, maxValueInch, maxRows, cmDecimals] = await Promise.all([
    s('catalogue.fits'),
    s('catalogue.sizeCharts.fallbackFit'),
    s('catalogue.sizeCharts.diagrams'),
    s('catalogue.sizeCharts.diagramFor'),
    s('catalogue.sizeCharts.howToMeasure'),
    s('catalogue.sizeCharts.defaultEaseInch'),
    s('catalogue.sizeCharts.valueStepInch'),
    s('catalogue.sizeCharts.maxValueInch'),
    s('catalogue.sizeCharts.maxRows'),
    s('catalogue.sizeCharts.cmDecimals'),
  ]);
  return { fits, fallbackFit, diagrams, diagramFor, howTo, defaultEaseInch, stepInch, maxValueInch, maxRows, cmDecimals };
}

interface ChartMeta {
  fields: string[];
  easeInch: number | null;
  diagram: string | null;
  copiedFromId: string | null;
}

const metaSchema = z
  .object({
    fields: z.array(measurementKeySchema),
    easeInch: z.number().nullable().optional(),
    diagram: z.string().nullable().optional(),
    copiedFromId: z.string().nullable().optional(),
  })
  .passthrough();

/** The chart's columns: the object this PR writes, or the bare field list the sample seed writes. */
export function readMeta(json: Prisma.JsonValue): ChartMeta {
  if (Array.isArray(json)) return { fields: json.filter((f): f is string => typeof f === 'string'), easeInch: null, diagram: null, copiedFromId: null };
  const r = metaSchema.safeParse(json);
  if (!r.success) return { fields: [], easeInch: null, diagram: null, copiedFromId: null };
  return { fields: r.data.fields, easeInch: r.data.easeInch ?? null, diagram: r.data.diagram ?? null, copiedFromId: r.data.copiedFromId ?? null };
}

/** The chart's rows: [{ size, values }] (also a plain { size: values } map, as the demo keeps it). */
export function readRows(json: Prisma.JsonValue): ChartRow[] {
  const ok = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
  if (Array.isArray(json)) {
    return json.flatMap((r) => (r && typeof r === 'object' && !Array.isArray(r) && typeof r.size === 'string' && ok(r.values) ? [{ size: r.size, values: r.values }] : []));
  }
  if (json && typeof json === 'object') return Object.entries(json).flatMap(([size, values]) => (ok(values) ? [{ size, values }] : []));
  return [];
}

const metaJson = (m: ChartMeta): Prisma.InputJsonValue => ({ fields: m.fields, easeInch: m.easeInch, diagram: m.diagram, copiedFromId: m.copiedFromId });
const rowsJson = (rows: ChartRow[]): Prisma.InputJsonValue => rows.map((r) => ({ size: r.size, values: r.values }));

const entry = (dict: Dictionary, key: string | null) => (key ? (dict.find((d) => d.key === key) ?? null) : null);

/** The product's fit key: `pdpBlocks.fitKey`, else its fit text ("Regular fit") matched against the fits dictionary. */
export function productFitKey(pdpBlocks: Prisma.JsonValue | null, fits: Dictionary): string | null {
  const b = pdpBlocks && typeof pdpBlocks === 'object' && !Array.isArray(pdpBlocks) ? (pdpBlocks as Record<string, unknown>) : {};
  if (typeof b.fitKey === 'string' && fits.some((f) => f.key === b.fitKey)) return b.fitKey;
  if (typeof b.fit !== 'string' || !b.fit.trim()) return null;
  const n = normalizeName(b.fit);
  return fits.find((f) => [f.key, f.en, f.bn].some((x) => normalizeName(x) === n))?.key ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------------------

export interface SizeChartField {
  key: string;
  labelEn: string;
  labelBn: string;
  unit: 'inch' | 'cm';
  /** How to measure it (setting `catalogue.sizeCharts.howToMeasure`), or null. */
  howTo: { en: string; bn: string } | null;
}

export interface SizeChartRowView {
  size: string;
  label: string;
  values: number[];
  inch: number[];
  cm: number[];
}

export interface SizeChartView {
  id: string;
  name: string;
  garmentType: { id: string; key: string; nameEn: string; nameBn: string };
  fitKey: string | null;
  fit: { key: string; en: string; bn: string } | null;
  fields: SizeChartField[];
  rows: SizeChartRowView[];
  easeInch: number;
  diagram: { key: string; en: string; bn: string } | null;
  copiedFromId: string | null;
  /** Categories this chart is the default of (for its fit). */
  defaultFor: { id: string; slug: string; nameEn: string; nameBn: string | null }[];
  /** Products that have this chart as their own (per-style override). */
  overrides: number;
  /** Products that show this chart now (own or through their category). */
  usedBy: number;
  archived: boolean;
  updatedAt: string;
}

export interface SizeChartProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  /** The sizes it sells (live variants), in the shop's order. */
  sizes: { key: string; label: string }[];
  via: 'product' | 'category';
}

export interface CoverageGap {
  size: string;
  label: string;
  products: { id: string; nameEn: string }[];
  /** A suggested row (neighbours and the chart's own step), to check before saving. */
  suggestion: number[];
}

export interface SizeChartDetail extends SizeChartView {
  products: SizeChartProduct[];
  coverage: CoverageGap[];
}

const chartInclude = {
  garmentType: { select: { id: true, key: true, nameEn: true, nameBn: true, measurementFields: true } },
} satisfies Prisma.SizeChartInclude;
type ChartRowDb = Prisma.SizeChartGetPayload<{ include: typeof chartInclude }>;

interface SizeInfo {
  key: string;
  label: string;
  sortOrder: number;
}

interface StoreCatalogueMap {
  sizes: Map<string, SizeInfo>;
  order: string[];
  charts: ChartRowDb[];
  assignments: { id: string; sizeChartId: string; categoryId: string | null; productId: string | null; createdAt: Date }[];
  categories: Map<string, { id: string; parentId: string | null; slug: string; nameEn: string; nameBn: string | null; archivedAt: Date | null }>;
  products: { id: string; slug: string; nameEn: string; nameBn: string | null; categoryId: string | null; pdpBlocks: Prisma.JsonValue | null; sizes: string[] }[];
}

async function storeMap(db: Db, storeId: number, opts: { products: boolean }): Promise<StoreCatalogueMap> {
  const [sizes, charts, assignments, categories, products] = await Promise.all([
    db.size.findMany({ where: { storeId }, select: { key: true, label: true, sortOrder: true, id: true } }),
    db.sizeChart.findMany({ where: { storeId }, include: chartInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    db.sizeChartAssignment.findMany({ where: { storeId, archivedAt: null }, select: { id: true, sizeChartId: true, categoryId: true, productId: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.category.findMany({ where: { storeId }, select: { id: true, parentId: true, slug: true, nameEn: true, nameBn: true, archivedAt: true } }),
    opts.products
      ? db.product.findMany({
          where: { storeId, archivedAt: null },
          select: { id: true, slug: true, nameEn: true, nameBn: true, categoryId: true, pdpBlocks: true, variants: { where: { archivedAt: null }, select: { size: { select: { key: true } } } } },
          orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
  ]);
  const sorted = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  return {
    sizes: new Map(sorted.map((s) => [s.key, { key: s.key, label: s.label, sortOrder: s.sortOrder }])),
    order: sorted.map((s) => s.key),
    charts,
    assignments,
    categories: new Map(categories.map((c) => [c.id, c])),
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      categoryId: p.categoryId,
      pdpBlocks: p.pdpBlocks,
      sizes: [...new Set(p.variants.flatMap((v) => (v.size ? [v.size.key] : [])))],
    })),
  };
}

export interface ChartChoice {
  chartId: string;
  via: 'product' | 'category';
  /** The category whose default it is (via category). */
  categoryId: string | null;
  /** How the category default was picked: the product's own fit, the fallback fit, or the only default there. */
  matched: 'product' | 'fit' | 'fallback' | 'any';
}

/** Which chart a product (or a new product in a category with a fit) gets. Pure, over the store map. */
function choose(m: StoreCatalogueMap, s: SizeChartSettings, productId: string | null, categoryId: string | null, fitKey: string | null): ChartChoice | null {
  const live = new Map(m.charts.filter((c) => !c.archivedAt).map((c) => [c.id, c]));
  if (productId) {
    const own = m.assignments.find((a) => a.productId === productId && live.has(a.sizeChartId));
    if (own) return { chartId: own.sizeChartId, via: 'product', categoryId: null, matched: 'product' };
  }
  const chain: string[] = [];
  for (let id = categoryId, guard = 0; id && guard < 64; guard++) {
    const c = m.categories.get(id);
    if (!c || c.archivedAt) break;
    chain.push(c.id);
    id = c.parentId;
  }
  const at = (cat: string) => m.assignments.filter((a) => a.categoryId === cat && live.has(a.sizeChartId));
  const pass = (want: string | null, matched: ChartChoice['matched']): ChartChoice | null => {
    for (const cat of chain) {
      const hit = at(cat).find((a) => want === null || live.get(a.sizeChartId)!.fitKey === want);
      if (hit) return { chartId: hit.sizeChartId, via: 'category', categoryId: cat, matched };
    }
    return null;
  };
  return (fitKey ? pass(fitKey, 'fit') : null) ?? (fitKey !== s.fallbackFit ? pass(s.fallbackFit, 'fallback') : null) ?? pass(null, 'any');
}

function fieldsOf(chart: ChartRowDb, meta: ChartMeta, s: SizeChartSettings): SizeChartField[] {
  const typeFields = (Array.isArray(chart.garmentType.measurementFields) ? chart.garmentType.measurementFields : []) as unknown as MeasurementField[];
  return meta.fields.map((key) => {
    const f = typeFields.find((t) => t.key === key);
    return { key, labelEn: f?.labelEn ?? key, labelBn: f?.labelBn ?? key, unit: f?.unit ?? 'inch', howTo: s.howTo[key] ?? null };
  });
}

function viewOf(chart: ChartRowDb, m: StoreCatalogueMap, s: SizeChartSettings, usedBy: number): SizeChartView {
  const meta = readMeta(chart.columns);
  const fields = fieldsOf(chart, meta, s);
  const rows = sortRows(readRows(chart.rows), m.order).map((r) => {
    const both = r.values.map((v, i) => bothUnits(v, fields[i]?.unit ?? 'inch', s.cmDecimals));
    return { size: r.size, label: m.sizes.get(r.size)?.label ?? r.size, values: r.values, inch: both.map((b) => b.inch), cm: both.map((b) => b.cm) };
  });
  const diagramKey = meta.diagram ?? s.diagramFor[chart.garmentType.key] ?? s.diagrams[0]?.key ?? null;
  const defaultFor = m.assignments
    .filter((a) => a.sizeChartId === chart.id && a.categoryId)
    .flatMap((a) => {
      const c = m.categories.get(a.categoryId!);
      return c && !c.archivedAt ? [{ id: c.id, slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn }] : [];
    });
  return {
    id: chart.id,
    name: chart.name,
    garmentType: { id: chart.garmentType.id, key: chart.garmentType.key, nameEn: chart.garmentType.nameEn, nameBn: chart.garmentType.nameBn },
    fitKey: chart.fitKey,
    fit: entry(s.fits, chart.fitKey),
    fields,
    rows,
    easeInch: meta.easeInch ?? s.defaultEaseInch,
    diagram: entry(s.diagrams, diagramKey),
    copiedFromId: meta.copiedFromId,
    defaultFor,
    overrides: m.assignments.filter((a) => a.sizeChartId === chart.id && a.productId).length,
    usedBy,
    archived: chart.archivedAt != null,
    updatedAt: chart.updatedAt.toISOString(),
  };
}

/** Every product's chart choice (the "Used by" counts and lists). */
function usage(m: StoreCatalogueMap, s: SizeChartSettings): Map<string, { product: StoreCatalogueMap['products'][number]; via: 'product' | 'category' }[]> {
  const out = new Map<string, { product: StoreCatalogueMap['products'][number]; via: 'product' | 'category' }[]>();
  for (const p of m.products) {
    const c = choose(m, s, p.id, p.categoryId, productFitKey(p.pdpBlocks, s.fits));
    if (c) out.set(c.chartId, [...(out.get(c.chartId) ?? []), { product: p, via: c.via }]);
  }
  return out;
}

export async function listSizeCharts(deps: CatalogueDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<SizeChartView[]> {
  await allow(deps, who, 'catalogue.read');
  const [s, m] = await Promise.all([sizeChartSettings(deps, who), storeMap(deps.db, who.storeId, { products: true })]);
  const used = usage(m, s);
  return m.charts.filter((c) => opts.includeArchived || !c.archivedAt).map((c) => viewOf(c, m, s, used.get(c.id)?.length ?? 0));
}

export async function getSizeChart(deps: CatalogueDeps, who: Who, id: string): Promise<SizeChartDetail> {
  await allow(deps, who, 'catalogue.read');
  const [s, m] = await Promise.all([sizeChartSettings(deps, who), storeMap(deps.db, who.storeId, { products: true })]);
  const chart = found(m.charts.find((c) => c.id === id), 'size chart');
  const users = usage(m, s).get(chart.id) ?? [];
  const v = viewOf(chart, m, s, users.length);
  const rows = readRows(chart.rows);
  const gaps = new Map<string, { id: string; nameEn: string }[]>();
  for (const u of users) for (const size of missingSizes(rows.map((r) => r.size), u.product.sizes)) gaps.set(size, [...(gaps.get(size) ?? []), { id: u.product.id, nameEn: u.product.nameEn }]);
  const sizeLabel = (k: string) => m.sizes.get(k)?.label ?? k;
  return {
    ...v,
    products: users.map((u) => ({
      id: u.product.id,
      slug: u.product.slug,
      nameEn: u.product.nameEn,
      nameBn: u.product.nameBn,
      sizes: m.order.filter((k) => u.product.sizes.includes(k)).map((k) => ({ key: k, label: sizeLabel(k) })),
      via: u.via,
    })),
    coverage: m.order
      .filter((k) => gaps.has(k))
      .concat([...gaps.keys()].filter((k) => !m.sizes.has(k)))
      .map((size) => ({ size, label: sizeLabel(size), products: gaps.get(size)!, suggestion: suggestRow(rows, m.order, size, s.stepInch) })),
  };
}

/** The screen's dictionaries and numbers: fits, drawings, how-to lines, the step and limits. */
export async function sizeChartOptions(deps: CatalogueDeps, who: Who): Promise<SizeChartSettings> {
  await allow(deps, who, 'catalogue.read');
  return sizeChartSettings(deps, who);
}

// ---------------------------------------------------------------------------------------------------------------
// Create, change, copy, archive
// ---------------------------------------------------------------------------------------------------------------

const rowInput = z.object({ size: dictionaryKeySchema, values: z.array(z.number().finite()).min(1).max(12) }).strict();
const name = z.string().trim().min(1).max(80);
export const sizeChartInput = z
  .object({
    name,
    garmentTypeId: z.uuid(),
    fitKey: dictionaryKeySchema,
    fields: z.array(measurementKeySchema).min(1).max(12).optional(),
    rows: z.array(rowInput).min(1),
    easeInch: z.number().min(0).optional(),
    diagram: dictionaryKeySchema.optional(),
  })
  .strict();
export const sizeChartPatch = z
  .object({
    name: name.optional(),
    fitKey: dictionaryKeySchema.optional(),
    fields: z.array(measurementKeySchema).min(1).max(12).optional(),
    rows: z.array(rowInput).min(1).optional(),
    easeInch: z.number().min(0).optional(),
    diagram: dictionaryKeySchema.optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export const sizeChartCopyInput = z.object({ name, fitKey: dictionaryKeySchema.optional(), productId: z.uuid().optional() }).strict();
export type SizeChartInput = z.input<typeof sizeChartInput>;
export type SizeChartPatch = z.input<typeof sizeChartPatch>;
export type SizeChartCopyInput = z.input<typeof sizeChartCopyInput>;

function assertDict(dict: Dictionary, key: string, field: string) {
  if (!dict.some((d) => d.key === key)) throw new CatalogueError('UNKNOWN_KEY', `not in the ${field} dictionary`, [`${field}: ${key}`]);
}

/** Checks fields against the garment type and every row against the shop's sizes and the limits. */
async function checkChart(tx: Tx, storeId: number, s: SizeChartSettings, typeFields: MeasurementField[], fields: string[], rows: ChartRow[]): Promise<ChartRow[]> {
  if (new Set(fields).size !== fields.length) throw new CatalogueError('INVALID_INPUT', 'a measurement is listed twice', ['fields']);
  const unknown = fields.filter((f) => !typeFields.some((t) => t.key === f));
  if (unknown.length) throw new CatalogueError('UNKNOWN_KEY', "not one of the garment type's measurements", unknown.map((f) => `fields: ${f}`));
  if (rows.length > s.maxRows) throw new CatalogueError('INVALID_INPUT', 'too many sizes in one chart', [`rows: ${rows.length} > ${s.maxRows}`]);
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.size)) throw new CatalogueError('INVALID_INPUT', 'a size is listed twice', [`rows: ${r.size}`]);
    seen.add(r.size);
  }
  const live = await tx.size.findMany({ where: { storeId, key: { in: [...seen] }, archivedAt: null }, select: { key: true } });
  const missing = [...seen].filter((k) => !live.some((l) => l.key === k));
  if (missing.length) throw new CatalogueError('UNKNOWN_KEY', 'not one of the shop\'s sizes', missing.map((k) => `rows: ${k}`));
  const bad: string[] = [];
  for (const r of rows) {
    if (r.values.length !== fields.length) bad.push(`rows.${r.size}: ${r.values.length} values for ${fields.length} measurements`);
    r.values.forEach((v, i) => {
      const unit = typeFields.find((t) => t.key === fields[i])?.unit ?? 'inch';
      const max = unit === 'cm' ? bothUnits(s.maxValueInch, 'inch', 2).cm : s.maxValueInch;
      if (!(v > 0) || v > max) bad.push(`rows.${r.size}.${fields[i] ?? i}: ${v}`);
    });
  }
  if (bad.length) throw new CatalogueError('INVALID_INPUT', 'every measurement must be filled, above 0 and below the largest measurement', bad);
  return rows;
}

async function garmentTypeOf(tx: Tx, storeId: number, id: string) {
  const g = found(await tx.garmentType.findFirst({ where: { id, storeId } }), 'garment type');
  if (g.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the garment type is archived', ['garmentTypeId']);
  return { ...g, fields: (Array.isArray(g.measurementFields) ? g.measurementFields : []) as unknown as MeasurementField[] };
}

async function assertNameFree(tx: Tx, storeId: number, chartName: string, exceptId?: string) {
  const twin = await tx.sizeChart.findFirst({ where: { storeId, archivedAt: null, name: { equals: chartName, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (twin) throw new CatalogueError('CONFLICT', 'a size chart with this name exists', ['name']);
}

const auditView = (c: { name: string; garmentTypeId: string; fitKey: string | null; columns: Prisma.JsonValue; rows: Prisma.JsonValue; archivedAt: Date | null }) => ({
  name: c.name,
  garmentTypeId: c.garmentTypeId,
  fitKey: c.fitKey,
  columns: c.columns,
  rows: c.rows,
  archivedAt: c.archivedAt,
});

export async function createSizeChart(deps: CatalogueDeps, who: Who, input: SizeChartInput): Promise<SizeChartDetail> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(sizeChartInput, input, 'size chart');
  const s = await sizeChartSettings(deps, who);
  assertDict(s.fits, d.fitKey, 'fit');
  if (d.diagram) assertDict(s.diagrams, d.diagram, 'drawing');
  if (d.easeInch !== undefined && d.easeInch > s.maxValueInch) throw new CatalogueError('INVALID_INPUT', 'the ease is above the largest measurement', ['easeInch']);
  const id = await deps.db.$transaction(async (tx) => {
    const g = await garmentTypeOf(tx, who.storeId, d.garmentTypeId);
    const fields = d.fields ?? g.fields.map((f) => f.key);
    if (!fields.length) throw new CatalogueError('INVALID_INPUT', 'the garment type has no measurements; add them first', ['garmentTypeId']);
    const rows = await checkChart(tx, who.storeId, s, g.fields, fields, d.rows);
    await assertNameFree(tx, who.storeId, d.name);
    const meta: ChartMeta = { fields, easeInch: d.easeInch ?? s.defaultEaseInch, diagram: d.diagram ?? s.diagramFor[g.key] ?? s.diagrams[0]?.key ?? null, copiedFromId: null };
    const row = await tx.sizeChart.create({ data: { storeId: who.storeId, garmentTypeId: g.id, name: d.name, fitKey: d.fitKey, columns: metaJson(meta), rows: rowsJson(rows) } });
    await logChange(tx, who, 'sizeChart.create', 'SizeChart', row.id, null, auditView(row));
    return row.id;
  }, TX);
  return getSizeChart(deps, who, id);
}

export async function updateSizeChart(deps: CatalogueDeps, who: Who, id: string, patch: SizeChartPatch): Promise<SizeChartDetail> {
  await allow(deps, who, 'catalogue.write');
  const { archived, ...d } = parse(sizeChartPatch, patch, 'size chart');
  const s = await sizeChartSettings(deps, who);
  if (d.fitKey) assertDict(s.fits, d.fitKey, 'fit');
  if (d.diagram) assertDict(s.diagrams, d.diagram, 'drawing');
  if (d.easeInch !== undefined && d.easeInch > s.maxValueInch) throw new CatalogueError('INVALID_INPUT', 'the ease is above the largest measurement', ['easeInch']);
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const cur = found(await tx.sizeChart.findFirst({ where: { id, storeId: who.storeId } }), 'size chart');
    const meta = readMeta(cur.columns);
    const g = await garmentTypeOf(tx, who.storeId, cur.garmentTypeId).catch((e: unknown) => {
      // An archived garment type only blocks changes to the chart's content; archiving or renaming still works.
      if (e instanceof CatalogueError && e.code === 'PARENT_ARCHIVED' && d.fields === undefined && d.rows === undefined) return null;
      throw e;
    });
    if (d.fields && !d.rows) throw new CatalogueError('INVALID_INPUT', 'send the rows with the new measurement list', ['rows']);
    const fields = d.fields ?? meta.fields;
    const rows = d.rows ? await checkChart(tx, who.storeId, s, g?.fields ?? [], fields, d.rows) : readRows(cur.rows);
    if (d.name !== undefined && d.name.toLowerCase() !== cur.name.toLowerCase()) await assertNameFree(tx, who.storeId, d.name, cur.id);
    if (archived === false && cur.archivedAt) await assertNameFree(tx, who.storeId, d.name ?? cur.name, cur.id);
    const assigned = await tx.sizeChartAssignment.findMany({ where: { storeId: who.storeId, sizeChartId: cur.id, archivedAt: null } });
    if (archived === true && !cur.archivedAt && assigned.length) {
      throw new CatalogueError('CHART_IN_USE', 'categories or products still use this chart; give them another first', [
        `categories: ${assigned.filter((a) => a.categoryId).length}`,
        `products: ${assigned.filter((a) => a.productId).length}`,
      ]);
    }
    if (d.fitKey && d.fitKey !== cur.fitKey) {
      // A category keeps one default per fit: the new fit must not already have a default where this chart is one.
      for (const a of assigned.filter((x) => x.categoryId)) {
        const twin = await tx.sizeChartAssignment.findFirst({ where: { storeId: who.storeId, categoryId: a.categoryId, archivedAt: null, sizeChartId: { not: cur.id }, sizeChart: { fitKey: d.fitKey, archivedAt: null } }, select: { id: true } });
        if (twin) throw new CatalogueError('CONFLICT', 'a category that uses this chart already has a default for that fit', [`categoryId: ${a.categoryId}`]);
      }
    }
    const nextMeta: ChartMeta = { ...meta, fields, easeInch: d.easeInch ?? meta.easeInch, diagram: d.diagram ?? meta.diagram };
    const next = {
      name: d.name ?? cur.name,
      fitKey: d.fitKey ?? cur.fitKey,
      columns: metaJson(nextMeta) as Prisma.JsonValue,
      rows: rowsJson(rows) as Prisma.JsonValue,
      archivedAt: archived === undefined ? cur.archivedAt : archived ? (cur.archivedAt ?? now) : null,
    };
    const diff = changed(cur as unknown as Record<string, unknown>, next);
    if (!Object.keys(diff.after).length) return;
    await tx.sizeChart.update({ where: { id: cur.id }, data: { ...next, columns: next.columns as Prisma.InputJsonValue, rows: next.rows as Prisma.InputJsonValue } });
    const action = archived === true && !cur.archivedAt ? 'sizeChart.archive' : archived === false && cur.archivedAt ? 'sizeChart.restore' : 'sizeChart.update';
    await logChange(tx, who, action, 'SizeChart', cur.id, diff.before, diff.after);
  }, TX);
  return getSizeChart(deps, who, id);
}

/**
 * "Copy for a style that fits differently" / "Make custom for this style": a new chart with the same garment type,
 * measurements, rows, ease and drawing; change only what differs. With `productId` the copy becomes that product's own
 * chart in the same step.
 */
export async function copySizeChart(deps: CatalogueDeps, who: Who, id: string, input: SizeChartCopyInput): Promise<SizeChartDetail> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(sizeChartCopyInput, input, 'size chart copy');
  const s = await sizeChartSettings(deps, who);
  if (d.fitKey) assertDict(s.fits, d.fitKey, 'fit');
  const newId = await deps.db.$transaction(async (tx) => {
    const src = found(await tx.sizeChart.findFirst({ where: { id, storeId: who.storeId } }), 'size chart');
    await garmentTypeOf(tx, who.storeId, src.garmentTypeId);
    await assertNameFree(tx, who.storeId, d.name);
    const meta = { ...readMeta(src.columns), copiedFromId: src.id };
    const row = await tx.sizeChart.create({ data: { storeId: who.storeId, garmentTypeId: src.garmentTypeId, name: d.name, fitKey: d.fitKey ?? src.fitKey, columns: metaJson(meta), rows: rowsJson(readRows(src.rows)) } });
    await logChange(tx, who, 'sizeChart.copy', 'SizeChart', row.id, { copiedFromId: src.id }, auditView(row));
    if (d.productId) await assignIn(tx, who, row.id, { productId: d.productId });
    return row.id;
  }, TX);
  return getSizeChart(deps, who, newId);
}

// ---------------------------------------------------------------------------------------------------------------
// Assign to categories and to single products (PR 28)
// ---------------------------------------------------------------------------------------------------------------

export const sizeChartAssignInput = z
  .object({ sizeChartId: z.uuid(), categoryId: z.uuid().optional(), productId: z.uuid().optional() })
  .strict()
  .refine((v) => Boolean(v.categoryId) !== Boolean(v.productId), { message: 'give a category or a product' });
export const sizeChartUnassignInput = z
  .object({ productId: z.uuid().optional(), categoryId: z.uuid().optional(), sizeChartId: z.uuid().optional() })
  .strict()
  .refine((v) => (v.productId && !v.categoryId) || (v.categoryId && v.sizeChartId && !v.productId), { message: 'a product, or a category with its chart' });
export type SizeChartAssignInput = z.input<typeof sizeChartAssignInput>;
export type SizeChartUnassignInput = z.input<typeof sizeChartUnassignInput>;

export interface AssignmentResult {
  assignmentId: string;
  sizeChartId: string;
  categoryId: string | null;
  productId: string | null;
  /** The chart it replaced, if any. */
  replacedChartId: string | null;
}

async function assignIn(tx: Tx, who: Who, sizeChartId: string, target: { categoryId?: string; productId?: string }): Promise<AssignmentResult> {
  const chart = found(await tx.sizeChart.findFirst({ where: { id: sizeChartId, storeId: who.storeId } }), 'size chart');
  if (chart.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the size chart is archived', ['sizeChartId']);
  let categoryForType: string | null;
  if (target.categoryId) {
    const c = found(await tx.category.findFirst({ where: { id: target.categoryId, storeId: who.storeId }, select: { id: true, archivedAt: true } }), 'category');
    if (c.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the category is archived', ['categoryId']);
    categoryForType = c.id;
  } else {
    const p = found(await tx.product.findFirst({ where: { id: target.productId, storeId: who.storeId }, select: { id: true, categoryId: true, archivedAt: true } }), 'product');
    if (p.archivedAt) throw new CatalogueError('PARENT_ARCHIVED', 'the product is archived', ['productId']);
    categoryForType = p.categoryId;
  }
  const gt = await effectiveGarmentTypeOf(tx, who.storeId, categoryForType);
  if (gt && gt.id !== chart.garmentTypeId) throw new CatalogueError('GARMENT_TYPE_MISMATCH', "the chart is for another garment type than the category's", [`garmentType: ${gt.key}`]);

  // One own chart per product; one default per fit per category. A live row is pointed at the new chart; with none, a
  // link archived by "back to auto" is brought back (nothing is deleted, hard rule 3); only then is a row made.
  const same = target.productId
    ? { storeId: who.storeId, productId: target.productId }
    : { storeId: who.storeId, categoryId: target.categoryId, productId: null, sizeChart: { fitKey: chart.fitKey } };
  const existing = await tx.sizeChartAssignment.findFirst({ where: { ...same, archivedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (existing?.sizeChartId === chart.id) return { assignmentId: existing.id, sizeChartId: chart.id, categoryId: existing.categoryId, productId: existing.productId, replacedChartId: null };
  const archived = existing ? null : await tx.sizeChartAssignment.findFirst({ where: { ...same, archivedAt: { not: null } }, orderBy: [{ archivedAt: 'desc' }, { id: 'asc' }] });
  const row = existing
    ? await tx.sizeChartAssignment.update({ where: { id: existing.id }, data: { sizeChartId: chart.id } })
    : archived
      ? await tx.sizeChartAssignment.update({ where: { id: archived.id }, data: { sizeChartId: chart.id, archivedAt: null } })
      : await tx.sizeChartAssignment.create({ data: { storeId: who.storeId, sizeChartId: chart.id, categoryId: target.categoryId ?? null, productId: target.productId ?? null } });
  const before = existing ? { sizeChartId: existing.sizeChartId } : archived ? { sizeChartId: archived.sizeChartId, archivedAt: archived.archivedAt } : null;
  await logChange(tx, who, archived ? 'sizeChart.reassign' : 'sizeChart.assign', 'SizeChartAssignment', row.id, before, { sizeChartId: chart.id, categoryId: row.categoryId, productId: row.productId, archivedAt: null });
  return { assignmentId: row.id, sizeChartId: chart.id, categoryId: row.categoryId, productId: row.productId, replacedChartId: existing?.sizeChartId ?? null };
}

/** Sets a chart as a category's default (for the chart's fit) or as one product's own chart. */
export async function assignSizeChart(deps: CatalogueDeps, who: Who, input: SizeChartAssignInput): Promise<AssignmentResult> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(sizeChartAssignInput, input, 'size chart assignment');
  return deps.db.$transaction((tx) => assignIn(tx, who, d.sizeChartId, { categoryId: d.categoryId, productId: d.productId }), TX);
}

/**
 * "Back to auto" for a product, or a category no longer defaulting to a chart. The link is archived, never deleted
 * (hard rule 3): the chart, the category and the product stay, every read ignores the archived link, and setting a
 * chart again brings the same row back. The audit log keeps who, when and which chart.
 */
export async function unassignSizeChart(deps: CatalogueDeps, who: Who, input: SizeChartUnassignInput): Promise<{ removed: number }> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(sizeChartUnassignInput, input, 'size chart assignment');
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const rows = await tx.sizeChartAssignment.findMany({
      where: d.productId ? { storeId: who.storeId, productId: d.productId, archivedAt: null } : { storeId: who.storeId, categoryId: d.categoryId, productId: null, sizeChartId: d.sizeChartId, archivedAt: null },
    });
    for (const r of rows) {
      await tx.sizeChartAssignment.update({ where: { id: r.id }, data: { archivedAt: now } });
      await logChange(tx, who, 'sizeChart.unassign', 'SizeChartAssignment', r.id, { sizeChartId: r.sizeChartId, categoryId: r.categoryId, productId: r.productId, archivedAt: null }, { archivedAt: now.toISOString() });
    }
    return { removed: rows.length };
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------
// Which chart (upload, product page, Find my size)
// ---------------------------------------------------------------------------------------------------------------

export const sizeChartResolveQuery = z
  .object({ productId: z.uuid().optional(), categoryId: z.uuid().optional(), fitKey: dictionaryKeySchema.optional() })
  .strict()
  .refine((v) => Boolean(v.productId) || Boolean(v.categoryId), { message: 'a product, or a category and fit' });
export type SizeChartResolveQuery = z.input<typeof sizeChartResolveQuery>;

export interface SizeChartResolution {
  chart: SizeChartView | null;
  choice: ChartChoice | null;
  /** The fit the choice used (the product's, or the one asked for). */
  fitKey: string | null;
}

/** PR 59 — one product with the chart it shows, that chart's garment type, fit and ease (the training engine's input). */
export interface ProductChartChoice {
  productId: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  /** The chart the product's page shows, or null when it has none (then it is not trained on). */
  chartId: string | null;
  chartName: string | null;
  garmentTypeId: string | null;
  garmentTypeKey: string | null;
  garmentTypeNameEn: string | null;
  /** The chart's fit (null: the chart is for every fit of that garment type). */
  fitKey: string | null;
  /** The room that chart leaves over the body, inches (the chart's own, else `catalogue.sizeCharts.defaultEaseInch`). */
  easeInch: number | null;
  /** How the chart was reached: the product's own chart or its category's default. */
  via: 'product' | 'category' | null;
}

/**
 * PR 59 — every product of the store with the chart it shows. One pass over the store's charts, assignments, category
 * tree and products, with the same `choose` the product page and the chart admin use, so the size report speaks of the
 * chart the customer really saw. The shop's size order comes back with it (the engine compares sizes by their place).
 */
export async function productChartChoices(deps: CatalogueDeps, who: Who): Promise<{ products: ProductChartChoice[]; sizeOrder: string[]; sizeLabels: Map<string, string> }> {
  await allow(deps, who, 'catalogue.read');
  const [s, m] = await Promise.all([sizeChartSettings(deps, who), storeMap(deps.db, who.storeId, { products: true })]);
  const products = m.products.map((p) => {
    const choice = choose(m, s, p.id, p.categoryId, productFitKey(p.pdpBlocks, s.fits));
    const chart = choice ? (m.charts.find((c) => c.id === choice.chartId) ?? null) : null;
    const meta = chart ? readMeta(chart.columns) : null;
    return {
      productId: p.id,
      slug: p.slug,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      chartId: chart?.id ?? null,
      chartName: chart?.name ?? null,
      garmentTypeId: chart?.garmentType.id ?? null,
      garmentTypeKey: chart?.garmentType.key ?? null,
      garmentTypeNameEn: chart?.garmentType.nameEn ?? null,
      fitKey: chart?.fitKey ?? null,
      easeInch: chart ? (meta?.easeInch ?? s.defaultEaseInch) : null,
      via: choice?.via ?? null,
    };
  });
  return { products, sizeOrder: m.order, sizeLabels: new Map([...m.sizes].map(([k, v]) => [k, v.label])) };
}

/** The chart a product shows, or a new product in a category with a fit gets ("When you add a product"). */
export async function resolveSizeChart(deps: CatalogueDeps, who: Who, query: SizeChartResolveQuery): Promise<SizeChartResolution> {
  await allow(deps, who, 'catalogue.read');
  const q = parse(sizeChartResolveQuery, query, 'size chart query');
  const [s, m] = await Promise.all([sizeChartSettings(deps, who), storeMap(deps.db, who.storeId, { products: false })]);
  let categoryId = q.categoryId ?? null;
  let fitKey = q.fitKey ?? null;
  if (q.productId) {
    const p = found(await deps.db.product.findFirst({ where: { id: q.productId, storeId: who.storeId }, select: { categoryId: true, pdpBlocks: true } }), 'product');
    categoryId = q.categoryId ?? p.categoryId;
    fitKey = q.fitKey ?? productFitKey(p.pdpBlocks, s.fits);
  }
  if (fitKey) assertDict(s.fits, fitKey, 'fit');
  const choice = choose(m, s, q.productId ?? null, categoryId, fitKey);
  const chart = choice ? m.charts.find((c) => c.id === choice.chartId)! : null;
  return { chart: chart ? viewOf(chart, m, s, 0) : null, choice, fitKey };
}
