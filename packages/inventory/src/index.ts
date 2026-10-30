// @extas/inventory — S09 · Inventory & ERP sync, on the generic ERP adapter of @extas/adapters (PR 498):
// - PR 497 the ERP mode switch (erp-mode.ts): our ERP · another ERP · no ERP, per store;
// - PR 499 the ERP-absent guard (guard.ts): which ERP serves a store, and what every ERP-dependent path does without one;
// - PR 194 the sync layer (sync.ts): retry with backoff from settings, the error surface on ErpSyncRun / ErpSyncState;
// - PR 195 the stock pull per SKU / colour / size (stock-pull.ts) and the stock views (stock.ts);
// - PR 196 company and warehouse mapping per store (mapping.ts);
// - PR 197, 198 one global hold on the shared pool with row locking (reservations.ts); PR 127 (S04) the pieces of a
//   line added to a placed order, held and let go on the same pool (order-units.ts);
// - PR 199, 200 business documents to the ERP through an idempotent outbox (erp-push.ts);
// - PR 201 warehouses and locations with the damaged bin (locations.ts);
// - PR 202 low-stock alerts on the shared number (low-stock.ts); follow-up 16: a balance below zero is shown as it is
//   and raises shortage cards that block booking until a person decides (shortage.ts);
// - PR 203 the stock count by barcode (stock-audit.ts);
// - PR 204 the publishing queue driven by ERP stock (publish-queue.ts);
// - PR 205 the sync health panel (sync-health.ts); PR 206 manual re-sync (resync.ts);
// - PR 207 the stock movement report and the reconciliation with the ERP (movements.ts);
// - PR 196 the ERP → shop webhooks: verified, stored once, applied by the worker (webhook.ts);
// - background jobs for the BullMQ worker (jobs.ts).
// Every service takes the database, a settings reader and the connection layer, checks the permission itself and
// writes the audit log in the same transaction. The admin API is apps/web/src/app/api/admin/inventory.
export * from './errors';
export * from './context';
export * from './erp-mode';
// PR 607 (CN-028): the ERP contract a store speaks (`erp.model`) and the v5 calls v6 retires.
export * from './erp-model';
// PR 608 (CN-028): the permanent ERP event ledger, its handlers and the hourly pull of returns, exchanges and claims.
export * from './erp-events';
export * from './erp-events-pull';
// CN-029 §16 (PR 607): one ERP link per store (its own connection and keys; a handover starts a new link).
export * from './erp-link';
// PR 610, 611 (CN-028): orders to the ERP v6 (one line per piece, whole-taka prices, the hold and the short line), the
// shipment at pickup and every delivery result, their event handlers and the relay's v6 steps.
export * from './erp-orders-v6';
export * from './erp-orders-v6-events';
export * from './erp-v6-relay';
export * from './guard';
export * from './sync';
export * from './locations';
export * from './stock';
export * from './mapping';
export * from './stock-pull';
export * from './reservations';
export * from './order-units';
export * from './erp-push';
export * from './low-stock';
export * from './shortage';
export * from './stock-audit';
export * from './publish-queue';
export * from './sync-health';
export * from './resync';
export * from './movements';
export * from './jobs';
export * from './webhook';
