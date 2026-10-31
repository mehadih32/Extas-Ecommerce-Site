-- PR 192 (S08, SIM-F-017, CN-018 (7)): courier claims (a lost or damaged parcel, the exact extra a rider took, other)
-- and rider issues (a customer's overcharge complaint with its proof, approved or rejected by a person). Records only:
-- nothing here pays anyone; a refund of a rider's extra goes through the refunds' own approval (PR 172). Only adds two
-- tables, three enums and their indexes; nothing existing changes.

-- CreateEnum
CREATE TYPE "CourierClaimKind" AS ENUM ('LOST', 'DAMAGED', 'RIDER_OVERCHARGE', 'OTHER');

-- CreateEnum
CREATE TYPE "CourierClaimState" AS ENUM ('OPEN', 'SENT', 'SETTLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiderIssueState" AS ENUM ('LOGGED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CourierClaim" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentId" UUID,
    "kind" "CourierClaimKind" NOT NULL,
    "status" "CourierClaimState" NOT NULL DEFAULT 'OPEN',
    "claimedMinor" INTEGER NOT NULL,
    "settledMinor" INTEGER,
    "courierRef" TEXT,
    "note" TEXT,
    "riderIssueId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "raisedById" UUID,
    "decidedById" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderIssue" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "chargedMinor" INTEGER NOT NULL,
    "dueMinor" INTEGER NOT NULL,
    "extraMinor" INTEGER NOT NULL,
    "proofMediaIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "words" TEXT NOT NULL,
    "status" "RiderIssueState" NOT NULL DEFAULT 'LOGGED',
    "decisionNote" TEXT,
    "claimId" UUID,
    "refundId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "loggedById" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiderIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierClaim_storeId_status_createdAt_idx" ON "CourierClaim"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CourierClaim_courierAccountId_status_idx" ON "CourierClaim"("courierAccountId", "status");

-- CreateIndex
CREATE INDEX "CourierClaim_shipmentId_idx" ON "CourierClaim"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierClaim_storeId_idempotencyKey_key" ON "CourierClaim"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RiderIssue_storeId_status_createdAt_idx" ON "RiderIssue"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RiderIssue_orderId_idx" ON "RiderIssue"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RiderIssue_storeId_idempotencyKey_key" ON "RiderIssue"("storeId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "CourierClaim" ADD CONSTRAINT "CourierClaim_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderIssue" ADD CONSTRAINT "RiderIssue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One open claim (OPEN or SENT) per parcel and kind, and one open complaint (LOGGED or APPROVED) per parcel: a double
-- tap or two people at once cannot raise the same money twice. Partial (the Prisma schema cannot say "WHERE"), so it
-- lives here only.
CREATE UNIQUE INDEX "CourierClaim_open_key" ON "CourierClaim"("shipmentId", "kind") WHERE "status" IN ('OPEN', 'SENT') AND "shipmentId" IS NOT NULL;
CREATE UNIQUE INDEX "RiderIssue_open_key" ON "RiderIssue"("shipmentId") WHERE "status" IN ('LOGGED', 'APPROVED');
