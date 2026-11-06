-- PR 251 (S12) — comments on articles, or the journal without comments (`blog.comments`, off as shipped): a comment's
-- status before its last change (Undo puts it back), who decided and when, a guest's hashed address for the day's limit,
-- and the indexes the Comments page and the article page read with. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "BlogComment" ADD COLUMN     "decidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "decidedById" UUID,
ADD COLUMN     "fromHash" TEXT,
ADD COLUMN     "prevStatus" "ReviewStatus";

-- CreateIndex
CREATE INDEX "BlogComment_storeId_status_createdAt_idx" ON "BlogComment"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BlogComment_postId_status_createdAt_idx" ON "BlogComment"("postId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BlogComment_customerId_createdAt_idx" ON "BlogComment"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "BlogComment_fromHash_createdAt_idx" ON "BlogComment"("fromHash", "createdAt");
