-- PR 171, 172, 174 (S07; BACKEND-ARCHITECTURE §6.5.3, §6.5.4, §7.7; SIM-F-028, SIM-F-041, SIM-F-054): the wallet ledger,
-- refunds and the gateway statements. One migration for the three, written with PR 171 (the number reserved for this
-- batch). A wallet entry may name the entry it reverses (a correction is a new entry the other way, never an edit; an
-- entry is reversed once). A refund keeps the requester's note, the approver's decision, who paid it out and how (the
-- wallet entry, or the reference of money a person sent back by hand) and why a payout failed. A gateway statement
-- keeps its reference, its file's hash (the same file twice is one statement), who imported it and its own totals; each
-- line its row, its kind (money in or money back), what we expected, the reason of every mismatch and how a person
-- resolved it; a payment is on one line per kind. Everything is added; nothing is dropped, renamed or removed.
-- WalletEntry stays append-only (0010_append_only).

-- AlterTable
ALTER TABLE "WalletEntry" ADD COLUMN     "reversesEntryId" UUID;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "decidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "executedById" UUID,
ADD COLUMN     "failureNote" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "payoutReference" TEXT,
ADD COLUMN     "walletEntryId" UUID;

-- AlterTable
ALTER TABLE "GatewayStatement" ADD COLUMN     "feesMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "importedById" UUID,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "totalMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GatewayStatementLine" ADD COLUMN     "expectedMinor" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
ADD COLUMN     "lineNo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "resolvedById" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_reversesEntryId_key" ON "WalletEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "WalletEntry_storeId_reason_createdAt_idx" ON "WalletEntry"("storeId", "reason", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_storeId_status_createdAt_idx" ON "Refund"("storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayStatement_storeId_provider_fileHash_key" ON "GatewayStatement"("storeId", "provider", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayStatement_storeId_provider_reference_key" ON "GatewayStatement"("storeId", "provider", "reference");

-- CreateIndex
CREATE INDEX "GatewayStatementLine_storeId_providerTrxId_idx" ON "GatewayStatementLine"("storeId", "providerTrxId");

-- CreateIndex
CREATE INDEX "GatewayStatementLine_storeId_matchStatus_idx" ON "GatewayStatementLine"("storeId", "matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayStatementLine_storeId_matchedPaymentId_kind_key" ON "GatewayStatementLine"("storeId", "matchedPaymentId", "kind");

