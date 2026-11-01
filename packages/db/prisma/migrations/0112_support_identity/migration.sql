-- PR 427 (S22, B4.5, B4.14 item 3, CN-031 lane C): identity resolution in the Support inbox — one person across channels.
-- Additive: one nullable column and two indexes. `identityFixedAt`: an employee set this chat's person by hand (linked a
-- number or a customer, unlinked one, or said "not the same person"); automatic matching never changes it again.
ALTER TABLE "SupportContact" ADD COLUMN "identityFixedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "SupportContact_storeId_customerId_idx" ON "SupportContact"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "SupportContact_storeId_mergedIntoId_idx" ON "SupportContact"("storeId", "mergedIntoId");
