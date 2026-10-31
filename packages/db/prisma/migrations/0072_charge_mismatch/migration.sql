-- PR 564 (S08, SIM-F-003; Blueprint §60.13): the charge mismatch log is built — the skeleton's ChargeMismatch gains the
-- parcel (one row per parcel), the courier, the band it read, the shop's charge of both bands, a free delivery, the
-- courier's charge that showed it, the weight and where the charge was read. Its rows are never edited or deleted, so
-- the table is locked append-only like the other ledgers (0010). Only adds nullable columns, one index and two
-- triggers; nothing existing changes (nothing ever wrote this table before).

-- AlterTable
ALTER TABLE "ChargeMismatch" ADD COLUMN "shipmentId" UUID,
ADD COLUMN "courierAccountId" UUID,
ADD COLUMN "courierBandKey" TEXT,
ADD COLUMN "chargedBandMinor" INTEGER,
ADD COLUMN "courierBandMinor" INTEGER,
ADD COLUMN "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "courierChargeMinor" INTEGER,
ADD COLUMN "weightGrams" INTEGER,
ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChargeMismatch_shipmentId_key" ON "ChargeMismatch"("shipmentId");

-- HAND-WRITTEN: a recorded case is never changed or removed, so the log is locked like the other ledgers
-- (schema-meta APPEND_ONLY_LOCKED).
REVOKE UPDATE, DELETE, TRUNCATE ON "ChargeMismatch" FROM extas_app;
CREATE TRIGGER "ChargeMismatch_append_only" BEFORE UPDATE OR DELETE ON "ChargeMismatch" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ChargeMismatch_no_truncate" BEFORE TRUNCATE ON "ChargeMismatch" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
