-- PR 1040 (S28, final round D14, Finance > Costs) — advance / bonus / deduction rows on a person's pay, and the history of
-- every change of a monthly cost head or salary. Additive only: two new tables, nothing changed or dropped. Both are
-- append-only at the database (a row is never edited or deleted; a correction is a new row).

-- CreateTable
CREATE TABLE "StaffPayRow" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "personId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT,
    "cashRequestKey" TEXT,
    "accountKey" TEXT,
    "reversesId" UUID,
    "enteredById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPayRow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffPayRow_kind_check" CHECK ("kind" IN ('ADVANCE', 'BONUS', 'DEDUCTION')),
    CONSTRAINT "StaffPayRow_amount_check" CHECK ("amountMinor" > 0)
);

-- CreateTable
CREATE TABLE "FixedCostChange" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "headId" TEXT NOT NULL,
    "headName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "oldMinor" INTEGER,
    "newMinor" INTEGER NOT NULL,
    "note" TEXT,
    "changedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedCostChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayRow_reversesId_key" ON "StaffPayRow"("reversesId");
CREATE INDEX "StaffPayRow_storeId_month_personId_idx" ON "StaffPayRow"("storeId", "month", "personId");
CREATE INDEX "FixedCostChange_storeId_headId_createdAt_idx" ON "FixedCostChange"("storeId", "headId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffPayRow" ADD CONSTRAINT "StaffPayRow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffPayRow" ADD CONSTRAINT "StaffPayRow_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StaffPayRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedCostChange" ADD CONSTRAINT "FixedCostChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only (the standard lock, packages/db/src/schema-meta.ts APPEND_ONLY_LOCKED): no edit, no delete, no truncate.
REVOKE UPDATE, DELETE, TRUNCATE ON "StaffPayRow" FROM extas_app;
CREATE TRIGGER "StaffPayRow_append_only" BEFORE UPDATE OR DELETE ON "StaffPayRow" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "StaffPayRow_no_truncate" BEFORE TRUNCATE ON "StaffPayRow" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON "FixedCostChange" FROM extas_app;
CREATE TRIGGER "FixedCostChange_append_only" BEFORE UPDATE OR DELETE ON "FixedCostChange" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "FixedCostChange_no_truncate" BEFORE TRUNCATE ON "FixedCostChange" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
