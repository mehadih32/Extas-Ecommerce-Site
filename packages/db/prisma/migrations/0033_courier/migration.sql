-- PR 175 (S08; BACKEND-ARCHITECTURE §6.5.2, §7.4, §7.7; SIM-F-017, SIM-F-027): the courier adapter framework. The parcel
-- gets the courier's exception states (a failed delivery try, an address problem, lost, damaged) and the booking as it
-- was sent (the adapter's mode, so a practice parcel is never a real cost; the try number and the shop's reference the
-- courier knows it by; the declared value; the courier's own zone ids; the receiver and the note sent; why a booking
-- failed; the latest exception reason; when tracking last read it; who booked it). A courier event keeps the courier's
-- own event id (one event is stored once), the exception reason, where it came from and what the courier sent with it.
-- Everything is added; nothing is dropped, renamed or removed. ShipmentEvent stays append-only (0010_append_only).

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'ATTEMPT_FAILED';
ALTER TYPE "ShipmentStatus" ADD VALUE 'ADDRESS_PROBLEM';
ALTER TYPE "ShipmentStatus" ADD VALUE 'LOST';
ALTER TYPE "ShipmentStatus" ADD VALUE 'DAMAGED';

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "bookedById" UUID,
ADD COLUMN     "bookingError" TEXT,
ADD COLUMN     "bookingNote" TEXT,
ADD COLUMN     "courierAreaId" TEXT,
ADD COLUMN     "courierCityId" TEXT,
ADD COLUMN     "courierZoneId" TEXT,
ADD COLUMN     "declaredValueMinor" INTEGER,
ADD COLUMN     "exceptionKey" TEXT,
ADD COLUMN     "lastTrackedAt" TIMESTAMPTZ(3),
ADD COLUMN     "merchantRef" TEXT,
ADD COLUMN     "mode" "AdapterMode",
ADD COLUMN     "receiver" JSONB;

-- AlterTable
ALTER TABLE "ShipmentEvent" ADD COLUMN     "actorId" UUID,
ADD COLUMN     "data" JSONB,
ADD COLUMN     "providerEventId" TEXT,
ADD COLUMN     "reasonKey" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'courier';

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_providerEventId_key" ON "ShipmentEvent"("shipmentId", "providerEventId");
