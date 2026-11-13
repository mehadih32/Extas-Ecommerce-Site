-- PR 704 (S28; admin prototype v5, Orders -> Bulk and corporate): bulk quotes and their delivery batches. Two new tables and two enums, nothing else is changed, dropped or rewritten.

-- CreateEnum
CREATE TYPE "BulkPricing" AS ENUM ('PIECE', 'TIER');

-- CreateEnum
CREATE TYPE "BulkBatchStatus" AS ENUM ('WAITING', 'PACKED', 'SHIPPED', 'DELIVERED');

-- CreateTable
CREATE TABLE "BulkQuote" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "refNo" INTEGER NOT NULL,
    "enquiryId" UUID,
    "company" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "pricing" "BulkPricing" NOT NULL DEFAULT 'PIECE',
    "pieceMinor" INTEGER NOT NULL DEFAULT 0,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "advancePct" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL,
    "unitMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "advanceMinor" INTEGER NOT NULL,
    "note" TEXT,
    "advanceReceivedAt" TIMESTAMPTZ(3),
    "balanceReceivedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BulkQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkBatch" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "quoteId" UUID NOT NULL,
    "no" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL,
    "plannedOn" DATE NOT NULL,
    "status" "BulkBatchStatus" NOT NULL DEFAULT 'WAITING',
    "tracking" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BulkBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkQuote_storeId_createdAt_idx" ON "BulkQuote"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkQuote_enquiryId_idx" ON "BulkQuote"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "BulkQuote_storeId_refNo_key" ON "BulkQuote"("storeId", "refNo");

-- CreateIndex
CREATE INDEX "BulkBatch_storeId_status_idx" ON "BulkBatch"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BulkBatch_quoteId_no_key" ON "BulkBatch"("quoteId", "no");

-- AddForeignKey
ALTER TABLE "BulkQuote" ADD CONSTRAINT "BulkQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkQuote" ADD CONSTRAINT "BulkQuote_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "BulkEnquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkBatch" ADD CONSTRAINT "BulkBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkBatch" ADD CONSTRAINT "BulkBatch_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "BulkQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

