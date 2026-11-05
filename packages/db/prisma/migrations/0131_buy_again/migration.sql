-- PR 622 (S04, CN-034, CN-031 lane C): "Buy again" on a past order. The bag remembers the past order whose "Buy
-- again" last filled it; the order placed from that bag carries it as "bought again from #…" (staff see it, reports
-- count it). Additive: two nullable columns and one index.

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "reorderFromOrderId" UUID;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "reorderOfOrderId" UUID;

-- CreateIndex
CREATE INDEX "Order_storeId_reorderOfOrderId_idx" ON "Order"("storeId", "reorderOfOrderId");
