-- PR 66 follow-up 183 (S02) — "Ask a question" on the product page: a guest's question carries his address, hashed,
-- only so a day's limit can be counted (as BlogComment.fromHash, PR 251). Null for a signed-in customer's question
-- and on every earlier row. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "ProductQuestion" ADD COLUMN     "fromHash" TEXT;

-- CreateIndex
CREATE INDEX "ProductQuestion_fromHash_createdAt_idx" ON "ProductQuestion"("fromHash", "createdAt");

-- CreateIndex
CREATE INDEX "ProductQuestion_customerId_createdAt_idx" ON "ProductQuestion"("customerId", "createdAt");
