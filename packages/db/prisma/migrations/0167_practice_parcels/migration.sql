-- PR 176 (follow-up 375): the practice courier's parcels in the database, so the web app and the worker play the same
-- scripted life on staging (before, each process had its own copy in memory). Only adds a table; MOCK mode only.
-- CreateTable
CREATE TABLE "PracticeParcel" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "merchantRef" TEXT NOT NULL,
    "parcel" JSONB NOT NULL,
    "scenario" TEXT NOT NULL,
    "reached" INTEGER NOT NULL,
    "bookedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PracticeParcel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeParcel_provider_consignmentId_key" ON "PracticeParcel"("provider", "consignmentId");
