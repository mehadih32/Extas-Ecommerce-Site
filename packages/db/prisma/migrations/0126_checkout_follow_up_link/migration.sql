-- PR 275 (S13, incomplete-order follow-up; SIM-F-026) — the follow-up's link that puts the customer's bag back, and
-- the follow-ups of one unfinished checkout found fast. Additive only: one nullable column and two indexes. Nothing is
-- changed, renamed or dropped.

-- AlterTable
ALTER TABLE "CheckoutDraft" ADD COLUMN "restoreCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutDraft_storeId_restoreCode_key" ON "CheckoutDraft"("storeId", "restoreCode");

-- CreateIndex
CREATE INDEX "RecoveryMessage_storeId_checkoutDraftId_idx" ON "RecoveryMessage"("storeId", "checkoutDraftId");
