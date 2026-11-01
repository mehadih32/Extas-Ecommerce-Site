-- PR 434 (S22, B4.12, B4.14 item 10, CN-031 lane C): the support block list — three columns and one index.
-- Additive: a chat's person (SupportContact) can be on the support block list since a time, by a person, for a reason;
-- nothing is deleted, and taking them off clears the three. The inbox reads the blocked people of a store.

-- AlterTable
ALTER TABLE "SupportContact" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMPTZ(3),
ADD COLUMN     "blockedById" UUID;

-- CreateIndex
CREATE INDEX "SupportContact_storeId_blockedAt_idx" ON "SupportContact"("storeId", "blockedAt");
