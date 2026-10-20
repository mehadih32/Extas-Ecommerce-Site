// S09 · PR 194, 195, 196, 201, 497, 498, 499 — the ERP sync and the stock locations (Blueprint A3, A4.4; ERP ↔ shop
// API contract, CN-005). How long the shop waits for the ERP, how often and how hard it tries again, how big a page
// is, how often stock is polled, which ERP mode a store starts in, which stock locations every warehouse gets (the
// damaged bin among them) and which kinds of location the shop may sell from — all here, never in code.
// Labels: messages/inventory.<lang>.json. Registry version 10.
//
// The ERP's address, key and webhook secret are not settings: the address is on the connection row and the key and
// secret are in the vault (PR 493, 500). A store's company and warehouse mapping is the owner's data (StoreErpMapping,
// Store.erpCompanyId — PR 509), not a setting either.
import { z } from 'zod';
import { setting } from './define';

const V = 10;

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
};
