-- PR 185–191 (S08; Blueprint B1.8, B1.9, C6; BACKEND-ARCHITECTURE §5.3 ORD-05, §6.5.4 D4; SIM-F-021, SIM-F-022): exchanges,
-- returns and refused parcels. An exchange keeps how it was priced (the old and new piece with their prices then, the
-- tier, the SKU really coming back), its key and version, who decided it, the delivery charge's payer and state, the
-- customer's "your mistake" claim and the staff's waiver, and the wallet credit's refund REQUEST (no money moves). A
-- return gets its place (EXPECTED → RECEIVED → QC_DONE → CLOSED), "our fault", its exchange, its key and who handled
-- it; each returned piece gets the SKU expected and scanned, its disposition (SELLABLE → ERP restock, UNSELLABLE →
-- loss) and where that stands. ReturnKind gains EXCHANGE_PICKUP. RefusedParcelEntry is the refused-parcel list a person
-- decides (never an automatic block). Everything is added; nothing is dropped, renamed or removed.

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('EXPECTED', 'RECEIVED', 'QC_DONE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReturnDisposition" AS ENUM ('SELLABLE', 'UNSELLABLE');

-- CreateEnum
CREATE TYPE "DispositionState" AS ENUM ('ERP_PENDING', 'RESTOCKED', 'ERP_FAILED', 'NO_ERP', 'LOSS_RECORDED');

-- CreateEnum
CREATE TYPE "RefusedListState" AS ENUM ('PROPOSED', 'LISTED', 'DISMISSED', 'REMOVED');

-- AlterEnum
ALTER TYPE "ReturnKind" ADD VALUE 'EXCHANGE_PICKUP';

-- AlterTable
ALTER TABLE "Exchange" ADD COLUMN     "bandKey" TEXT,
ADD COLUMN     "chargePayer" TEXT,
ADD COLUMN     "chargeState" TEXT,
ADD COLUMN     "claimDecidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "claimDecidedById" UUID,
ADD COLUMN     "claimNote" TEXT,
ADD COLUMN     "claimState" TEXT,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "decidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "decidedById" UUID,
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "oneTrip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reasonNote" TEXT,
ADD COLUMN     "refundId" UUID,
ADD COLUMN     "rootCause" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'admin',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "waiveReason" TEXT,
ADD COLUMN     "waivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "waivedById" UUID;

-- AlterTable
ALTER TABLE "ExchangeItem" ADD COLUMN     "newColourName" TEXT,
ADD COLUMN     "newName" TEXT,
ADD COLUMN     "newSizeLabel" TEXT,
ADD COLUMN     "newSku" TEXT,
ADD COLUMN     "newUnitMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "oldSku" TEXT,
ADD COLUMN     "oldUnitMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "oldVariantId" UUID,
ADD COLUMN     "receivedSku" TEXT,
ADD COLUMN     "tier" INTEGER;

-- AlterTable
ALTER TABLE "ReturnItem" ADD COLUMN     "disposition" "ReturnDisposition",
ADD COLUMN     "dispositionState" "DispositionState",
ADD COLUMN     "erpPushId" UUID,
ADD COLUMN     "exchangeItemId" UUID,
ADD COLUMN     "expectedSku" TEXT,
ADD COLUMN     "lossCostEntryId" UUID,
ADD COLUMN     "lossReason" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "photoAssetIds" UUID[],
ADD COLUMN     "qcAt" TIMESTAMPTZ(3),
ADD COLUMN     "qcById" UUID,
ADD COLUMN     "scannedSku" TEXT,
ADD COLUMN     "variantId" UUID;

-- AlterTable
ALTER TABLE "ReturnRecord" ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "closedById" UUID,
ADD COLUMN     "exchangeId" UUID,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "ourFault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receivedById" UUID,
ADD COLUMN     "status" "ReturnStatus" NOT NULL DEFAULT 'EXPECTED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RefusedParcelEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "customerId" UUID,
    "state" "RefusedListState" NOT NULL DEFAULT 'PROPOSED',
    "refusals" INTEGER NOT NULL DEFAULT 0,
    "lastOrderId" UUID,
    "lastReasonCode" TEXT,
    "lastRefusedAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefusedParcelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefusedParcelEntry_storeId_state_lastRefusedAt_idx" ON "RefusedParcelEntry"("storeId", "state", "lastRefusedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefusedParcelEntry_storeId_phone_key" ON "RefusedParcelEntry"("storeId", "phone");

-- CreateIndex
CREATE INDEX "Exchange_storeId_orderId_idx" ON "Exchange"("storeId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_storeId_idempotencyKey_key" ON "Exchange"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_newOrderId_key" ON "Exchange"("newOrderId");

-- CreateIndex
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "ReturnItem_storeId_dispositionState_idx" ON "ReturnItem"("storeId", "dispositionState");

-- CreateIndex
CREATE INDEX "ReturnRecord_storeId_status_idx" ON "ReturnRecord"("storeId", "status");

-- CreateIndex
CREATE INDEX "ReturnRecord_storeId_orderId_idx" ON "ReturnRecord"("storeId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRecord_storeId_idempotencyKey_key" ON "ReturnRecord"("storeId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "RefusedParcelEntry" ADD CONSTRAINT "RefusedParcelEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

