-- PR 263 (S13, Blueprint C6.2 point 5) — an audience sent to an ad account keeps the lookalike the platform drew from it
-- and the platform's last refusal in words. Additive only: two nullable columns. Nothing is deleted.

-- AlterTable
ALTER TABLE "AudienceSync" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lookalikeExternalId" TEXT;
