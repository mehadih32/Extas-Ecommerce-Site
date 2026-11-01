-- PR 254 (S13, Blueprint MKT-05) — landing pages are Page rows of kind LANDING with their PageSection rows; a page
-- sells one product. Additive only: a nullable column and an index for the admin list. Nothing is deleted.

-- AlterTable
ALTER TABLE "Page" ADD COLUMN "productId" UUID;

-- CreateIndex
CREATE INDEX "Page_storeId_kind_status_idx" ON "Page"("storeId", "kind", "status");
