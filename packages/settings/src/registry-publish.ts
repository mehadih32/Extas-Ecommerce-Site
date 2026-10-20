// PR 21, 26, 29, 35 — the product admin, the upload-time validation block, the health score and the publish queue
// (Blueprint B7.4: "a publish checklist blocks a half-done product"). Which checks block a publish, which only remind,
// how much each counts towards the health score, the score bands and the admin list sizes live here, never in code.
// Labels: messages/publish.<lang>.json. Registry version 8.
import { z } from 'zod';
import { setting } from './define';
import { tokensOf } from './schemas';

/**
 * The checks a product goes through before it may go live (the order is the order on screen).
 * `sellableStock` (PR 204, registry v11): stock in a location the shop sells from, read from the ERP's stock mirror.
 */
export const PUBLISH_CHECK_KEYS = ['category', 'variants', 'price', 'photos', 'sizeChart', 'fabric', 'seo', 'description', 'stock', 'sellableStock'] as const;
export type PublishCheckKey = (typeof PUBLISH_CHECK_KEYS)[number];

/** block = the product cannot be published until it passes; warn = shown as a reminder only; off = not checked. */
export const publishCheckLevelSchema = z.enum(['block', 'warn', 'off']);
export type PublishCheckLevel = z.output<typeof publishCheckLevelSchema>;

/**
 * Checks added after a store may already have saved its own checklist: a saved value without them still reads, with
 * the check off and its default weight (nothing changes for that store until someone switches the check on).
 */
const ADDED_LATER: Partial<Record<PublishCheckKey, { level: PublishCheckLevel; weight: number }>> = { sellableStock: { level: 'off', weight: 5 } };

const perCheck = <T extends z.ZodType>(value: T, later: (k: PublishCheckKey) => z.ZodType | null) =>
  z.object(Object.fromEntries(PUBLISH_CHECK_KEYS.map((k) => [k, later(k) ?? value])) as Record<PublishCheckKey, T>).strict();

export const publishChecksSchema = perCheck(publishCheckLevelSchema, (k) => (ADDED_LATER[k] ? publishCheckLevelSchema.default(ADDED_LATER[k].level) : null));
export const healthWeightsSchema = perCheck(z.int().min(0).max(100), (k) => (ADDED_LATER[k] ? z.int().min(0).max(100).default(ADDED_LATER[k].weight) : null)).refine(
  (w) => Object.values(w).some((v) => v > 0),
  { message: 'at least one check must count' },
);
export const healthBandsSchema = z
  .object({ good: z.int().min(0).max(100), fair: z.int().min(0).max(100) })
  .strict()
  .refine((b) => b.good >= b.fair, { message: 'the "good" score must be at least the "fair" score' });

/** Tokens the suggested SKU may use (PR 21): the ERP style code, the colour's and the size's ERP code or key. */
export const SKU_SUGGESTION_TOKENS = ['style', 'colour', 'size'] as const;
export const skuSuggestionSchema = z
  .string()
  .trim()
  .max(120)
  .refine((v) => tokensOf(v).every((t) => (SKU_SUGGESTION_TOKENS as readonly string[]).includes(t)), { message: `only these {tokens} may be used: ${SKU_SUGGESTION_TOKENS.join(', ')}` });

export const publishSettings = {
  'catalogue.publish.checks': setting({
    schema: publishChecksSchema,
    // v11 (PR 204): `sellableStock` added, off until the owner switches it on (the `stock` check already reminds).
    default: { category: 'block', variants: 'block', price: 'block', photos: 'block', sizeChart: 'block', fabric: 'block', seo: 'block', description: 'warn', stock: 'warn', sellableStock: 'off' },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.publish.checks.label',
    helpKey: 'catalogue.publish.checks.help',
    isOwnerData: false,
    sortOrder: 200,
    version: 11,
  }),
  'catalogue.health.weights': setting({
    schema: healthWeightsSchema,
    default: { category: 10, variants: 10, price: 15, photos: 20, sizeChart: 15, fabric: 10, seo: 10, description: 5, stock: 5, sellableStock: 5 }, // hardcode-ok: registry default
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.health.weights.label',
    helpKey: 'catalogue.health.weights.help',
    isOwnerData: false,
    sortOrder: 210,
    version: 11,
  }),
  'catalogue.health.bands': setting({
    schema: healthBandsSchema,
    default: { good: 100, fair: 60 },
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.health.bands.label',
    helpKey: 'catalogue.health.bands.help',
    isOwnerData: false,
    sortOrder: 220,
    version: 8,
  }),
  'catalogue.bulk.maxProducts': setting({
    schema: z.int().min(1).max(1000),
    default: 200,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.bulk.maxProducts.label',
    helpKey: 'catalogue.bulk.maxProducts.help',
    isOwnerData: false,
    sortOrder: 230,
    version: 8,
  }),
  'catalogue.admin.pageSize': setting({
    schema: z.int().min(10).max(200),
    default: 50,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.admin.pageSize.label',
    helpKey: 'catalogue.admin.pageSize.help',
    isOwnerData: false,
    sortOrder: 240,
    version: 8,
  }),
  'catalogue.admin.lowStockPieces': setting({
    schema: z.int().min(0).max(1000),
    default: 2,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.admin.lowStockPieces.label',
    helpKey: 'catalogue.admin.lowStockPieces.help',
    isOwnerData: false,
    sortOrder: 250,
    version: 8,
  }),
  'catalogue.admin.issuesShown': setting({
    schema: z.int().min(0).max(9),
    default: 2,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.admin.issuesShown.label',
    helpKey: 'catalogue.admin.issuesShown.help',
    isOwnerData: false,
    sortOrder: 260,
    version: 8,
  }),
  'catalogue.skuSuggestion': setting({
    schema: skuSuggestionSchema,
    default: '{style}-{colour}-{size}',
    scope: 'store',
    valueType: 'STRING',
    group: 'catalogue',
    labelKey: 'catalogue.skuSuggestion.label',
    helpKey: 'catalogue.skuSuggestion.help',
    isOwnerData: false,
    sortOrder: 270,
    version: 8,
  }),
};
