-- PR 65 (S02; SIM-F-008, Blueprint D3.16): product reviews reach a real moderation state and carry what the buyer
-- actually said. Only columns and indexes are added, every column nullable or with a default, so every review that
-- already exists stays exactly as it is. Nothing is dropped, rewritten or deleted.
--
-- WHAT THE COLUMNS ARE FOR
-- * orderId, sizeLabel, colourName: the order and the line's own snapshot, so a review says "bought L, Navy" from what
--   the order stored, never from the product as it is today.
-- * source: CUSTOMER (My account), STAFF (the shop entered it, D3.16) or IMPORT (a file).
-- * fitVerdict, heightCm, weightKg: the buyer's own words on the size and his body, only when he gave them. PR 59's
--   Find My Size learning reads them (`catalogue.sizeAdvice.train.useReviews`), and so will T3's fit bar.
-- * moderatedById, moderatedAt, hiddenReason: who checked the review, when, and why it was hidden or refused.
-- * rewardWalletEntryId, rewardAmountMinor, rewardedAt: the photo-review reward, once a member of staff approved it.
--   The money itself is one WalletEntry in the existing ledger; these columns only point at it, so one review can
--   never be paid twice (`reviews.photoReward` is off with no amount until the owner sets his own).

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "colourName" TEXT,
ADD COLUMN     "fitVerdict" TEXT,
ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "hiddenReason" TEXT,
ADD COLUMN     "moderatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "moderatedById" UUID,
ADD COLUMN     "orderId" UUID,
ADD COLUMN     "rewardAmountMinor" INTEGER,
ADD COLUMN     "rewardWalletEntryId" UUID,
ADD COLUMN     "rewardedAt" TIMESTAMPTZ(3),
ADD COLUMN     "sizeLabel" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "weightKg" INTEGER;

-- CreateIndex
CREATE INDEX "Review_storeId_status_createdAt_idx" ON "Review"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_storeId_orderItemId_idx" ON "Review"("storeId", "orderItemId");
