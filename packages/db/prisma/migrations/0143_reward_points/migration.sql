-- PR 296 (rewards and points): each points entry keeps its key (one per delivered order, one per redemption) and the
-- wallet credit a redemption made; the store's newest entries are read by the Loyalty & wallet page.
ALTER TABLE "RewardEntry" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "RewardEntry" ADD COLUMN "walletEntryId" UUID;
CREATE UNIQUE INDEX "RewardEntry_customerId_idempotencyKey_key" ON "RewardEntry"("customerId", "idempotencyKey");
CREATE INDEX "RewardEntry_storeId_createdAt_idx" ON "RewardEntry"("storeId", "createdAt");
