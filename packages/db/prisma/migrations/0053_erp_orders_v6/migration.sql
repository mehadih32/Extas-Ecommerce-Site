-- PR 610, 611 (CN-028, CN-029 Phase 1, lane Sawdagor; reserved number 0053): orders to the ERP v6. Every new table of
-- these PRs is in 0049_erp_v6; this only adds two columns and an index to the outbox (ErpPush):
--   keyRound   the ERP keeps a 4xx answer against its Idempotency-Key (site-changes-v6 §2.3), so an order it refused for
--              now (409 ACCOUNT_ON_HOLD, INSUFFICIENT_STOCK, NO_SHOP_PRICE) goes again with a new key
--              (`<idempotencyKey>:k<keyRound>`); the row's own key never changes, so a document is still one row;
--   heldReason why a HELD document waits (the refusal, or LINE_WAITING: a shipment behind a short line).
-- Everything here only adds; nothing is changed, renamed, dropped or deleted. In erp.model v5 both stay at their
-- defaults (0, null) and the v5 flow is unchanged.

-- AlterTable
ALTER TABLE "ErpPush" ADD COLUMN     "heldReason" TEXT,
ADD COLUMN     "keyRound" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ErpPush_storeId_status_heldReason_idx" ON "ErpPush"("storeId", "status", "heldReason");
