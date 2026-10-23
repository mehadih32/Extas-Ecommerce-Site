// S09 · PR 194, 195, 196, 201, 497, 498, 499 — the ERP sync and the stock locations (Blueprint A3, A4.4; ERP ↔ shop
// API contract, CN-005). How long the shop waits for the ERP, how often and how hard it tries again, how big a page
// is, how often stock is polled, which ERP mode a store starts in, which stock locations every warehouse gets (the
// damaged bin among them) and which kinds of location the shop may sell from — all here, never in code.
// Labels: messages/inventory.<lang>.json. Registry version 10.
//
// Version 11 (PR 197–200, 202–207): the cart and checkout hold on the one shared stock pool (how long it lasts, when an
// idle cart lets go, how long an order's hold keeps counting until the ERP has it), the document pushes to the ERP
// (tries and pauses), low-stock alerts (thresholds per variant), the stock audit's reasons and limits, the publishing
// queue's stock rules, the movement report and the ERP reconciliation, and the sync health panel.
//
// Version 22 (PR 196): the ERP → shop webhooks — on or off, the dedupe window, the largest body, the worker batch.
//
// The ERP's address, key and webhook secret are not settings: the address is on the connection row and the key and
// secret are in the vault (PR 493, 500). A store's company and warehouse mapping is the owner's data (StoreErpMapping,
// Store.erpCompanyId — PR 509), not a setting either.
import { z } from 'zod';
import { setting } from './define';
import { dictionarySchema } from './schemas';

const V = 10;
const V11 = 11;
const V22 = 22;

/** A variant's ERP SKU as a settings key. */
const skuKeySchema = z.string().trim().min(1).max(64);

/** Low-stock thresholds for single variants, by ERP SKU (PR 202). */
export const skuThresholdsSchema = z
  .record(skuKeySchema, z.int().min(0).max(100_000))
  .refine((r) => Object.keys(r).length <= 5000, { message: 'at most 5000 variants' });

/** Why a counted quantity differs from the ERP's (PR 203): a stable key and its text in both admin languages. */
export const auditReasonsSchema = dictionarySchema.refine((d) => d.length >= 1, { message: 'at least one reason' });

/** Where a store's stock and orders come from (PR 497). */
export const ERP_MODES = ['EXTAS_ERP', 'OTHER_ERP', 'NONE'] as const;
export const erpModeSchema = z.enum(ERP_MODES);
export type ErpModeName = z.output<typeof erpModeSchema>;

/** Kinds of stock location (the schema's LocationKind). */
export const LOCATION_KINDS = ['WAREHOUSE', 'SHOWROOM', 'IN_TRANSIT', 'DAMAGED'] as const;
export const locationKindSchema = z.enum(LOCATION_KINDS);
export type LocationKindName = z.output<typeof locationKindSchema>;

/** A location code: short, lower-case, digits and dashes; unique inside its warehouse. */
export const locationCodeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, { message: 'a short code: lower-case letters, digits and dashes' });

/** The locations every new warehouse gets (PR 201). */
export const defaultLocationsSchema = z
  .array(z.object({ code: locationCodeSchema, kind: locationKindSchema, name: z.string().trim().min(1).max(80) }).strict())
  .min(1)
  .max(20)
  .refine((a) => new Set(a.map((l) => l.code)).size === a.length, { message: 'every location needs its own code' });

/** Kinds the shop may sell from. Damaged stock is never sellable (PR 201, B03). */
export const sellableKindsSchema = z
  .array(locationKindSchema)
  .min(1)
  .refine((a) => !a.includes('DAMAGED'), { message: 'the damaged bin is never sellable' })
  .refine((a) => new Set(a).size === a.length, { message: 'a kind is listed twice' });

export const inventorySettings = {
  // ---- PR 497 · the ERP mode switch ----
  'erp.defaultMode': setting({
    schema: erpModeSchema,
    // The owner's decision (18 Oct, CN-005): the shop works with its own ERP; until the address and keys are entered the
    // adapter runs on the practice ERP, which holds no stock and so never changes the shop's stock.
    default: 'EXTAS_ERP',
    scope: 'store',
    valueType: 'ENUM',
    group: 'erp',
    labelKey: 'erp.defaultMode.label',
    helpKey: 'erp.defaultMode.help',
    isOwnerData: false,
    sortOrder: 10,
    version: V,
  }),
  // ---- PR 194 · the sync adapter: timeouts, retries with backoff ----
  'erp.sync.requestTimeoutSeconds': setting({
    schema: z.int().min(1).max(120),
    default: 20,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.requestTimeoutSeconds.label',
    helpKey: 'erp.sync.requestTimeoutSeconds.help',
    isOwnerData: false,
    sortOrder: 20,
    version: V,
  }),
  'erp.sync.maxAttempts': setting({
    schema: z.int().min(1).max(10),
    default: 4,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.maxAttempts.label',
    helpKey: 'erp.sync.maxAttempts.help',
    isOwnerData: false,
    sortOrder: 30,
    version: V,
  }),
  'erp.sync.backoffBaseMs': setting({
    schema: z.int().min(0).max(60_000),
    default: 1000,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.backoffBaseMs.label',
    helpKey: 'erp.sync.backoffBaseMs.help',
    isOwnerData: false,
    sortOrder: 40,
    version: V,
  }),
  'erp.sync.backoffMaxMs': setting({
    schema: z.int().min(0).max(600_000),
    default: 30_000,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.backoffMaxMs.label',
    helpKey: 'erp.sync.backoffMaxMs.help',
    isOwnerData: false,
    sortOrder: 50,
    version: V,
  }),
  'erp.sync.backoffJitter': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'erp',
    labelKey: 'erp.sync.backoffJitter.label',
    helpKey: 'erp.sync.backoffJitter.help',
    isOwnerData: false,
    sortOrder: 60,
    version: V,
  }),
  // ---- PR 195 · the stock pull ----
  'erp.sync.pageSize': setting({
    schema: z.int().min(1).max(1000),
    default: 200,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.pageSize.label',
    helpKey: 'erp.sync.pageSize.help',
    isOwnerData: false,
    sortOrder: 70,
    version: V,
  }),
  'erp.sync.maxPagesPerRun': setting({
    schema: z.int().min(1).max(100_000),
    default: 500,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.maxPagesPerRun.label',
    helpKey: 'erp.sync.maxPagesPerRun.help',
    isOwnerData: false,
    sortOrder: 80,
    version: V,
  }),
  'erp.sync.stockPollMinutes': setting({
    schema: z.int().min(1).max(1440),
    // Contract: "the shop polls updatedSince every few minutes, so a missed webhook never leaves stock wrong".
    default: 5,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.stockPollMinutes.label',
    helpKey: 'erp.sync.stockPollMinutes.help',
    isOwnerData: false,
    sortOrder: 90,
    version: V,
  }),
  'erp.sync.updatedSinceOverlapSeconds': setting({
    schema: z.int().min(0).max(86_400),
    default: 120,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.sync.updatedSinceOverlapSeconds.label',
    helpKey: 'erp.sync.updatedSinceOverlapSeconds.help',
    isOwnerData: false,
    sortOrder: 100,
    version: V,
  }),
  'erp.webhook.maxAgeSeconds': setting({
    schema: z.int().min(30).max(3600),
    // Contract: requests older than 5 minutes are rejected.
    default: 300,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.webhook.maxAgeSeconds.label',
    helpKey: 'erp.webhook.maxAgeSeconds.help',
    isOwnerData: false,
    sortOrder: 110,
    version: V,
  }),
  // ---- PR 196 (version 22) · the ERP → shop webhooks (stock.changed, variant.changed). The secret is in the vault;
  // without it every webhook is refused, and the stock poll stays the fallback either way. ----
  'erp.webhook.enabled': setting({
    schema: z.boolean(),
    // On: with no webhook secret in the vault nothing gets in anyway; off refuses every webhook (the poll still runs).
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'erp',
    labelKey: 'erp.webhook.enabled.label',
    helpKey: 'erp.webhook.enabled.help',
    isOwnerData: false,
    sortOrder: 111,
    version: V22,
  }),
  'erp.webhook.dedupeHours': setting({
    schema: z.int().min(1).max(720),
    // The ERP retries an event for up to 24 h (contract); an event id seen again inside this window is the same event.
    default: 72,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.webhook.dedupeHours.label',
    helpKey: 'erp.webhook.dedupeHours.help',
    isOwnerData: false,
    sortOrder: 112,
    version: V22,
  }),
  'erp.webhook.maxBodyKb': setting({
    schema: z.int().min(1).max(1024),
    // One event is one row of stock or one variant: a few hundred bytes.
    default: 64,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.webhook.maxBodyKb.label',
    helpKey: 'erp.webhook.maxBodyKb.help',
    isOwnerData: false,
    sortOrder: 113,
    version: V22,
  }),
  'erp.webhook.batchSize': setting({
    schema: z.int().min(1).max(1000),
    // How many waiting events the background worker's scheduler puts on the queue per tick (PR 6).
    default: 100,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.webhook.batchSize.label',
    helpKey: 'erp.webhook.batchSize.help',
    isOwnerData: false,
    sortOrder: 114,
    version: V22,
  }),
  // ---- PR 195, 499 · the checkout's live stock check: one quick try, then the shop's own copy ----
  'erp.liveCheck.timeoutSeconds': setting({
    schema: z.int().min(1).max(30),
    default: 3,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.liveCheck.timeoutSeconds.label',
    helpKey: 'erp.liveCheck.timeoutSeconds.help',
    isOwnerData: false,
    sortOrder: 115,
    version: V,
  }),
  // ---- PR 499 · the practice ERP's stock is used only when someone switches it on (tests, a demo) ----
  'erp.mock.stockEnabled': setting({
    schema: z.boolean(),
    default: false,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'erp',
    labelKey: 'erp.mock.stockEnabled.label',
    helpKey: 'erp.mock.stockEnabled.help',
    isOwnerData: false,
    sortOrder: 120,
    version: V,
  }),
  // ---- PR 201 · stock locations, the damaged bin ----
  'inventory.locations.defaults': setting({
    schema: defaultLocationsSchema,
    default: [
      { code: 'main', kind: 'WAREHOUSE', name: 'Main stock' },
      { code: 'damaged', kind: 'DAMAGED', name: 'Damaged bin' },
    ],
    scope: 'installation',
    valueType: 'JSON',
    group: 'inventory',
    labelKey: 'inventory.locations.defaults.label',
    helpKey: 'inventory.locations.defaults.help',
    isOwnerData: false,
    sortOrder: 10,
    version: V,
  }),
  'inventory.locations.requireDamagedBin': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'inventory',
    labelKey: 'inventory.locations.requireDamagedBin.label',
    helpKey: 'inventory.locations.requireDamagedBin.help',
    isOwnerData: false,
    sortOrder: 20,
    version: V,
  }),
  'inventory.sellableLocationKinds': setting({
    schema: sellableKindsSchema,
    default: ['WAREHOUSE'],
    scope: 'installation',
    valueType: 'JSON',
    group: 'inventory',
    labelKey: 'inventory.sellableLocationKinds.label',
    helpKey: 'inventory.sellableLocationKinds.help',
    isOwnerData: false,
    sortOrder: 30,
    version: V,
  }),
  // ---- PR 195, 196 · where the ERP's stock numbers land in each mapped warehouse ----
  'inventory.erp.stockLocationCode': setting({
    schema: locationCodeSchema,
    default: 'main',
    scope: 'installation',
    valueType: 'STRING',
    group: 'inventory',
    labelKey: 'inventory.erp.stockLocationCode.label',
    helpKey: 'inventory.erp.stockLocationCode.help',
    isOwnerData: false,
    sortOrder: 40,
    version: V,
  }),
  // =====================================================================================================================
  // Version 11 — PR 197–200, 202–207
  // =====================================================================================================================

  // ---- PR 197, 198 · the hold on the shared stock pool (Bhandari B03: hold at checkout, timed) ----
  'inventory.reservation.holdMinutes': setting({
    schema: z.int().min(1).max(1440),
    // Bhandari B03: 15 minutes for a guest, 20 signed in.
    default: 15,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.holdMinutes.label',
    helpKey: 'inventory.reservation.holdMinutes.help',
    isOwnerData: false,
    sortOrder: 100,
    version: V11,
  }),
  'inventory.reservation.holdMinutesSignedIn': setting({
    schema: z.int().min(1).max(1440),
    default: 20,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.holdMinutesSignedIn.label',
    helpKey: 'inventory.reservation.holdMinutesSignedIn.help',
    isOwnerData: false,
    sortOrder: 110,
    version: V11,
  }),
  'inventory.reservation.abandonMinutes': setting({
    schema: z.int().min(1).max(1440),
    default: 15,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.abandonMinutes.label',
    helpKey: 'inventory.reservation.abandonMinutes.help',
    isOwnerData: false,
    sortOrder: 120,
    version: V11,
  }),
  'inventory.reservation.convertedHoldHours': setting({
    schema: z.int().min(1).max(24 * 14),
    // Bhandari B03: an order's hold continues until the ERP has the order, at most a day.
    default: 24,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.convertedHoldHours.label',
    helpKey: 'inventory.reservation.convertedHoldHours.help',
    isOwnerData: false,
    sortOrder: 130,
    version: V11,
  }),
  'inventory.reservation.maxUnitsPerLine': setting({
    schema: z.int().min(1).max(10_000),
    default: 20,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.maxUnitsPerLine.label',
    helpKey: 'inventory.reservation.maxUnitsPerLine.help',
    isOwnerData: false,
    sortOrder: 140,
    version: V11,
  }),
  'inventory.reservation.lockRetries': setting({
    schema: z.int().min(0).max(10),
    default: 3,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.lockRetries.label',
    helpKey: 'inventory.reservation.lockRetries.help',
    isOwnerData: false,
    sortOrder: 150,
    version: V11,
  }),
  'inventory.reservation.sweepSeconds': setting({
    schema: z.int().min(5).max(3600),
    default: 60,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.sweepSeconds.label',
    helpKey: 'inventory.reservation.sweepSeconds.help',
    isOwnerData: false,
    sortOrder: 160,
    version: V11,
  }),
  'inventory.reservation.batchSize': setting({
    schema: z.int().min(1).max(10_000),
    default: 500,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reservation.batchSize.label',
    helpKey: 'inventory.reservation.batchSize.help',
    isOwnerData: false,
    sortOrder: 170,
    version: V11,
  }),
  // ---- PR 199, 200 · business documents to the ERP: tries and pauses (Bhandari B04: 1 min, 5 min, 15 min, 1 h …) ----
  'erp.push.maxAttempts': setting({
    schema: z.int().min(1).max(100),
    default: 12,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.push.maxAttempts.label',
    helpKey: 'erp.push.maxAttempts.help',
    isOwnerData: false,
    sortOrder: 200,
    version: V11,
  }),
  'erp.push.backoffBaseSeconds': setting({
    schema: z.int().min(1).max(3600),
    default: 60,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.push.backoffBaseSeconds.label',
    helpKey: 'erp.push.backoffBaseSeconds.help',
    isOwnerData: false,
    sortOrder: 210,
    version: V11,
  }),
  'erp.push.backoffMaxSeconds': setting({
    schema: z.int().min(1).max(86_400),
    default: 3600,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.push.backoffMaxSeconds.label',
    helpKey: 'erp.push.backoffMaxSeconds.help',
    isOwnerData: false,
    sortOrder: 220,
    version: V11,
  }),
  'erp.push.batchSize': setting({
    schema: z.int().min(1).max(1000),
    default: 50,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.push.batchSize.label',
    helpKey: 'erp.push.batchSize.help',
    isOwnerData: false,
    sortOrder: 230,
    version: V11,
  }),
  'erp.push.relaySeconds': setting({
    schema: z.int().min(1).max(3600),
    default: 10,
    scope: 'installation',
    valueType: 'INT',
    group: 'erp',
    labelKey: 'erp.push.relaySeconds.label',
    helpKey: 'erp.push.relaySeconds.help',
    isOwnerData: false,
    sortOrder: 240,
    version: V11,
  }),
  // ---- PR 202 · low-stock alerts, raised once on the shared number (A4.4) ----
  'inventory.lowStock.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'inventory',
    labelKey: 'inventory.lowStock.enabled.label',
    helpKey: 'inventory.lowStock.enabled.help',
    isOwnerData: false,
    sortOrder: 300,
    version: V11,
  }),
  'inventory.lowStock.defaultThreshold': setting({
    schema: z.int().min(0).max(100_000),
    // The same "almost out" as the product list (catalogue.admin.lowStockPieces): two pieces or fewer.
    default: 2,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.lowStock.defaultThreshold.label',
    helpKey: 'inventory.lowStock.defaultThreshold.help',
    isOwnerData: false,
    sortOrder: 310,
    version: V11,
  }),
  'inventory.lowStock.skuThresholds': setting({
    schema: skuThresholdsSchema,
    default: {},
    scope: 'installation',
    valueType: 'JSON',
    group: 'inventory',
    labelKey: 'inventory.lowStock.skuThresholds.label',
    helpKey: 'inventory.lowStock.skuThresholds.help',
    isOwnerData: false,
    sortOrder: 320,
    version: V11,
  }),
  'inventory.lowStock.sweepMinutes': setting({
    schema: z.int().min(1).max(1440),
    default: 60,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.lowStock.sweepMinutes.label',
    helpKey: 'inventory.lowStock.sweepMinutes.help',
    isOwnerData: false,
    sortOrder: 330,
    version: V11,
  }),
  // ---- PR 203 · stock audit by barcode ----
  'inventory.audit.reasons': setting({
    schema: auditReasonsSchema,
    default: [
      { key: 'miscount', en: 'Counted wrong before', bn: 'আগে ভুল গোনা হয়েছিল' },
      { key: 'damaged', en: 'Found damaged', bn: 'নষ্ট পাওয়া গেছে' },
      { key: 'missing', en: 'Missing or lost', bn: 'পাওয়া যায়নি বা হারিয়েছে' },
      { key: 'extra', en: 'Extra pieces found', bn: 'বেশি পাওয়া গেছে' },
      { key: 'wrong-label', en: 'Wrong label or barcode', bn: 'ভুল লেবেল বা বারকোড' },
      { key: 'erp-not-updated', en: 'Not entered in the ERP yet', bn: 'ERP-তে এখনো তোলা হয়নি' },
    ],
    scope: 'installation',
    valueType: 'JSON',
    group: 'inventory',
    labelKey: 'inventory.audit.reasons.label',
    helpKey: 'inventory.audit.reasons.help',
    isOwnerData: false,
    sortOrder: 400,
    version: V11,
  }),
  'inventory.audit.requireReason': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'inventory',
    labelKey: 'inventory.audit.requireReason.label',
    helpKey: 'inventory.audit.requireReason.help',
    isOwnerData: false,
    sortOrder: 410,
    version: V11,
  }),
  'inventory.audit.maxLines': setting({
    schema: z.int().min(1).max(100_000),
    default: 5000,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.audit.maxLines.label',
    helpKey: 'inventory.audit.maxLines.help',
    isOwnerData: false,
    sortOrder: 420,
    version: V11,
  }),
  'inventory.audit.maxQuantityPerScan': setting({
    schema: z.int().min(1).max(100_000),
    default: 500,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.audit.maxQuantityPerScan.label',
    helpKey: 'inventory.audit.maxQuantityPerScan.help',
    isOwnerData: false,
    sortOrder: 430,
    version: V11,
  }),
  // ---- PR 204 · the publishing queue follows the ERP's stock ----
  'inventory.publish.recheckAfterPull': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'inventory',
    labelKey: 'inventory.publish.recheckAfterPull.label',
    helpKey: 'inventory.publish.recheckAfterPull.help',
    isOwnerData: false,
    sortOrder: 500,
    version: V11,
  }),
  'inventory.publish.discoverMaxPages': setting({
    schema: z.int().min(1).max(1000),
    default: 20,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.publish.discoverMaxPages.label',
    helpKey: 'inventory.publish.discoverMaxPages.help',
    isOwnerData: false,
    sortOrder: 510,
    version: V11,
  }),
  // ---- PR 207 · the movement report and the check against the ERP ----
  'inventory.report.maxRows': setting({
    schema: z.int().min(10).max(100_000),
    default: 1000,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.report.maxRows.label',
    helpKey: 'inventory.report.maxRows.help',
    isOwnerData: false,
    sortOrder: 600,
    version: V11,
  }),
  'inventory.report.defaultDays': setting({
    schema: z.int().min(1).max(366),
    // The movement report opens on the last month; any other range can be picked on the page.
    default: 30,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.report.defaultDays.label',
    helpKey: 'inventory.report.defaultDays.help',
    isOwnerData: false,
    sortOrder: 605,
    version: V11,
  }),
  'inventory.reconcile.everyHours': setting({
    schema: z.int().min(1).max(24 * 7),
    // Bhandari B04: a full check against the ERP every night.
    default: 24,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.reconcile.everyHours.label',
    helpKey: 'inventory.reconcile.everyHours.help',
    isOwnerData: false,
    sortOrder: 610,
    version: V11,
  }),
  // ---- PR 205 · the sync health panel ----
  'inventory.admin.recentRuns': setting({
    schema: z.int().min(1).max(200),
    default: 10,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.admin.recentRuns.label',
    helpKey: 'inventory.admin.recentRuns.help',
    isOwnerData: false,
    sortOrder: 700,
    version: V11,
  }),
  'inventory.admin.listSize': setting({
    schema: z.int().min(1).max(500),
    default: 20,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.admin.listSize.label',
    helpKey: 'inventory.admin.listSize.help',
    isOwnerData: false,
    sortOrder: 710,
    version: V11,
  }),
  'inventory.admin.lateAfterMinutes': setting({
    schema: z.int().min(1).max(10_080),
    // The health panel marks the stock "late" when the last good pull is older than this.
    default: 30,
    scope: 'installation',
    valueType: 'INT',
    group: 'inventory',
    labelKey: 'inventory.admin.lateAfterMinutes.label',
    helpKey: 'inventory.admin.lateAfterMinutes.help',
    isOwnerData: false,
    sortOrder: 720,
    version: V11,
  }),
};
