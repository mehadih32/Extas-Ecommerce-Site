-- PR 671 (S28, CN-048, admin prototype v5) — payouts asked of a courier through the courier's own payment-request feature.
-- Additive only: one new table with its indexes and keys; nothing existing is changed, dropped or renamed. The feature ships
-- off (`delivery.courier.payouts.enabled`), so the table stays empty until the owner turns it on.
-- CreateTable
CREATE TABLE "CourierPayout" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "providerRef" TEXT,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "mode" TEXT NOT NULL DEFAULT 'MOCK',
    "amountMinor" INTEGER NOT NULL,
    "coveredMinor" INTEGER NOT NULL DEFAULT 0,
    "paidMinor" INTEGER,
    "paymentRef" TEXT,
    "method" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "rawStatus" TEXT,
    "note" TEXT,
    "differenceMinor" INTEGER,
    "shipmentIds" JSONB NOT NULL DEFAULT '[]',
    "settlementId" UUID,
    "settledAt" TIMESTAMPTZ(3),
    "settleError" TEXT,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" UUID,
    "requestKey" TEXT,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierPayout_storeId_courierAccountId_requestedAt_idx" ON "CourierPayout"("storeId", "courierAccountId", "requestedAt");

-- CreateIndex
CREATE INDEX "CourierPayout_storeId_state_idx" ON "CourierPayout"("storeId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "CourierPayout_storeId_requestKey_key" ON "CourierPayout"("storeId", "requestKey");

-- AddForeignKey
ALTER TABLE "CourierPayout" ADD CONSTRAINT "CourierPayout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierPayout" ADD CONSTRAINT "CourierPayout_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
