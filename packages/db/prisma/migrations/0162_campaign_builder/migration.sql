-- PR 531 (S13) — full campaign control: a platform campaign's schedule as last sent (AdCampaign.startAt, endAt), and
-- new campaigns (or duplicates) written in the shop before they exist on the platform (AdCampaignDraft); a launch always
-- waits for the owner's approval. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "endAt" TIMESTAMPTZ(3),
ADD COLUMN     "startAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "AdCampaignDraft" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adAccountId" UUID NOT NULL,
    "campaignId" UUID,
    "copyOfId" UUID,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "dailyBudgetMinor" INTEGER,
    "currency" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3),
    "endAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "changeRequestId" UUID,
    "adCampaignId" UUID,
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdCampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCampaignDraft_storeId_archivedAt_status_idx" ON "AdCampaignDraft"("storeId", "archivedAt", "status");

-- AddForeignKey
ALTER TABLE "AdCampaignDraft" ADD CONSTRAINT "AdCampaignDraft_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignDraft" ADD CONSTRAINT "AdCampaignDraft_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

