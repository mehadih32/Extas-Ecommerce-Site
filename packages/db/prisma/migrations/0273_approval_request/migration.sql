-- PR 703 (S28; admin prototype v5, Settings -> Telegram approvals): urgent items that wait for the owner's OK, decided in the ERP or on Telegram with the PIN. One new table and one enum, nothing else is changed, dropped or rewritten.

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "amountMinor" INTEGER,
    "refType" TEXT,
    "refId" TEXT,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "intent" TEXT,
    "intentAt" TIMESTAMPTZ(3),
    "telegramMessageId" INTEGER,
    "askedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedVia" TEXT,
    "decidedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRequest_storeId_status_createdAt_idx" ON "ApprovalRequest"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_refType_refId_idx" ON "ApprovalRequest"("refType", "refId");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

