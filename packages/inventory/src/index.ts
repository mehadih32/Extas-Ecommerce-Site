// @extas/inventory — S09 · Inventory & ERP sync, on the generic ERP adapter of @extas/adapters (PR 498):
// - PR 497 the ERP mode switch (erp-mode.ts): our ERP · another ERP · no ERP, per store;
// - PR 499 the ERP-absent guard (guard.ts): which ERP serves a store, and what every ERP-dependent path does without one;
// - PR 194 the sync layer (sync.ts): retry with backoff from settings, the error surface on ErpSyncRun / ErpSyncState;
// - PR 195 the stock pull per SKU / colour / size (stock-pull.ts) and the stock views (stock.ts);
// - PR 196 company and warehouse mapping per store (mapping.ts);
// - PR 201 warehouses and locations with the damaged bin (locations.ts);
// - background jobs for the BullMQ worker (jobs.ts).
// Every service takes the database, a settings reader and the connection layer, checks the permission itself and
// writes the audit log in the same transaction. The admin API is apps/web/src/app/api/admin/inventory.
export * from './errors';
export * from './context';
export * from './erp-mode';
export * from './guard';
export * from './sync';
export * from './locations';
export * from './stock';
export * from './mapping';
export * from './stock-pull';
export * from './jobs';
