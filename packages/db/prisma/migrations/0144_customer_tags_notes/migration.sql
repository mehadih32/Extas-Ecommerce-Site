-- PR 297 (customer tags and internal notes): a tag taken off a customer is archived, never deleted, with who put it on;
-- a customer's notes and a tag's customers are read by index.
ALTER TABLE "CustomerTagLink" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
ALTER TABLE "CustomerTagLink" ADD COLUMN "addedById" UUID;
CREATE INDEX "CustomerTagLink_storeId_tagId_idx" ON "CustomerTagLink"("storeId", "tagId");
CREATE INDEX "CustomerNote_storeId_customerId_createdAt_idx" ON "CustomerNote"("storeId", "customerId", "createdAt");
