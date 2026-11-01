-- PR 289: automations (customer journeys) — one enrolment per person per start, and why one ended early.
ALTER TABLE "JourneyEnrollment" ADD COLUMN "triggerRef" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JourneyEnrollment" ADD COLUMN "reason" TEXT;
CREATE UNIQUE INDEX "JourneyEnrollment_journeyId_customerId_triggerRef_key" ON "JourneyEnrollment"("journeyId", "customerId", "triggerRef");
CREATE INDEX "JourneyEnrollment_storeId_customerId_idx" ON "JourneyEnrollment"("storeId", "customerId");
