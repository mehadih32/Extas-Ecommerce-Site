-- PR 284 (S14; BACKEND-ARCHITECTURE §5.5 CUS-02, CUS-05; Blueprint B5.5): one customer record keyed by phone, and the
-- merge of two profiles of one person. A merged profile names its survivor (Customer.mergedIntoId, mergedAt); the
-- survivor's single view shows both. Nothing moves: orders, wallets, notes and sign-ins stay on their own profile, so a
-- split is exact. CustomerMerge keeps every decision — MERGED (undone by a split, which records who split it and why) or
-- NOT_SAME (the pair is never suggested again). Everything here only adds; nothing is changed, renamed or dropped.

-- CreateEnum
CREATE TYPE "CustomerMergeDecision" AS ENUM ('MERGED', 'NOT_SAME');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "mergedAt" TIMESTAMPTZ(3),
ADD COLUMN     "mergedIntoId" UUID;

-- CreateTable
CREATE TABLE "CustomerMerge" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "decision" "CustomerMergeDecision" NOT NULL,
    "survivorId" UUID NOT NULL,
    "mergedId" UUID NOT NULL,
    "signals" TEXT[],
    "note" TEXT,
    "decidedById" UUID,
    "idempotencyKey" TEXT,
    "undoneAt" TIMESTAMPTZ(3),
    "undoneById" UUID,
    "undoNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerMerge_storeId_survivorId_idx" ON "CustomerMerge"("storeId", "survivorId");

-- CreateIndex
CREATE INDEX "CustomerMerge_storeId_mergedId_idx" ON "CustomerMerge"("storeId", "mergedId");

-- CreateIndex
CREATE INDEX "CustomerMerge_storeId_decision_createdAt_idx" ON "CustomerMerge"("storeId", "decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMerge_storeId_idempotencyKey_key" ON "CustomerMerge"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Customer_storeId_mergedIntoId_idx" ON "Customer"("storeId", "mergedIntoId");

-- AddForeignKey
ALTER TABLE "CustomerMerge" ADD CONSTRAINT "CustomerMerge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

