-- PR 684 (S28 Admin v5) — demo (sample) products. Additive only: a new column with a default, and an index.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Product_storeId_isDemo_idx" ON "Product"("storeId", "isDemo");
