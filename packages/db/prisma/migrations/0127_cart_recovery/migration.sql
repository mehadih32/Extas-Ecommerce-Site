-- PR 276 (S13, abandoned-cart recovery with the offer rules) — a left bag's recovery count (two messages at most,
-- claimed under compare-and-set), the code of its link that puts the bag back, and a bag's recovery messages found
-- fast. Additive only: two columns (one with a default) and two indexes. Nothing is changed, renamed or dropped.

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "recoveryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "restoreCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_storeId_restoreCode_key" ON "Cart"("storeId", "restoreCode");

-- CreateIndex
CREATE INDEX "RecoveryMessage_storeId_cartId_idx" ON "RecoveryMessage"("storeId", "cartId");
