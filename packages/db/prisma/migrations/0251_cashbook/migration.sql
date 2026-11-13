-- PR 687 (S28, admin prototype v5) — the cashbook: accounts and append-only money entries (a wrong entry is reversed, never edited). Additive only; nothing is sent or moved by these tables.

-- CreateEnum
CREATE TYPE "CashEntryKind" AS ENUM ('OPENING', 'COURIER', 'ONLINE', 'REFUND', 'EXPENSE', 'ADS', 'ERP', 'CAPITAL', 'OWNER_TAKE', 'OTHER_IN', 'OTHER_OUT', 'TRANSFER', 'REVERSAL');

-- CreateTable
CREATE TABLE "CashAccount" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "accountId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" "CashEntryKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT,
    "transferId" UUID,
    "reversesId" UUID,
    "reason" TEXT,
    "requestKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_storeId_key_key" ON "CashAccount"("storeId", "key");

-- CreateIndex
CREATE INDEX "CashEntry_storeId_accountId_day_idx" ON "CashEntry"("storeId", "accountId", "day");

-- CreateIndex
CREATE INDEX "CashEntry_storeId_day_idx" ON "CashEntry"("storeId", "day");

-- CreateIndex
CREATE INDEX "CashEntry_transferId_idx" ON "CashEntry"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_storeId_requestKey_key" ON "CashEntry"("storeId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_reversesId_key" ON "CashEntry"("reversesId");

-- AddForeignKey
ALTER TABLE "CashAccount" ADD CONSTRAINT "CashAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
