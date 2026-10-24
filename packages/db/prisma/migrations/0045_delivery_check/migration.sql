-- PR 525 (S08; SIM-F-005, SIM-F-028): the true-delivery check. A parcel the courier calls "Delivered" while the shop's
-- own records say it came back (only the delivery charge was paid, the door record says returned, the courier's
-- statement line, the return received at the shop) gets one check row per parcel, with the signs found and what the
-- courier reported; a person resolves it (really delivered / came back with the charge paid / came back). Nothing here
-- moves money or changes COD. Everything is added; nothing is dropped, renamed or removed.

-- CreateEnum
CREATE TYPE "DeliveryCheckState" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DeliveryCheckOutcome" AS ENUM ('DELIVERED', 'CHARGE_PAID_RETURN', 'RETURNED');

-- CreateTable
CREATE TABLE "DeliveryCheck" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "customerId" UUID,
    "courierClaim" TEXT NOT NULL,
    "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB,
    "collectedMinor" INTEGER,
    "chargeMinor" INTEGER,
    "state" "DeliveryCheckState" NOT NULL DEFAULT 'OPEN',
    "resolution" "DeliveryCheckOutcome",
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCheck_shipmentId_key" ON "DeliveryCheck"("shipmentId");

-- CreateIndex
CREATE INDEX "DeliveryCheck_storeId_state_createdAt_idx" ON "DeliveryCheck"("storeId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryCheck_storeId_orderId_idx" ON "DeliveryCheck"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "DeliveryCheck_storeId_customerId_idx" ON "DeliveryCheck"("storeId", "customerId");

-- AddForeignKey
ALTER TABLE "DeliveryCheck" ADD CONSTRAINT "DeliveryCheck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
