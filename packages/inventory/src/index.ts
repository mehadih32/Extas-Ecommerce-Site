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
// - CN-028 · PR 617, 618: what Retail sends the ERP — the daily summary (books-summary.ts), the fixed costs and the extra
//   cost lines (books-costs.ts), their exact rules (books-rules.ts) and the Books status card (books-status.ts);
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
export * from './erp-shipments-v6';
export * from './erp-v6-relay';
// PR 615 (CN-028): Retail's ERP account ledger (append-only, hash-chained), the pipeline stock, "paid to ERP", the
// account check with the statement catch-up (follow-up 490), and what Money → Books → ERP account shows.
export * from './books-errors';
export * from './erp-account';
export * from './erp-pipeline';
export * from './erp-account-check';
export * from './erp-account-view';
// PR 616 (CN-028): the books match engine (checks A–F, the day closes and their roll-ups), the owner's closes and PIN,
// corrections by reversal plus a new entry, and what Money → Books shows (the shapes Hisabi reads are in books-view.ts).
export * from './books-match';
export * from './books-close';
export * from './books-adjust';
export * from './books-view';
// PR 609 (CN-028): import from the ERP by style code, and the buying price with its change flag.
export * from './erp-import';
export * from './shop-price';
// PR 620 (CN-028): the ERP's own signed calls to the shop (who is asking, and the log of every call).
export * from './erp-site-calls';
export * from './guard';
// CN-028 · PR 617, 618: the daily summary, the fixed costs and the Books status card.
export * from './books-rules';
export * from './books-summary';
export * from './books-status';
export * from './books-costs';
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
// PR 612–614 (CN-029 Phase 1): returns and exchanges with the store's own ERP in contract v6.
export * from './erp-returns-v6';
// CN-028 · PR 619 — the switch-over to ERP contract v6 and the per-store ERP link page's state.
export * from './erp-switchover';
