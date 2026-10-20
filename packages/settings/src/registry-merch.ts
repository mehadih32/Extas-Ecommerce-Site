// S01 · PR 27, 28, 32, 34, 38 — size charts, collections and tags, the catalogue CSV, and the "was" price (Bhandari).
// Every list, limit, default and dictionary of these lives here, never in code. Labels: messages/merch.<lang>.json.
// Registry version 7.
//
// The "was" price source is the owner's decision (Blueprint D1.7 honesty rule, D10 table "Off unless chosen", App. B
// #71): it ships with no value, so no struck-through price shows anywhere until he chooses one.
import { z } from 'zod';
import { setting } from './define';
import { messages, pair } from './messages';
import { dictionaryKeySchema, dictionarySchema, localizedTextSchema, pathPrefixSchema, type Dictionary } from './schemas';

const V = 7;

/** A dictionary's shipped default from `defaults.<path>` in the messages files (file order, both languages). */
function dictionaryFrom(path: string): Dictionary {
  let node: unknown = messages.en;
  for (const part of path.split('.')) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  if (!node || typeof node !== 'object') throw new Error(`settings messages have no dictionary at "${path}"`);
  return Object.keys(node).map((key) => ({ key, ...pair(messages, `${path}.${key}`) }));
}

/** A measurement column's key, the same form as a garment type's measurement field (`chest`, `legOpening`). */
export const measurementKeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, { message: 'a measurement key such as chest or legOpening' });

/** How each measurement is taken, in both languages (shown under the size chart; D3.8: only the chart's own fields). */
export const howToMeasureSchema = z.record(measurementKeySchema, localizedTextSchema(200));

function howToDefault(): z.output<typeof howToMeasureSchema> {
  const node = (messages.en.defaults as Record<string, unknown> | undefined)?.catalogue as Record<string, unknown> | undefined;
  const keys = Object.keys((node?.howToMeasure as Record<string, unknown> | undefined) ?? {});
  if (!keys.length) throw new Error('settings messages have no defaults.catalogue.howToMeasure');
  return Object.fromEntries(keys.map((k) => [k, pair(messages, `defaults.catalogue.howToMeasure.${k}`)]));
}

/** The columns a catalogue CSV can have (PR 34). Cost prices and anything of the owner's are never among them. */
export const CSV_COLUMNS = [
  'product',
  'sku',
  'nameEn',
  'nameBn',
  'category',
  'brand',
  'styleCode',
  'colour',
  'size',
  'barcode',
  'price',
  'compareAt',
  'weightGrams',
  'active',
  'tags',
  'collections',
  'descriptionEn',
  'descriptionBn',
  'careEn',
  'careBn',
  'status',
] as const;
export const csvColumnSchema = z.enum(CSV_COLUMNS);
export type CsvColumn = z.output<typeof csvColumnSchema>;

export const csvColumnsSchema = z
  .array(csvColumnSchema)
  .min(2)
  .refine((l) => new Set(l).size === l.length, { message: 'a column is listed twice' })
  .refine((l) => l.includes('product') && l.includes('sku'), { message: 'product and sku are the keys: they always stay' });

/** The "was" price sources (schema enum WasPriceSource without NONE: "none" is simply no source). */
export const wasPriceSourceSchema = z.enum(['NONE', 'MRP', 'PRICE_HISTORY', 'COMBO', 'LAUNCH_PRICE']);

export const merchSettings = {
  // ---- PR 27, 28 · size charts: one chart per garment type and fit; inches typed once, cm worked out. ----
  'catalogue.fits': setting({
    schema: dictionarySchema.refine((d) => d.length >= 1, { message: 'at least one fit' }),
    default: dictionaryFrom('defaults.catalogue.fits'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.fits.label',
    helpKey: 'catalogue.fits.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 200,
    version: V,
  }),
  'catalogue.sizeCharts.fallbackFit': setting({
    schema: dictionaryKeySchema,
    default: 'regular',
    scope: 'store',
    valueType: 'STRING',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.fallbackFit.label',
    helpKey: 'catalogue.sizeCharts.fallbackFit.help',
    isOwnerData: false,
    sortOrder: 210,
    version: V,
  }),
  'catalogue.sizeCharts.diagrams': setting({
    schema: dictionarySchema.refine((d) => d.length >= 1, { message: 'at least one drawing' }),
    default: dictionaryFrom('defaults.catalogue.sizeChartDiagrams'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.diagrams.label',
    helpKey: 'catalogue.sizeCharts.diagrams.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 220,
    version: V,
  }),
  'catalogue.sizeCharts.diagramFor': setting({
    schema: z.record(dictionaryKeySchema, dictionaryKeySchema),
    default: { trouser: 'bottom' },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.diagramFor.label',
    helpKey: 'catalogue.sizeCharts.diagramFor.help',
    isOwnerData: false,
    sortOrder: 230,
    version: V,
  }),
  'catalogue.sizeCharts.howToMeasure': setting({
    schema: howToMeasureSchema,
    default: howToDefault(),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.howToMeasure.label',
    helpKey: 'catalogue.sizeCharts.howToMeasure.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 240,
    version: V,
  }),
  'catalogue.sizeCharts.defaultEaseInch': setting({
    schema: z.number().min(0).max(20),
    default: 4,
    scope: 'store',
    valueType: 'DECIMAL',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.defaultEaseInch.label',
    helpKey: 'catalogue.sizeCharts.defaultEaseInch.help',
    isOwnerData: false,
    sortOrder: 250,
    version: V,
  }),
  'catalogue.sizeCharts.valueStepInch': setting({
    schema: z.number().min(0.01).max(2),
    default: 0.25,
    scope: 'store',
    valueType: 'DECIMAL',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.valueStepInch.label',
    helpKey: 'catalogue.sizeCharts.valueStepInch.help',
    isOwnerData: false,
    sortOrder: 260,
    version: V,
  }),
  'catalogue.sizeCharts.maxValueInch': setting({
    schema: z.int().min(10).max(400),
    default: 120,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.maxValueInch.label',
    helpKey: 'catalogue.sizeCharts.maxValueInch.help',
    isOwnerData: false,
    sortOrder: 270,
    version: V,
  }),
  'catalogue.sizeCharts.maxRows': setting({
    schema: z.int().min(1).max(200),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.maxRows.label',
    helpKey: 'catalogue.sizeCharts.maxRows.help',
    isOwnerData: false,
    sortOrder: 280,
    version: V,
  }),
  'catalogue.sizeCharts.cmDecimals': setting({
    schema: z.int().min(0).max(2),
    default: 0,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.sizeCharts.cmDecimals.label',
    helpKey: 'catalogue.sizeCharts.cmDecimals.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 290,
    version: V,
  }),

  // ---- PR 32 · collections and tags. Seasonal pages are permanent: live and ended are states, never deletion. ----
  'catalogue.collections.seasons': setting({
    schema: dictionarySchema,
    default: dictionaryFrom('defaults.catalogue.seasons'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.collections.seasons.label',
    helpKey: 'catalogue.collections.seasons.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 300,
    version: V,
  }),
  'catalogue.collections.pathPrefix': setting({
    schema: pathPrefixSchema,
    default: '/collections',
    scope: 'store',
    valueType: 'STRING',
    group: 'catalogue',
    labelKey: 'catalogue.collections.pathPrefix.label',
    helpKey: 'catalogue.collections.pathPrefix.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 310,
    version: V,
  }),
  'catalogue.collections.maxProducts': setting({
    schema: z.int().min(1).max(10_000),
    default: 500,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.collections.maxProducts.label',
    helpKey: 'catalogue.collections.maxProducts.help',
    isOwnerData: false,
    sortOrder: 320,
    version: V,
  }),
  'catalogue.tags.maxPerProduct': setting({
    schema: z.int().min(1).max(200),
    default: 20,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.tags.maxPerProduct.label',
    helpKey: 'catalogue.tags.maxPerProduct.help',
    isOwnerData: false,
    sortOrder: 330,
    version: V,
  }),

  // ---- PR 34 · the catalogue CSV: preview first, row by row; an import never removes anything. ----
  'catalogue.csv.columns': setting({
    schema: csvColumnsSchema,
    default: [...CSV_COLUMNS],
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.csv.columns.label',
    helpKey: 'catalogue.csv.columns.help',
    isOwnerData: false,
    sortOrder: 400,
    version: V,
  }),
  'catalogue.csv.maxRows': setting({
    schema: z.int().min(1).max(100_000),
    default: 5000,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.csv.maxRows.label',
    helpKey: 'catalogue.csv.maxRows.help',
    isOwnerData: false,
    sortOrder: 410,
    version: V,
  }),
  'catalogue.csv.maxBytes': setting({
    schema: z.int().min(1024).max(50_000_000),
    default: 5_000_000,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.csv.maxBytes.label',
    helpKey: 'catalogue.csv.maxBytes.help',
    isOwnerData: false,
    sortOrder: 420,
    version: V,
  }),
  'catalogue.csv.delimiter': setting({
    schema: z.enum([',', ';', '\t']),
    default: ',',
    scope: 'store',
    valueType: 'ENUM',
    group: 'catalogue',
    labelKey: 'catalogue.csv.delimiter.label',
    helpKey: 'catalogue.csv.delimiter.help',
    isOwnerData: false,
    sortOrder: 430,
    version: V,
  }),
  'catalogue.csv.listSeparator': setting({
    schema: z.enum(['|', ';', '/']),
    default: '|',
    scope: 'store',
    valueType: 'ENUM',
    group: 'catalogue',
    labelKey: 'catalogue.csv.listSeparator.label',
    helpKey: 'catalogue.csv.listSeparator.help',
    isOwnerData: false,
    sortOrder: 440,
    version: V,
  }),
  'catalogue.csv.maxRowReports': setting({
    schema: z.int().min(10).max(100_000),
    default: 500,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.csv.maxRowReports.label',
    helpKey: 'catalogue.csv.maxRowReports.help',
    isOwnerData: false,
    sortOrder: 450,
    version: V,
  }),

  // ---- PR 38 · the "was" price: only from something real (D1.7). ----
  'catalogue.wasPrice.defaultSource': setting({
    schema: wasPriceSourceSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'ENUM',
    group: 'catalogue',
    labelKey: 'catalogue.wasPrice.defaultSource.label',
    helpKey: 'catalogue.wasPrice.defaultSource.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 500,
    version: V,
  }),
  'catalogue.wasPrice.historyDays': setting({
    schema: z.int().min(7).max(365),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.wasPrice.historyDays.label',
    helpKey: 'catalogue.wasPrice.historyDays.help',
    isOwnerData: false,
    sortOrder: 510,
    version: V,
  }),
  'catalogue.wasPrice.mrpOwnLabel': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'catalogue',
    labelKey: 'catalogue.wasPrice.mrpOwnLabel.label',
    helpKey: 'catalogue.wasPrice.mrpOwnLabel.help',
    isOwnerData: false,
    sortOrder: 520,
    version: V,
  }),
};
