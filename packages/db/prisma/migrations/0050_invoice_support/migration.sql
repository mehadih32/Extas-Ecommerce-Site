-- PR 407 (S20; B2.1): the customer invoice is issued once per order and kept. Each invoice row holds its printed
-- number (it never changes), a fingerprint of the order content it shows, the content as issued, and the order's last
-- change it was compared with. A new version (same number) is made only when the order itself is edited; a payment or a
-- delivery never makes one. The invoice job finds changed orders through a new index on the order's last change, and
-- each invoice row points at its order. Nothing here moves money. Everything is added; nothing is dropped.

-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN     "checkedAt" TIMESTAMPTZ(3),
ADD COLUMN     "data" JSONB,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "number" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedDocument_storeId_kind_createdAt_idx" ON "GeneratedDocument"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_storeId_kind_orderId_version_key" ON "GeneratedDocument"("storeId", "kind", "orderId", "version");

-- CreateIndex
CREATE INDEX "idx_order_updated" ON "Order"("storeId", "updatedAt");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
