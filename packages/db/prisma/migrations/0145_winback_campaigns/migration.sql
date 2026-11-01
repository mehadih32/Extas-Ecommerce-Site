-- PR 300: win-back campaigns (Messages › Campaigns) — a Broadcast's ready-made type and its audience rule as saved.
ALTER TABLE "Broadcast" ADD COLUMN "kind" TEXT;
ALTER TABLE "Broadcast" ADD COLUMN "rule" JSONB;
CREATE INDEX "Broadcast_storeId_kind_createdAt_idx" ON "Broadcast"("storeId", "kind", "createdAt");
