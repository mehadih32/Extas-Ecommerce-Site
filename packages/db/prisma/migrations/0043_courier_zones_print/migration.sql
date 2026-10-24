-- PR 554 (S06; BACKEND-ARCHITECTURE §7.4 `syncZones`; SIM-F-017): the courier zone sync. Each courier's own place list
-- (its cities, the zones of a city, the areas of a zone, by the courier's own ids and names) is kept per courier account
-- in CourierPlace; a place the courier drops is archived, never deleted. CourierZoneSync records each run of the sync
-- (asked by a person or due by the owner's interval) with the walk still to read and its counts. The gazetteer mapping
-- (CourierAreaMapping) gets who made it (the sync's exact-name match or a person), who mapped it, and an archive with its
-- reason when the courier dropped the place, so a booking never sends an id the courier no longer knows.
-- Everything here only adds; no column is changed, renamed or dropped; nothing is deleted.

-- CreateEnum
CREATE TYPE "CourierPlaceLevel" AS ENUM ('CITY', 'ZONE', 'AREA');

-- AlterTable
ALTER TABLE "CourierAreaMapping" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "archivedReason" TEXT,
ADD COLUMN     "mappedById" UUID,
ADD COLUMN     "matchedBy" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'staff';

-- CreateTable
CREATE TABLE "CourierPlace" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "level" "CourierPlaceLevel" NOT NULL,
    "providerId" TEXT NOT NULL,
    "cityId" TEXT,
    "zoneId" TEXT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierZoneSync" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" "AdapterMode",
    "requestedById" UUID,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "cursor" JSONB,
    "stats" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierZoneSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourierPlace_courierAccountId_nameKey_idx" ON "CourierPlace"("courierAccountId", "nameKey");

-- CreateIndex
CREATE INDEX "CourierPlace_courierAccountId_level_cityId_idx" ON "CourierPlace"("courierAccountId", "level", "cityId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierPlace_courierAccountId_level_providerId_key" ON "CourierPlace"("courierAccountId", "level", "providerId");

-- CreateIndex
CREATE INDEX "CourierZoneSync_courierAccountId_createdAt_idx" ON "CourierZoneSync"("courierAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CourierZoneSync_storeId_status_idx" ON "CourierZoneSync"("storeId", "status");

-- AddForeignKey
ALTER TABLE "CourierPlace" ADD CONSTRAINT "CourierPlace_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierPlace" ADD CONSTRAINT "CourierPlace_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierZoneSync" ADD CONSTRAINT "CourierZoneSync_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierZoneSync" ADD CONSTRAINT "CourierZoneSync_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PR 180 (S08; Blueprint B1.5): the print queue and the handover sheet. A print job keeps the parcels it printed, the
-- reason of a reprint, the key of the press (a repeated press is the same job; nothing is counted twice) and what it
-- printed; a handover batch keeps its orders, who handed it over, how many times its sheet was printed and what the
-- sheet showed. Only adds columns and indexes.

-- AlterTable
ALTER TABLE "HandoverBatch" ADD COLUMN     "data" JSONB,
ADD COLUMN     "handedOverById" UUID,
ADD COLUMN     "orderIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "printCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN     "batchId" UUID,
ADD COLUMN     "data" JSONB,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "shipmentIds" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateIndex
CREATE INDEX "HandoverBatch_storeId_courierAccountId_createdAt_idx" ON "HandoverBatch"("storeId", "courierAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_storeId_createdAt_idx" ON "PrintJob"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrintJob_storeId_requestKey_key" ON "PrintJob"("storeId", "requestKey");
