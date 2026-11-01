-- PR 256 (S13, Blueprint C6.2, demo 93-admin-ads.js "New campaign · draft") — a campaign's audience, offer, creative,
-- window and budget. Additive only: three columns and an index for the admin list. Nothing is deleted. The budget is a
-- plan kept here; no ad platform's budget is changed by it.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "budgetKind" TEXT,
ADD COLUMN     "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "creative" JSONB;

-- CreateIndex
CREATE INDEX "Campaign_storeId_status_idx" ON "Campaign"("storeId", "status");
