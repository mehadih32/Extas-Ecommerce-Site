-- PR 165, 166 (S07; BACKEND-ARCHITECTURE §6.5.3, §6.5.5, §6.6 S4, S5, S11; SIM-F-001, SIM-F-005, SIM-F-028): the payment
-- model and the COD money path. Everything here only adds:
--   * MoneyStatus (ESTIMATED → PROVISIONAL → RECONCILED → FINAL), shared by payments, COD collections and settlement lines;
--   * Payment: where its money stands, who recorded a payment received outside the checkout, the attempt number, what
--     really came in, why it failed, the reason code of a mismatch, when its status last changed, the staff's note
--     (the old free-text `reconciliationStatus` stays and is no longer written);
--   * CodCollection: what the rider did at the door (delivered, partly delivered, returned with the charge paid,
--     returned, attempt failed) with what we expected him to collect, what he collected and why they differ;
--   * CourierSettlement / CourierSettlementLine: how the payout arrived, the file's hash (one import per file), each
--     line's expected cash and charge, its match with a reason code, the days to settle and how it was resolved; one
--     settled line per parcel and kind.
-- No column is changed, renamed or dropped; nothing is deleted.

-- CreateEnum
CREATE TYPE "MoneyStatus" AS ENUM ('ESTIMATED', 'PROVISIONAL', 'RECONCILED', 'FINAL');

-- CreateEnum
CREATE TYPE "SettlementMatch" AS ENUM ('MATCHED', 'MISMATCH', 'LATE');

-- CreateEnum
CREATE TYPE "CodOutcome" AS ENUM ('DELIVERED', 'PARTIAL', 'RETURNED_CHARGE_PAID', 'RETURNED', 'ATTEMPT_FAILED');

-- CreateEnum
CREATE TYPE "CodCollectionState" AS ENUM ('RECORDED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "mismatchReason" TEXT,
ADD COLUMN     "moneyStatus" "MoneyStatus",
ADD COLUMN     "note" TEXT,
ADD COLUMN     "receivedMinor" INTEGER,
ADD COLUMN     "recordedById" UUID,
ADD COLUMN     "statusAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CourierSettlement" ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "importedById" UUID,
ADD COLUMN     "receivedAccountRef" TEXT,
ADD COLUMN     "receivedAs" TEXT;

-- AlterTable
ALTER TABLE "CourierSettlementLine" ADD COLUMN     "courierStatus" TEXT,
ADD COLUMN     "expectedChargeMinor" INTEGER,
ADD COLUMN     "expectedMinor" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'COD',
ADD COLUMN     "lineNo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "matchState" "SettlementMatch",
ADD COLUMN     "moneyStatus" "MoneyStatus",
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "resolvedById" UUID,
ADD COLUMN     "settleDays" INTEGER;

-- CreateTable
CREATE TABLE "CodCollection" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentId" UUID,
    "outcome" "CodOutcome" NOT NULL,
    "state" "CodCollectionState" NOT NULL DEFAULT 'RECORDED',
    "expectedMinor" INTEGER NOT NULL,
    "collectedMinor" INTEGER NOT NULL,
    "chargeCollectedMinor" INTEGER NOT NULL DEFAULT 0,
    "varianceReason" TEXT,
    "keptItemIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "returnedItemIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "note" TEXT,
    "source" TEXT NOT NULL,
    "recordedById" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "moneyStatus" "MoneyStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "settlementLineId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CodCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodCollection_storeId_orderId_idx" ON "CodCollection"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "CodCollection_storeId_state_occurredAt_idx" ON "CodCollection"("storeId", "state", "occurredAt");

-- CreateIndex
CREATE INDEX "CodCollection_shipmentId_idx" ON "CodCollection"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CodCollection_storeId_idempotencyKey_key" ON "CodCollection"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_storeId_status_createdAt_idx" ON "Payment"("storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourierSettlement_courierAccountId_fileHash_key" ON "CourierSettlement"("courierAccountId", "fileHash");

-- CreateIndex
CREATE INDEX "CourierSettlementLine_settlementId_lineNo_idx" ON "CourierSettlementLine"("settlementId", "lineNo");

-- CreateIndex
CREATE INDEX "CourierSettlementLine_storeId_matchState_idx" ON "CourierSettlementLine"("storeId", "matchState");

-- CreateIndex
CREATE UNIQUE INDEX "CourierSettlementLine_storeId_shipmentId_kind_key" ON "CourierSettlementLine"("storeId", "shipmentId", "kind");

-- AddForeignKey
ALTER TABLE "CodCollection" ADD CONSTRAINT "CodCollection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

